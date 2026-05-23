import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, List, ListItemText, ListItemButton, IconButton, Typography, Box, CircularProgress, Divider, Button, Chip } from '@mui/material';
import { Restore as RestoreIcon, Close as CloseIcon } from '@mui/icons-material';
import api from '../services/api';

interface Version {
  id: number;
  note_path: string;
  size: number;
  checksum: string;
  username?: string;
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

  useEffect(() => {
    if (open && notePath) {
      loadVersions();
    }
  }, [open, notePath]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Version[]>(`/versions/${notePath}`);
      setVersions(data || []);
    } catch (error) {
      console.error('Failed to load versions', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (version: Version) => {
    setSelectedVersion(version);
    try {
      const { data } = await api.get(`/version/${version.id}`);
      setPreviewContent(data.content);
    } catch (error) {
      console.error('Failed to load version content', error);
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    setRestoring(true);
    try {
      await api.post(`/version/${selectedVersion.id}/restore`);
      onRestore();
      onClose();
    } catch (error) {
      console.error('Failed to restore version', error);
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
                    secondary={
                      <>
                        {version.username && `by ${version.username} · `}
                        {formatSize(version.size)}
                      </>
                    }
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
                  onClick={handleRestore}
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
    </Dialog>
  );
}
