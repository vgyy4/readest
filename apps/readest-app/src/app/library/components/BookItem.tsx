import clsx from 'clsx';
import { isAudioFormat } from '@/libs/audiobook/formats';
import { useEffect, useState } from 'react';
import { MdCheckCircle, MdCheckCircleOutline } from 'react-icons/md';
import {
  LiaCloudUploadAltSolid,
  LiaCloudDownloadAltSolid,
  LiaExclamationCircleSolid,
  LiaHeadphonesSolid,
  LiaInfoCircleSolid,
} from 'react-icons/lia';

import { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransferStore } from '@/store/transferStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { LibraryCoverFitType, LibraryViewModeType } from '@/types/settings';
import { eventDispatcher } from '@/utils/event';
import { navigateToLogin } from '@/utils/nav';
import { isReadestCloudStorageActive } from '@/services/sync/cloudSyncProvider';
import { isFeedBook } from '@/services/rss/feedBookUrl';
import { formatAuthors, formatDescription, formatSeries } from '@/utils/book';
import ReadingProgress from './ReadingProgress';
import BookCover from '@/components/BookCover';

interface BookItemProps {
  book: Book;
  mode: LibraryViewModeType;
  coverFit: LibraryCoverFitType;
  isSelectMode: boolean;
  bookSelected: boolean;
  transferProgress: number | null;
  handleBookUpload: (book: Book) => void;
  handleBookDownload: (book: Book, options?: { redownload?: boolean; queued?: boolean }) => void;
  showBookDetailsModal: (book: Book) => void;
  showTimeRemaining: boolean;
}

