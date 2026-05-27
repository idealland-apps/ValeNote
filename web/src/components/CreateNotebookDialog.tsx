import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Alert } from '@mui/material';
import { notebookApi } from '../services/api';
import { isReservedFolderName, RESERVED_FOLDER_NAMES } from '../constants';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateNotebookDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleCreate = async () => {
    const normalized = name.trim();
    if (!normalized) return;
    if (isReservedFolderName(normalized)) {
      setError(`"${normalized}" is a reserved name (${RESERVED_FOLDER_NAMES.join(', ')})`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await notebookApi.create({
        name: normalized,
        description: description.trim() || undefined,
      });
      onCreated();
      onClose();
      setName('');
      setDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create notebook';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setError('');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Notebook</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            inputRef={inputRef}
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-notebook"
            helperText="Letters, numbers, spaces, and hyphens are allowed"
            fullWidth
            required
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained" disabled={loading || !name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
