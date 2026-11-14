import { Book } from '@/types/book';
import { AppService, BaseDir } from '@/types/system';
import {
  useTransferStore,
  isOwnedByActiveProfile,
  TransferItem,
  ReplicaTransferFile,
} from '@/store/transferStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isReadestCloudStorageActive } from '@/services/sync/cloudSyncProvider';
import { TranslationFunc } from '@/hooks/useTranslation';
import { createProgressThrottle, ProgressHandler, ProgressPayload } from '@/utils/transfer';
import { eventDispatcher } from '@/utils/event';
import { getNetworkKind, type NetworkKind, shouldHoldUpload } from '@/utils/uploadNetwork';
import { isNotOnServerError } from '@/libs/downloadError';
import { askServerWhichAreMissing } from '@/services/serverFileCheck';
import { getTransferMessages, withFailureReason } from './transferMessages';

const TRANSFER_QUEUE_KEY = 'readest_transfer_queue';
const RETRY_DELAY_BASE_MS = 2000;
// Coalesce per-chunk progress emissions to at most ~10/sec per transfer so the
// transfer-store fan-out cannot sustain a synchronous React update storm (a
// buffered download emits progress once per chunk in a microtask burst, and
// transferSpeed changes every call so the store's no-op guard cannot help)
// (Sentry READEST-2).
const PROGRESS_THROTTLE_MS = 100;
// Quota failures in a batch import arrive one per book as transfers drain;
// collapse them into one summary toast per burst instead of N identical toasts.
const QUOTA_TOAST_FLUSH_MS = 1500;
// While uploads wait for Wi-Fi they are looked at again this often, as well as whenever the
// system says the network or the app's visibility changed.
const WIFI_RECHECK_MS = 60_000;
// How long a reading of the network stays good.
const NETWORK_KIND_TTL_MS = 5_000;

interface PersistedQueueData {
  schemaVersion?: number;
  transfers: Record<string, TransferItem>;
  isQueuePaused: boolean;
}

const QUEUE_SCHEMA_VERSION = 1;

