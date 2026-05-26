import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import { isReservedFolderName, RESERVED_FOLDER_NAMES } from '../constants';

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  parentPath: string;
}

export default function CreateFolderDialog({ open, onClose, onConfirm, parentPath }: CreateFolderDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Folder name is required');
      return;
    }
    if (/[\/\\:*?"<>|]/.test(trimmed)) {
      setError('Invalid characters in folder name');
      return;
    }
    if (isReservedFolderName(trimmed)) {
      setError(`"${trimmed}" is a reserved name (${RESERVED_FOLDER_NAMES.join(', ')})`);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Folder</DialogTitle>
      <DialogContent>
        <TextField
          inputRef={inputRef}
          fullWidth
          label="Folder name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          error={!!error}
          helperText={error || (parentPath ? `Will be created in: ${parentPath}/` : 'Will be created in root')}
          margin="dense"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Create</Button>
      </DialogActions>
    </Dialog>
  );
}
