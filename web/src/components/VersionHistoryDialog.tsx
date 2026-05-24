import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemText, ListItemButton, IconButton, Typography, Box, CircularProgress, Divider, Button, Chip, Snackbar, Alert } from '@mui/material';
import { Restore as RestoreIcon, Close as CloseIcon } from '@mui/icons-material';
import api from '../services/api';

interface Version {
  id: string;
  note_path: string;
  size: number;
  checksum: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notePath: string;
  onRestore: () => void;
}

export default function VersionHistoryDialog({ open, onClose, notePath, onRestore }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open && notePath) {
      loadVersions();
      setSelectedVersion(null);
      setPreviewContent('');
    }
  }, [open, notePath]);

  const loadVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Version[]>(`/versions/${notePath}`);
      setVersions(data || []);
    } catch (err) {
      console.error('Failed to load versions', err);
      setError('加载版本历史失败');
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (version: Version) => {
    setSelectedVersion(version);
    try {
      const { data } = await api.get(`/version/${notePath}?id=${encodeURIComponent(version.id)}`);
      setPreviewContent(data.content);
    } catch (err) {
      console.error('Failed to load version content', err);
      setError('加载版本内容失败');
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    setConfirmOpen(false);
    setRestoring(true);
    try {
      await api.post(`/version/${notePath}?id=${encodeURIComponent(selectedVersion.id)}`);
      onRestore();
      onClose();
    } catch (err) {
      console.error('Failed to restore version', err);
      setError('恢复版本失败');
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Version History</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2, minHeight: 400 }}>
        <Box sx={{ width: 300, borderRight: 1, borderColor: 'divider', pr: 2 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : versions.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              No version history available
            </Typography>
          ) : (
            <List dense>
              {versions.map((version) => (
                <ListItemButton
                  key={version.id}
                  selected={selectedVersion?.id === version.id}
                  onClick={() => loadPreview(version)}
                >
                  <ListItemText
                    primary={formatDate(version.created_at)}
                    secondary={formatSize(version.size)}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedVersion ? (
            <>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2">
                  {formatDate(selectedVersion.created_at)}
                </Typography>
                <Chip label={formatSize(selectedVersion.size)} size="small" />
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="contained"
                  startIcon={<RestoreIcon />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={restoring}
                  size="small"
                >
                  Restore
                </Button>
              </Box>
              <Divider />
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: 'auto',
                  mt: 2,
                  p: 2,
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {previewContent}
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography color="text.secondary">
                Select a version to preview
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>确认恢复</DialogTitle>
        <DialogContent>
          <Typography>
            确定要恢复到 {selectedVersion && formatDate(selectedVersion.created_at)} 的版本吗？当前内容将被覆盖。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button onClick={handleRestore} variant="contained" color="primary" disabled={restoring}>
            {restoring ? '恢复中...' : '确认恢复'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
