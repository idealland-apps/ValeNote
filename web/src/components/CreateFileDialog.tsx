import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

interface CreateFileDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  parentPath: string;
}

const FILE_TYPES = [
  { ext: '.md', label: 'Markdown (.md)' },
  { ext: '.txt', label: 'Text (.txt)' },
  { ext: '.json', label: 'JSON (.json)' },
  { ext: '', label: 'Other (specify)' },
];

export default function CreateFileDialog({ open, onClose, onConfirm, parentPath }: CreateFileDialogProps) {
  const [name, setName] = useState('');
  const [fileType, setFileType] = useState('.md');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setFileType('.md');
      setError('');
    }
  }, [open]);

  const handleSubmit = () => {
    let trimmed = name.trim();
    if (!trimmed) {
      setError('File name is required');
      return;
    }
    if (/[\/\\:*?"<>|]/.test(trimmed)) {
      setError('Invalid characters in file name');
      return;
    }
    if (fileType && !trimmed.endsWith(fileType)) {
      trimmed += fileType;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New File</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="dense" size="small">
          <InputLabel>File type</InputLabel>
          <Select
            value={fileType}
            label="File type"
            onChange={(e) => setFileType(e.target.value)}
          >
            {FILE_TYPES.map(t => (
              <MenuItem key={t.ext} value={t.ext}>{t.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          autoFocus
          fullWidth
          label="File name"
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
