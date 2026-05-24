import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Alert } from '@mui/material';
import { notebookApi } from '../services/api';

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

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await notebookApi.create({
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
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
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-notebook"
            helperText="Lowercase letters, numbers, and hyphens only"
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
