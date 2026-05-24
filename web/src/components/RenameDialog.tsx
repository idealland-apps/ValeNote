import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
  type: 'file' | 'folder';
}

export default function RenameDialog({ open, onClose, onConfirm, currentName, type }: RenameDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError('');
    }
  }, [open, currentName]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (/[\/\\:*?"<>|]/.test(trimmed)) {
      setError('Invalid characters in name');
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Rename {type === 'folder' ? 'Folder' : 'File'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="New name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          error={!!error}
          helperText={error}
          margin="dense"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          onFocus={(e) => {
            const dotIndex = e.target.value.lastIndexOf('.');
            if (dotIndex > 0 && type === 'file') {
              e.target.setSelectionRange(0, dotIndex);
            } else {
              e.target.select();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Rename</Button>
      </DialogActions>
    </Dialog>
  );
}
