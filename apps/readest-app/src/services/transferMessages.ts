import type { TransferItem } from '@/store/transferStore';
import type { TranslationFunc } from '@/hooks/useTranslation';

export interface TransferMessages {
  success: { upload: string; download: string; delete: string };
  failure: { upload: string; download: string; delete: string };
}

/**
 * Build per-kind toast copy for a TransferItem. Books keep their own
 * copy ("Book uploaded"); everything else — replica kinds (dictionary,
 * font, textures, OPDS catalogs, …) and any future transfer kind —
 * falls through to the generic "File uploaded" string so we don't have
 * to add a per-kind branch each time.
 */
export const getTransferMessages = (
  transfer: TransferItem,
  _: TranslationFunc,
): TransferMessages => {
  const title = transfer.bookTitle;

  if (transfer.kind === 'book') {
    return {
      success: {
        upload: _('Book uploaded: {{title}}', { title }),
        download: _('Book downloaded: {{title}}', { title }),
        delete: _('Deleted cloud backup of the book: {{title}}', { title }),
      },
      failure: {
        upload: _('Failed to upload book: {{title}}', { title }),
        download: _('Failed to download book: {{title}}', { title }),
        delete: _('Failed to delete cloud backup of the book: {{title}}', { title }),
      },
    };
  }

  return {
    success: {
      upload: _('File uploaded: {{title}}', { title }),
      download: _('File downloaded: {{title}}', { title }),
      delete: _('Deleted cloud copy of the file: {{title}}', { title }),
    },
    failure: {
      upload: _('Failed to upload file: {{title}}', { title }),
      download: _('Failed to download file: {{title}}', { title }),
      delete: _('Failed to delete cloud copy of the file: {{title}}', { title }),
    },
  };
};

/**
 * The failure message with the reason underneath, so the toast says what to fix, not only that
 * something failed. A reason that adds nothing is left out, and a long one is cut short.
 */
export const withFailureReason = (message: string, reason: string | undefined): string => {
  const text = (reason ?? '').trim();
  if (!text || text === message || /^unknown error$/i.test(text)) return message;
  return `${message}\n${text.length > 220 ? `${text.slice(0, 217)}...` : text}`;
};
