import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Switch, FormControlLabel, Box, Alert, Divider, Typography, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { notebookApi } from '../services/api';
import type { Notebook } from '../services/api';
import { useSiteStore } from '../stores/siteStore';

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook | null;
  onSave: () => void;
}

export default function NotebookSettingsDialog({ open, onClose, notebook, onSave }: Props) {
  const { publicBasePath } = useSiteStore();
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (notebook) {
      setDescription(notebook.description || '');
      setIsPublic(notebook.is_public || false);
      setConfirmDelete(false);
      setError('');
      setCopied(false);
    }
  }, [notebook]);

  const handleCopyUrl = async () => {
    if (!notebook) return;
    const url = `${window.location.origin}${publicBasePath}/${notebook.name}/`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!notebook) return;
    setSaving(true);
    setError('');
    try {
      await notebookApi.update(notebook.name, {
        description: description.trim() || undefined,
        is_public: isPublic,
      });
      onSave();
      onClose();
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!notebook) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await notebookApi.delete(notebook.name);
      onSave();
      onClose();
    } catch {
      setError('Failed to delete notebook. Make sure it is empty first.');
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirmDelete(false);
    setError('');
    onClose();
  };

  if (!notebook) return null;

  const publicUrl = `${window.location.origin}${publicBasePath}/${notebook.name}/`;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Notebook Settings: {notebook.name}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />

          <Divider />

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            }
            label="Public access"
          />

          {isPublic && (
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Public URL
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    color: 'primary.main',
                  }}
                >
                  {publicUrl}
                </Typography>
                <Tooltip title={copied ? 'Copied!' : 'Copy URL'}>
                  <IconButton size="small" onClick={handleCopyUrl}>
                    {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Anyone can access notes in this notebook via this URL
              </Typography>
            </Box>
          )}

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="error" gutterBottom>
              Danger Zone
            </Typography>
            {confirmDelete ? (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Are you sure? This will delete the notebook and all its notes permanently.
              </Alert>
            ) : null}
            <Button
              variant="outlined"
              color="error"
              onClick={handleDelete}
              disabled={deleting}
            >
              {confirmDelete ? 'Click again to confirm' : 'Delete Notebook'}
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
