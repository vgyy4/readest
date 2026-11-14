import React from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import Dialog from '@/components/Dialog';
import WatchedFoldersPane, { type WatchedFolder } from './WatchedFoldersPane';

interface WatchedFoldersDialogProps {
  folders: WatchedFolder[];
  onUnwatch: (path: string) => void;
  onSetFlatten: (path: string, flatten: boolean) => void;
  onClose: () => void;
}

/**
 * The folders Readest is watching, reachable straight from the Import menu so a folder can be
 * stopped without first picking a folder to import (which is not possible on every device).
 */
const WatchedFoldersDialog: React.FC<WatchedFoldersDialogProps> = ({
  folders,
  onUnwatch,
  onSetFlatten,
  onClose,
}) => {
  const _ = useTranslation();
  return (
    <Dialog
      isOpen
      title={_('Watched Folders')}
      onClose={onClose}
      boxClassName='sm:min-w-[480px] sm:max-w-[480px] sm:h-auto sm:max-h-[90%]'
      contentClassName='!px-6 !py-2'
    >
      <WatchedFoldersPane
        folders={folders}
        onBack={onClose}
        onUnwatch={onUnwatch}
        onSetFlatten={onSetFlatten}
      />
    </Dialog>
  );
};

export default WatchedFoldersDialog;
