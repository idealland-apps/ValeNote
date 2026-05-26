import { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError('');
      setTimeout(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          const dotIndex = currentName.lastIndexOf('.');
          if (dotIndex > 0 && type === 'file') {
            input.setSelectionRange(0, dotIndex);
          } else {
            input.select();
          }
        }
      }, 0);
    }
  }, [open, currentName, type]);

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
          inputRef={inputRef}
          fullWidth
          label="New name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          error={!!error}
          helperText={error}
          margin="dense"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Rename</Button>
      </DialogActions>
    </Dialog>
  );
}
