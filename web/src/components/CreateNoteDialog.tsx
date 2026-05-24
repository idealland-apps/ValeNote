import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Box } from '@mui/material';
import { useNoteStore } from '../stores/noteStore';
import type { Notebook } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  notebooks: Notebook[];
}

export default function CreateNoteDialog({ open, onClose, notebooks }: Props) {
  const [notebook, setNotebook] = useState('');
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const { createNote, loadNote } = useNoteStore();

  const handleCreate = async () => {
    if (!notebook || !filename) return;
    setLoading(true);
    try {
      const path = `${notebook}/${filename.endsWith('.md') ? filename : filename + '.md'}`;
      const note = await createNote({ path, title: title || filename, content: '' });
      loadNote(note.path);
      onClose();
      setNotebook('');
      setTitle('');
      setFilename('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Note</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            select
            label="Notebook"
            value={notebook}
            onChange={(e) => setNotebook(e.target.value)}
            fullWidth
          >
            {notebooks.map((nb) => (
              <MenuItem key={nb.name} value={nb.name}>
                {nb.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
          />
          <TextField
            label="Filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="my-note.md"
            fullWidth
            required
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained" disabled={loading || !notebook || !filename}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
