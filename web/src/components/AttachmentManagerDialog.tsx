import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Upload as UploadIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import api, { attachmentApi, type AttachmentInfo } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  notePath: string;
  onInsert: (markdownLink: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export default function AttachmentManagerDialog({ open, onClose, notePath, onInsert }: Props) {
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async () => {
    if (!notePath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await attachmentApi.list(notePath);
      setAttachments(res.data || []);
    } catch {
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [notePath]);

  useEffect(() => {
    if (open) {
      loadAttachments();
    }
  }, [open, loadAttachments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await attachmentApi.upload(notePath, file);
      }
      await loadAttachments();
    } catch {
      setError('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    try {
      await attachmentApi.delete(notePath, filename);
      await loadAttachments();
    } catch {
      setError('Failed to delete attachment');
    }
  };

  const handleInsert = (attachment: AttachmentInfo) => {
    const link = isImage(attachment.mime_type)
      ? `![${attachment.name}](${attachment.path})`
      : `[${attachment.name}](${attachment.path})`;
    onInsert(link);
    onClose();
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopySuccess(path);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      setError('Failed to copy path');
    }
  };

  const handleDownload = async (attachment: AttachmentInfo) => {
    try {
      const noteDir = notePath.substring(0, notePath.lastIndexOf('/'));
      const resolvedPath = noteDir ? `${noteDir}/${attachment.path.slice(2)}` : attachment.path.slice(2);
      const response = await api.get(`/attachments/${resolvedPath}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download attachment');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Attachments</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            style={{ display: 'none' }}
            multiple
            accept="image/*,.pdf,.txt,.md"
          />
          <Button
            variant="outlined"
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : attachments.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No attachments
          </Typography>
        ) : (
          <List>
            {attachments.map((att) => (
              <ListItem
                key={att.name}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => handleInsert(att)}
              >
                {isImage(att.mime_type) ? (
                  <ImageIcon sx={{ mr: 2, color: 'primary.main' }} />
                ) : (
                  <FileIcon sx={{ mr: 2, color: 'text.secondary' }} />
                )}
                <ListItemText
                  primary={att.name}
                  secondary={formatFileSize(att.size)}
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Download">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(att);
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={copySuccess === att.path ? 'Copied!' : 'Copy path'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(att.path);
                      }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(att.name);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
