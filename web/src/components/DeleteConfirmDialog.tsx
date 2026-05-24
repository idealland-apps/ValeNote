import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

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
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {isFolder ? 'Folder' : 'File'}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete "{name}"?
          {isFolder && ' This will delete all files and subfolders inside it.'}
          {' '}This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
      </DialogActions>
    </Dialog>
  );
}
