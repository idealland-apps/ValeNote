import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Box } from '@mui/material';

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  type: 'file' | 'folder';
}

export default function DeleteConfirmDialog({ open, onClose, onConfirm, name, type }: DeleteConfirmDialogProps) {
  const isFolder = type === 'folder';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete {isFolder ? 'Folder' : 'File'}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          Are you sure you want to delete "{name}"?
          {isFolder && ' This will delete all files and subfolders inside it.'}
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            <li>This action cannot be undone.</li>
            <li>All images and attachments in the note will be deleted.</li>
            <li>All corresponding version history files will be deleted.</li>
            <li>If remote backup deletion is enabled, all corresponding notes and attachments in remote storage will be deleted on the next sync.</li>
          </Box>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
      </DialogActions>
    </Dialog>
  );
}