class TransferManager {
  private static instance: TransferManager;
  private appService: AppService | null = null;
  private isProcessing = false;
  private abortControllers: Map<string, AbortController> = new Map();
  private isInitialized = false;
  private getLibrary: (() => Book[]) | null = null;
  private updateBook: ((book: Book) => Promise<void>) | null = null;
  private _: TranslationFunc | null = null;
  private settingsUnsub: (() => void) | null = null;
  private quotaFailureCount = 0;
  private quotaToastTimer: ReturnType<typeof setTimeout> | null = null;
  private wifiRecheckTimer: ReturnType<typeof setTimeout> | null = null;
  private networkListenersAdded = false;
  private networkKind: NetworkKind = 'unknown';
  private networkKindAt = 0;
  private refreshingNetwork = false;
  private readyResolve: () => void = () => {};
  private readyPromise: Promise<void> = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });

  private constructor() {}

  /**
   * Settings hydrate asynchronously at app start (`settings` begins as
   * `{}`); `settings.version` truthiness is the loaded signal (same
   * convention as useSync). Before hydration the provider is unknown, so
   * book uploads are deferred rather than judged — acting on unknown
   * settings could both mis-cancel and mis-allow. Replica transfers and
   * downloads are never deferred: they are not provider-gated and the
   * boot-time replica pull relies on waitUntilReady().
   */
  private isSettingsLoaded(): boolean {
    return !!useSettingsStore.getState().settings?.version;
  }

  private isBookUploadAllowed(): boolean {
    return isReadestCloudStorageActive(useSettingsStore.getState().settings);
  }

  /** An upload nobody pressed a button for: an import's (see `queueUpload`'s `manual`). */
  private isAutomaticBookUpload(t: TransferItem): boolean {
    return t.kind === 'book' && t.type === 'upload' && !t.manual;
  }

  /**
   * Read the network again in the background (never more than every few seconds). Deciding
   * stays synchronous, using the last reading; when the reading changes the queue is looked at.
   */
  private refreshNetworkKind(): void {
    if (this.refreshingNetwork || Date.now() - this.networkKindAt < NETWORK_KIND_TTL_MS) return;
    this.refreshingNetwork = true;
    void getNetworkKind()
      .then((kind) => {
        const changed = kind !== this.networkKind;
        this.networkKind = kind;
        this.networkKindAt = Date.now();
        // A tick later, so a pass that is still finishing does not swallow the wake-up.
        if (changed) setTimeout(() => this.processQueue(), 0);
      })
      .finally(() => {
        this.refreshingNetwork = false;
      });
  }

  /** Must automatic uploads wait right now (mobile data, or no network, with Wi-Fi only on)? */
  private automaticUploadsHeld(): boolean {
    const wifiOnly = useSettingsStore.getState().settings?.uploadWifiOnly !== false;
    if (!wifiOnly) return false;
    return shouldHoldUpload({ manual: false, wifiOnly, kind: this.networkKind });
  }

  /**
   * Look again when the network changes, when the app comes back to the front, and (while
   * something is waiting) once a minute. No constant polling: with nothing waiting nothing runs.
   */
  private addNetworkListeners(): void {
    if (this.networkListenersAdded || typeof window === 'undefined') return;
    this.networkListenersAdded = true;
    const wake = () => this.processQueue();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
    (navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener?.(
      'change',
      wake,
    );
  }

  private scheduleWifiRecheck(): void {
    if (this.wifiRecheckTimer) return;
    this.wifiRecheckTimer = setTimeout(() => {
      this.wifiRecheckTimer = null;
      this.processQueue();
    }, WIFI_RECHECK_MS);
  }

  private isDeferredBookUpload(t: TransferItem): boolean {
    return t.kind === 'book' && t.type === 'upload' && !this.isSettingsLoaded();
  }

  /**
   * Cancel pending book uploads when Readest Cloud is not the selected
   * provider. Idempotent (acts on pending rows only) — safe to run on
   * every processQueue pass, which also re-settles rows another window
   * or a rogue retry re-pended. Cancellation is visible ('cancelled'
   * with cancelReason 'policy'), never a silent drop.
   */
  private reconcileUploadsWithProvider(): void {
    if (!this.isSettingsLoaded() || this.isBookUploadAllowed()) return;

    const store = useTransferStore.getState();
    const gated = store
      .getPendingTransfers()
      .filter((t) => t.kind === 'book' && t.type === 'upload');
    if (gated.length === 0) return;

    gated.forEach((t) => {
      store.setTransferStatus(t.id, 'cancelled', undefined, 'policy');
    });
    console.info(
      `[cloudSync] cancelled ${gated.length} pending Readest Cloud upload(s): third-party provider selected`,
    );
    this.persistQueue();
  }

  static getInstance(): TransferManager {
    if (!TransferManager.instance) {
      TransferManager.instance = new TransferManager();
    }
    return TransferManager.instance;
  }

  async initialize(
    appService: AppService,
    getLibrary: () => Book[],
    updateBook: (book: Book) => Promise<void>,
    translationFn: TranslationFunc,
  ): Promise<void> {
    if (this.isInitialized) return;

    this.appService = appService;
    this.getLibrary = getLibrary;
    this.updateBook = updateBook;
    this._ = translationFn;
    await this.loadPersistedQueue();
    this.reconcileUploadsWithProvider();
    // Know the network before the first upload is considered, so nothing slips out on mobile data.
    this.networkKind = await getNetworkKind();
    this.networkKindAt = Date.now();
    this.isInitialized = true;
    this.readyResolve();
    this.addNetworkListeners();

    // Re-gate when settings hydrate or the selected provider changes.
    this.settingsUnsub?.();
    this.settingsUnsub = useSettingsStore.subscribe((state, prev) => {
      if (state.settings === prev.settings) return;
      this.reconcileUploadsWithProvider();
      this.processQueue();
    });

    // Start processing queue
    this.processQueue();
  }

  isReady(): boolean {
    return this.isInitialized && this.appService !== null;
  }

  /**
   * Resolves once `initialize()` has completed. Lets callers that need
   * to enqueue transfers (e.g., the boot-time replica pull) defer until
   * the manager is wired up — the manager only inits after the library
   * is loaded, which can lag well behind app boot.
   */
  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * `manual`: the user pressed an upload button. Uploads that come from adding a book start by
   * themselves and wait for Wi-Fi (unless the user turned that off); a manual one may use mobile
   * data. Pressing Upload on a book already waiting makes it manual.
   */
  queueUpload(book: Book, priority: number = 10, opts: { manual?: boolean } = {}): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }

    // Readest Cloud storage is not written to while a third-party
    // provider is selected. Before settings hydrate the entry is queued
    // and deferred; the reconcile on hydration decides its fate.
    if (this.isSettingsLoaded() && !this.isBookUploadAllowed()) {
      return null;
    }

    const store = useTransferStore.getState();

    // Check if already queued or in progress
    const existing = store.getTransferByBookHash(book.hash, 'upload');
    if (existing) {
      if (opts.manual) {
        store.markManual(existing.id);
        this.persistQueue();
        this.processQueue();
      }
      return existing.id;
    }

    const transferId = store.addTransfer(
      book.hash,
      book.title,
      'upload',
      priority,
      false,
      !!opts.manual,
    );
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueDownload(book: Book, priority: number = 10): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }

    const store = useTransferStore.getState();

    const existing = store.getTransferByBookHash(book.hash, 'download');
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(book.hash, book.title, 'download', priority);
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueDelete(book: Book, priority: number = 10, isBackground: boolean = false): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }

    const store = useTransferStore.getState();

    const existing = store.getTransferByBookHash(book.hash, 'delete');
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(book.hash, book.title, 'delete', priority, isBackground);
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueBatchUploads(
    books: Book[],
    priority: number = 10,
    opts: { manual?: boolean } = {},
  ): string[] {
    return books
      .map((book) => this.queueUpload(book, priority, opts))
      .filter((id): id is string => id !== null);
  }

  queueReplicaUpload(
    replicaKind: string,
    replicaId: string,
    displayTitle: string,
    files: ReplicaTransferFile[],
    base: BaseDir,
    opts: { priority?: number; isBackground?: boolean; reincarnation?: string } = {},
  ): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }
    const store = useTransferStore.getState();
    const existing = store.getReplicaTransfer(replicaKind, replicaId, 'upload');
    if (existing) return existing.id;

    const id = store.addReplicaTransfer(replicaKind, replicaId, displayTitle, 'upload', {
      priority: opts.priority,
      isBackground: opts.isBackground,
      files,
      base,
      reincarnation: opts.reincarnation,
    });
    this.persistQueue();
    this.processQueue();
    return id;
  }

  queueReplicaDownload(
    replicaKind: string,
    replicaId: string,
    displayTitle: string,
    files: ReplicaTransferFile[],
    base: BaseDir,
    opts: { priority?: number; isBackground?: boolean } = {},
  ): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }
    const store = useTransferStore.getState();
    const existing = store.getReplicaTransfer(replicaKind, replicaId, 'download');
    if (existing) return existing.id;

    const id = store.addReplicaTransfer(replicaKind, replicaId, displayTitle, 'download', {
      priority: opts.priority,
      isBackground: opts.isBackground,
      files,
      base,
    });
    this.persistQueue();
    this.processQueue();
    return id;
  }

  queueReplicaDelete(
    replicaKind: string,
    replicaId: string,
    displayTitle: string,
    filenames: string[],
    opts: { priority?: number; isBackground?: boolean } = {},
  ): string | null {
    if (!this.isReady()) {
      console.warn('TransferManager not initialized');
      return null;
    }
    const store = useTransferStore.getState();
    const existing = store.getReplicaTransfer(replicaKind, replicaId, 'delete');
    if (existing) return existing.id;

    const id = store.addReplicaTransfer(replicaKind, replicaId, displayTitle, 'delete', {
      priority: opts.priority,
      isBackground: opts.isBackground,
      files: filenames.map((logical) => ({ logical, lfp: '', byteSize: 0 })),
    });
    this.persistQueue();
    this.processQueue();
    return id;
  }

  cancelTransfer(transferId: string): void {
    const controller = this.abortControllers.get(transferId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(transferId);
    }

    useTransferStore.getState().setTransferStatus(transferId, 'cancelled', undefined, 'user');
    this.persistQueue();
  }

  retryTransfer(transferId: string): void {
    const store = useTransferStore.getState();
    store.retryTransfer(transferId);
    this.dropDuplicateTransfers();
    this.persistQueue();
    this.processQueue();
  }

  retryAllFailed(): void {
    const store = useTransferStore.getState();
    const failed = store.getFailedTransfers();
    failed.forEach((transfer) => {
      store.retryTransfer(transfer.id);
    });
    this.dropDuplicateTransfers();
    this.persistQueue();
    this.processQueue();
  }

  pauseQueue(): void {
    useTransferStore.getState().pauseQueue();
    this.persistQueue();
  }

  resumeQueue(): void {
    useTransferStore.getState().resumeQueue();
    this.processQueue();
    this.persistQueue();
  }

  clearPending(): void {
    useTransferStore.getState().clearPending();
    this.persistQueue();
  }

  clearCompleted(): void {
    useTransferStore.getState().clearCompleted();
    this.persistQueue();
  }

  clearFailed(): void {
    useTransferStore.getState().clearFailed();
    this.persistQueue();
  }

  clearAll(): void {
    useTransferStore.getState().clearAll();
    this.persistQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      await this._processQueueInternal();
    } finally {
      this.isProcessing = false;
    }
  }

  private async _processQueueInternal(): Promise<void> {
    this.reconcileUploadsWithProvider();

    const store = useTransferStore.getState();

    if (store.isQueuePaused) return;

    this.refreshNetworkKind();
    const held = this.automaticUploadsHeld();
    const waiting = (t: TransferItem) => held && this.isAutomaticBookUpload(t);
    this.dropDuplicateTransfers();
    const pending = store
      .getPendingTransfers()
      .filter((t) => !this.isDeferredBookUpload(t) && !waiting(t) && !this.mustWaitForOwner(t));
    if (held && store.getPendingTransfers().some(waiting)) this.scheduleWifiRecheck();
    const activeCount = store.getActiveTransfers().length;
    const maxConcurrent = store.maxConcurrent;

    const availableSlots = maxConcurrent - activeCount;
    if (availableSlots <= 0 || pending.length === 0) return;

    // Sort by priority (lower = higher priority) then by createdAt
    const sortedPending = [...pending].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    const toProcess = sortedPending.slice(0, availableSlots);

    await Promise.all(toProcess.map((transfer) => this.executeTransfer(transfer)));

    // Check if more items to process. Deferred book uploads (settings
    // not yet hydrated) don't count — re-looping on them every 100ms
    // would busy-wait; the settings subscription wakes them instead.
    const newStore = useTransferStore.getState();
    const processable = newStore
      .getPendingTransfers()
      .filter((t) => !this.isDeferredBookUpload(t) && !waiting(t) && !this.mustWaitForOwner(t));
    if (processable.length > 0 && !newStore.isQueuePaused) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /** Was this book transfer asked for by a profile other than the one in use now? */
  private isOwnedElsewhere(t: TransferItem): boolean {
    return t.kind === 'book' && !isOwnedByActiveProfile(t);
  }

  /**
   * An upload carries the same file whoever asks, so another profile's keeps going after a
   * switch. Downloads and deletions act with the profile's own access on the server, so they
   * wait until that profile is back.
   */
  private mustWaitForOwner(t: TransferItem): boolean {
    return this.isOwnedElsewhere(t) && t.type !== 'upload';
  }

  /**
   * Never move the same book the same way twice at once: a retried copy, a second press or a
   * row restored next to a new one would upload (or download) the file again. The earliest row
   * wins; the others are set aside (like policy cancellations: not failures, not retryable).
   */
  private dropDuplicateTransfers(): void {
    const store = useTransferStore.getState();
    const keyOf = (t: TransferItem) => `${t.bookHash}|${t.type}|${t.profileId ?? ''}`;
    const seen = new Set(
      store
        .getActiveTransfers()
        .filter((t) => t.kind === 'book')
        .map(keyOf),
    );
    const pending = store
      .getPendingTransfers()
      .filter((t) => t.kind === 'book')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const t of pending) {
      const key = keyOf(t);
      if (seen.has(key)) store.setTransferStatus(t.id, 'cancelled', undefined, 'policy');
      else seen.add(key);
    }
  }

  /**
   * A book download failed because the server has nothing to serve. Ask the server to confirm,
   * and have it take back its false "uploaded" mark (for the account and every profile), then drop
   * the mark here too. True only when the server confirmed the file is missing; if it cannot be
   * asked, or says it has the file, nothing is changed and the failure is handled like any other.
   */
  private async confirmFileMissing(transfer: TransferItem, error: unknown): Promise<boolean> {
    if (transfer.kind !== 'book' || transfer.type !== 'download' || !isNotOnServerError(error)) {
      return false;
    }
    try {
      const missing = await askServerWhichAreMissing([transfer.bookHash], { repair: true });
      if (!missing.includes(transfer.bookHash)) return false;
      const book = this.getLibrary?.().find((b) => b.hash === transfer.bookHash);
      if (book && this.updateBook) {
        await this.updateBook({ ...book, uploadedAt: null, updatedAt: Date.now() });
      }
      return true;
    } catch {
      return false;
    }
  }

  private async executeTransfer(transfer: TransferItem): Promise<void> {
    if (!this.appService || !this.getLibrary || !this.updateBook) {
      console.error('TransferManager not properly initialized');
      return;
    }

    const _ = this._!;
    const store = useTransferStore.getState();
    const abortController = new AbortController();
    this.abortControllers.set(transfer.id, abortController);

    store.setTransferStatus(transfer.id, 'in_progress');
    store.setActiveCount(store.getActiveTransfers().length + 1);

    const progressThrottle = createProgressThrottle((progress) => {
      const percentage = progress.total > 0 ? (progress.progress / progress.total) * 100 : 0;
      useTransferStore
        .getState()
        .updateTransferProgress(
          transfer.id,
          percentage,
          progress.progress,
          progress.total,
          progress.transferSpeed,
        );
    }, PROGRESS_THROTTLE_MS);

    const progressHandler = (progress: ProgressPayload) => {
      if (abortController.signal.aborted) return;
      progressThrottle.push(progress);
    };

    try {
      if (transfer.kind === 'replica') {
        await this.executeReplicaTransfer(transfer, progressHandler, abortController);
      } else {
        await this.executeBookTransfer(transfer, progressHandler, abortController);
      }

      // Land the final progress value that the throttle may still be holding.
      progressThrottle.flush();
      useTransferStore.getState().setTransferStatus(transfer.id, 'completed');

      const messages = getTransferMessages(transfer, _);

      if (!transfer.isBackground) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: messages.success[transfer.type],
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        // Already cancelled, don't update status
        return;
      }

      const errorMessage = error instanceof Error ? error.message : _('Unknown error');
      const currentStore = useTransferStore.getState();
      const currentTransfer = currentStore.transfers[transfer.id];

      // Quota exhaustion is permanent for this account state; retrying
      // burns three backoff rounds per book for the same 403.
      const isQuotaError = errorMessage.includes('Insufficient storage quota');
      // A file the server confirms it never had will not appear by asking again.
      const fileIsGone = !isQuotaError && (await this.confirmFileMissing(transfer, error));

      if (
        !isQuotaError &&
        !fileIsGone &&
        currentTransfer &&
        currentTransfer.retryCount < currentTransfer.maxRetries
      ) {
        // Schedule retry with exponential backoff
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, currentTransfer.retryCount);
        currentStore.incrementRetryCount(transfer.id);
        currentStore.setTransferStatus(
          transfer.id,
          'pending',
          `Retry ${currentTransfer.retryCount + 1}/${currentTransfer.maxRetries}`,
        );

        setTimeout(() => {
          this.processQueue();
        }, delay);
      } else {
        if (errorMessage.includes('Not authenticated')) {
          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: _('Please log in to continue'),
          });
        } else if (isQuotaError) {
          this.recordQuotaFailure();
        } else {
          const errorMessages = getTransferMessages(transfer, _).failure;

          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: withFailureReason(errorMessages[transfer.type], errorMessage),
          });
        }

        useTransferStore.getState().setTransferStatus(transfer.id, 'failed', errorMessage);
      }
    } finally {
      // Drop any pending throttled progress + its trailing timer (a
      // failed/aborted transfer's stale progress must not fire after teardown).
      progressThrottle.cancel();
      this.abortControllers.delete(transfer.id);

      const currentStore = useTransferStore.getState();
      currentStore.setActiveCount(Math.max(0, currentStore.getActiveTransfers().length));
      this.persistQueue();

      // Continue processing
      setTimeout(() => this.processQueue(), 100);
    }
  }

  private recordQuotaFailure(): void {
    this.quotaFailureCount += 1;
    if (this.quotaToastTimer) clearTimeout(this.quotaToastTimer);
    this.quotaToastTimer = setTimeout(() => this.flushQuotaToast(), QUOTA_TOAST_FLUSH_MS);
  }

  private flushQuotaToast(): void {
    const _ = this._;
    const count = this.quotaFailureCount;
    this.quotaFailureCount = 0;
    this.quotaToastTimer = null;
    if (!count || !_) return;

    eventDispatcher.dispatch('toast', {
      type: 'error',
      message:
        count === 1
          ? _('Insufficient storage quota')
          : _('{{count}} uploads failed: insufficient storage quota', { count }),
    });
  }

  private async executeBookTransfer(
    transfer: TransferItem,
    progressHandler: (p: ProgressPayload) => void,
    _abortController: AbortController,
  ): Promise<void> {
    const _ = this._!;

    // Another profile's upload (the app was switched to someone else): take the book from that
    // profile's library and record the result there, not in the library now on screen.
    if (transfer.type === 'upload' && this.isOwnedElsewhere(transfer)) {
      const owner = transfer.profileId ?? null;
      const theirs = await this.appService!.loadBookFromProfileLibrary(owner, transfer.bookHash);
      if (!theirs) throw new Error(_('Book not found in library'));
      await this.appService!.uploadBook(theirs, progressHandler);
      await this.appService!.saveBookToProfileLibrary(owner, theirs);
      return;
    }

    const library = this.getLibrary!();
    const book = library.find((b) => b.hash === transfer.bookHash);

    if (!book) {
      throw new Error(_('Book not found in library'));
    }

    if (transfer.type === 'upload') {
      await this.appService!.uploadBook(book, progressHandler);
      book.uploadedAt = Date.now();
      await this.updateBook!(book);
    } else if (transfer.type === 'download') {
      await this.appService!.downloadBook(book, false, false, progressHandler);
      book.downloadedAt = Date.now();
      await this.updateBook!(book);
    } else if (transfer.type === 'delete') {
      await this.appService!.deleteBook(book, 'cloud');
      await this.updateBook!(book);
    }
  }

  private async executeReplicaTransfer(
    transfer: TransferItem,
    progressHandler: (p: ProgressPayload) => void,
    _abortController: AbortController,
  ): Promise<void> {
    const kind = transfer.replicaKind!;
    const replicaId = transfer.replicaId!;
    const files = transfer.replicaFiles ?? [];

    if (transfer.type === 'delete') {
      await this.appService!.deleteReplicaBundle(
        kind,
        replicaId,
        files.map((f) => f.logical),
      );
      eventDispatcher.dispatch('replica-transfer-complete', {
        kind,
        replicaId,
        type: 'delete',
        filenames: files.map((f) => f.logical),
      });
      return;
    }

    if (files.length === 0) {
      throw new Error(`replica ${transfer.type} requires replicaFiles on the transfer`);
    }

    const totalBytes = files.reduce((sum, f) => sum + f.byteSize, 0) || 1;
    let bytesAlreadyDone = 0;
    const fileProgressHandler =
      (filenameSize: number): ProgressHandler =>
      (p: ProgressPayload) => {
        const fileFraction = p.total > 0 ? p.progress / p.total : 0;
        const overallTransferred = bytesAlreadyDone + filenameSize * fileFraction;
        progressHandler({
          progress: overallTransferred,
          total: totalBytes,
          transferSpeed: p.transferSpeed,
        });
      };

    if (transfer.type === 'upload') {
      const base = transfer.replicaBase!;
      for (const file of files) {
        await this.appService!.uploadReplicaFile(
          kind,
          replicaId,
          file.logical,
          file.lfp,
          base,
          fileProgressHandler(file.byteSize),
        );
        bytesAlreadyDone += file.byteSize;
      }
      eventDispatcher.dispatch('replica-transfer-complete', {
        kind,
        replicaId,
        reincarnation: transfer.replicaReincarnation,
        type: 'upload',
        files,
      });
      return;
    }

    if (transfer.type === 'download') {
      const base = transfer.replicaBase!;
      for (const file of files) {
        await this.appService!.downloadReplicaFile(
          kind,
          replicaId,
          file.logical,
          file.lfp,
          base,
          fileProgressHandler(file.byteSize),
        );
        bytesAlreadyDone += file.byteSize;
      }
      eventDispatcher.dispatch('replica-transfer-complete', {
        kind,
        replicaId,
        type: 'download',
        files,
      });
      return;
    }
  }

  private async loadPersistedQueue(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;

      const stored = localStorage.getItem(TRANSFER_QUEUE_KEY);
      if (!stored) return;

      const data: PersistedQueueData = JSON.parse(stored);
      const store = useTransferStore.getState();

      // Restore all transfers using the store's restore method
      // This preserves the original IDs and handles in_progress -> pending conversion
      store.restoreTransfers(data.transfers, data.isQueuePaused);
    } catch (error) {
      console.error('Failed to load transfer queue:', error);
    }
  }

  private persistQueue(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const store = useTransferStore.getState();

      // Persist all transfers including completed (for history)
      const data: PersistedQueueData = {
        schemaVersion: QUEUE_SCHEMA_VERSION,
        transfers: store.transfers,
        isQueuePaused: store.isQueuePaused,
      };

      localStorage.setItem(TRANSFER_QUEUE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist transfer queue:', error);
    }
  }
}

export const transferManager = TransferManager.getInstance();