const BookItem: React.FC<BookItemProps> = ({
  book,
  mode,
  coverFit,
  isSelectMode,
  bookSelected,
  transferProgress: directProgress,
  handleBookUpload,
  handleBookDownload,
  showBookDetailsModal,
  showTimeRemaining,
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const iconSize15 = useResponsiveSize(15);
  // Uploads and downloads run by the transfer queue report here; direct taps report via the prop.
  const queuedProgress = useTransferStore((state) => {
    for (const t of Object.values(state.transfers)) {
      if (t.kind === 'book' && t.bookHash === book.hash && t.status === 'in_progress') {
        return Math.round(t.progress);
      }
    }
    return null;
  });
  const transferProgress = queuedProgress ?? directProgress;
  // Not on this device, not on the server, and not a file opened in place from elsewhere.
  const fileIsGone = !book.uploadedAt && !book.downloadedAt && !book.filePath;

  const [coverAspect, setCoverAspect] = useState<number | null>(null);
  useEffect(() => {
    setCoverAspect(null);
  }, [book.hash, book.metadata?.coverImageUrl, book.coverImageUrl]);

  const CELL_ASPECT_RATIO = 28 / 41;
  const fitCoverInGrid = mode === 'grid' && coverFit === 'fit' && coverAspect !== null;
  const shouldShrinkWidth = fitCoverInGrid && coverAspect! < CELL_ASPECT_RATIO;
  const bookitemMainStyle = fitCoverInGrid
    ? {
        aspectRatio: coverAspect!,
        ...(shouldShrinkWidth ? { width: `${(coverAspect! / CELL_ASPECT_RATIO) * 100}%` } : {}),
      }
    : undefined;

  const seriesText = formatSeries(book.metadata?.series, book.metadata?.seriesIndex);

  return (
    <div
      role='none'
      className={clsx(
        'book-item flex',
        mode === 'grid' && 'h-full flex-col justify-end',
        mode === 'list' && 'min-h-28 flex-row gap-4 overflow-hidden',
        mode === 'list' ? 'library-list-item' : 'library-grid-item',
        appService?.hasContextMenu ? 'cursor-pointer' : '',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={clsx(
          'bookitem-main relative flex justify-center overflow-hidden rounded',
          !fitCoverInGrid && 'aspect-[28/41]',
          coverFit === 'crop' && 'shadow-md',
          mode === 'grid' && 'items-end',
          mode === 'list' && 'min-w-20 items-center',
        )}
        style={bookitemMainStyle}
      >
        <BookCover
          mode={mode}
          book={book}
          coverFit={coverFit}
          showSpine={settings.librarySkeuomorphicCovers}
          imageClassName={clsx(
            'shadow-md',
            settings.librarySkeuomorphicCovers ? 'rounded-none' : 'rounded',
          )}
          onAspectRatioChange={setCoverAspect}
        />
        {bookSelected && (
          <div className='absolute inset-0 bg-black opacity-30 transition-opacity duration-300'></div>
        )}
        {isSelectMode && (
          <div className='absolute bottom-1 right-1'>
            {bookSelected ? (
              <MdCheckCircle className='fill-blue-500' />
            ) : (
              <MdCheckCircleOutline className='fill-gray-300 drop-shadow-sm' />
            )}
          </div>
        )}
      </div>
      <div
        className={clsx(
          'flex w-full flex-col p-0',
          mode === 'grid' && 'pt-2',
          mode === 'list' && 'gap-1 py-0',
        )}
      >
        <div className={clsx('min-w-0 flex-1', mode === 'list' && 'flex flex-col gap-1')}>
          <h4
            className={clsx(
              'overflow-hidden text-ellipsis font-semibold',
              mode === 'grid' && 'block whitespace-nowrap text-[0.6em] text-xs',
              mode === 'list' && 'line-clamp-1 text-base',
            )}
          >
            {book.title}
          </h4>
          {mode === 'list' && (
            <p className='text-neutral-content line-clamp-1 text-sm'>
              {formatAuthors(book.author, book.primaryLanguage) || ''}
            </p>
          )}
        </div>
        {mode === 'list' && seriesText && (
          <p className='text-neutral-content line-clamp-1 text-sm'>{seriesText}</p>
        )}
        {mode === 'list' && (
          <h4 className='text-neutral-content line-clamp-1 text-sm'>
            {formatDescription(book.metadata?.description)}
          </h4>
        )}
        <div
          className={clsx(
            'flex items-center',
            book.progress || book.readingStatus ? 'justify-between' : 'justify-end',
          )}
          style={{
            height: `${iconSize15}px`,
            minHeight: `${iconSize15}px`,
          }}
        >
          {(book.progress || book.readingStatus) && (
            <ReadingProgress book={book} showTimeRemaining={showTimeRemaining} />
          )}
          <div className='flex shrink-0 items-center justify-center gap-x-2'>
            {!appService?.isMobile && (
              <button
                aria-label={_('Show Book Details')}
                className='show-detail-button -m-2 p-2 sm:opacity-0 sm:group-hover:opacity-100'
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  showBookDetailsModal(book);
                }}
              >
                <div className='pt-[2px] sm:pt-[1px]'>
                  <LiaInfoCircleSolid size={iconSize15} />
                </div>
              </button>
            )}
            {(book.hasNarration || isAudioFormat(book.format)) && (
              <div
                className='pt-[2px] sm:pt-[1px]'
                title={isAudioFormat(book.format) ? _('Audiobook') : _('Includes narration')}
                aria-label={isAudioFormat(book.format) ? _('Audiobook') : _('Includes narration')}
              >
                <LiaHeadphonesSolid size={iconSize15} />
              </div>
            )}
            {transferProgress !== null ? (
              transferProgress === 100 ? null : (
                <div className='flex items-center gap-1'>
                  <span className='text-[10px] tabular-nums leading-none'>
                    {Math.round(transferProgress)}%
                  </span>
                  <div
                    className='radial-progress'
                    style={
                      {
                        '--value': transferProgress,
                        '--size': `${iconSize15}px`,
                        '--thickness': '2px',
                      } as React.CSSProperties
                    }
                    role='progressbar'
                  ></div>
                </div>
              )
            ) : (
              // A feed book has no file to move either way, so it never gets a
              // cloud badge — it would only queue a transfer that fails (#5307).
              !isFeedBook(book) &&
              (fileIsGone ? (
                // No file here and none on the server (the server said so): there is nothing to
                // upload or download. Say what can be done instead of offering a button that fails.
                <button
                  aria-label={_('File missing')}
                  className='show-cloud-button -m-2 p-2'
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    eventDispatcher.dispatch('toast', {
                      type: 'info',
                      timeout: 6000,
                      message: _(
                        'The file for this book is not on this device or on the server. Import the file again to restore it, or remove the book.',
                      ),
                    })
                  }
                >
                  <LiaExclamationCircleSolid size={iconSize15} />
                </button>
              ) : (
                (!book.uploadedAt || (book.uploadedAt && !book.downloadedAt)) && (
                  <button
                    aria-label={!book.uploadedAt ? _('Upload Book') : _('Download Book')}
                    className='show-cloud-button -m-2 p-2'
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      if (!user) {
                        navigateToLogin(router);
                        return;
                      }
                      if (!book.uploadedAt) {
                        handleBookUpload(book);
                      } else if (!book.downloadedAt) {
                        handleBookDownload(book, { queued: true });
                      }
                    }}
                  >
                    {!book.uploadedAt && isReadestCloudStorageActive(settings) && (
                      <LiaCloudUploadAltSolid size={iconSize15} />
                    )}
                    {book.uploadedAt && !book.downloadedAt && (
                      <LiaCloudDownloadAltSolid size={iconSize15} />
                    )}
                  </button>
                )
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookItem;
