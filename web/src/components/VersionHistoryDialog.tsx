import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemText, ListItemButton, IconButton, Typography, Box, CircularProgress, Divider, Button, Chip, Snackbar, Alert } from '@mui/material';
import { Restore as RestoreIcon, Close as CloseIcon, Person as PersonIcon, Android as AndroidIcon } from '@mui/icons-material';
import api from '../services/api';

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

interface Version {
  id: string;
  note_path: string;
  size: number;
  checksum: string;
  modifier_type?: string; // "u" for user, "a" for agent
  modifier_id?: number;
  modifier_name?: string;
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
      const { data } = await api.get<Version[]>(`/versions/${encodePath(notePath)}`);
      setVersions(data || []);
    } catch (err) {
      console.error('Failed to load versions', err);
      setError('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (version: Version) => {
    setSelectedVersion(version);
    try {
      const { data } = await api.get(`/version/${encodePath(notePath)}?id=${encodeURIComponent(version.id)}`);
      setPreviewContent(data.content);
    } catch (err) {
      console.error('Failed to load version content', err);
      setError('Failed to load version content');
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    setConfirmOpen(false);
    setRestoring(true);
    try {
      await api.post(`/version/${encodePath(notePath)}?id=${encodeURIComponent(selectedVersion.id)}`);
      onRestore();
      onClose();
    } catch (err) {
      console.error('Failed to restore version', err);
      setError('Failed to restore version');
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

  const formatModifier = (version: Version) => {
    if (!version.modifier_type || !version.modifier_id) return null;
    const name = version.modifier_name || `#${version.modifier_id}`;
    const icon = version.modifier_type === 'a'
      ? <AndroidIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
      : <PersonIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />;
    return <>{icon}{name}</>;
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: {
              width: '70vw',
              minWidth: '70vw',
              maxWidth: '1000px',
              height: '70vh',
              minHeight: '70vh',
              maxHeight: '800px',
              display: 'flex',
              flexDirection: 'column',
            }
          }
        }}
      >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Typography variant="h6">Version History</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden', p: 2 }}>
        <Box sx={{ width: 240, minWidth: 240, maxWidth: 240, borderRight: 1, borderColor: 'divider', pr: 2, overflow: 'auto', flexShrink: 0 }}>
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
                    secondary={
                      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {formatSize(version.size)}
                        {formatModifier(version) && (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                            · {formatModifier(version)}
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 'calc(100% - 260px)', overflow: 'hidden' }}>
          {selectedVersion ? (
            <>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">
                  {formatDate(selectedVersion.created_at)}
                </Typography>
                <Chip label={formatSize(selectedVersion.size)} size="small" />
                {selectedVersion.modifier_type && selectedVersion.modifier_id && (
                  <Chip
                    icon={selectedVersion.modifier_type === 'a' ? <AndroidIcon /> : <PersonIcon />}
                    label={selectedVersion.modifier_name || `#${selectedVersion.modifier_id}`}
                    size="small"
                    color={selectedVersion.modifier_type === 'a' ? 'secondary' : 'default'}
                  />
                )}
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
              <Divider sx={{ flexShrink: 0 }} />
              <Box
                sx={{
                  flex: 1,
                  overflow: 'auto',
                  mt: 2,
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  minHeight: 0,
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
        <DialogTitle>Confirm Restore</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to restore to the version from {selectedVersion && formatDate(selectedVersion.created_at)}? Current content will be overwritten.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRestore} variant="contained" color="primary" disabled={restoring}>
            {restoring ? 'Restoring...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
