import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ContentCopyOutlined as CopyIcon,
  Upload as UploadIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Download as DownloadIcon,
  Add as InsertIcon,
} from '@mui/icons-material';
import api, { attachmentApi, type AttachmentInfo } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  notePath: string;
  markdownContent?: string;
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

function isAttachmentReferenced(attachment: AttachmentInfo, markdownContent: string): boolean {
  if (!markdownContent) return false;
  const name = attachment.name;
  const path = attachment.path;
  return markdownContent.includes(name) || markdownContent.includes(path);
}

export default function AttachmentManagerDialog({ open, onClose, notePath, markdownContent, onInsert }: Props) {
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
    const link = getMarkdownLink(attachment);
    onInsert(link);
    onClose();
  };

  const getMarkdownLink = (attachment: AttachmentInfo): string => {
    return isImage(attachment.mime_type)
      ? `![${attachment.name}](${attachment.path})`
      : `[${attachment.name}](${attachment.path})`;
  };

  const handleCopyLink = async (attachment: AttachmentInfo) => {
    try {
      const link = getMarkdownLink(attachment);
      await navigator.clipboard.writeText(link);
      setCopySuccess(attachment.path);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      setError('Failed to copy link');
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
          <List dense disablePadding>
            {attachments.map((att) => {
              const isUsed = isAttachmentReferenced(att, markdownContent || '');
              return (
              <ListItem
                key={att.name}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 0.5,
                  py: 0.25,
                  px: 1,
                  minHeight: 36,
                  opacity: isUsed ? 1 : 0.7,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {isImage(att.mime_type) ? (
                  <ImageIcon sx={{ mr: 1, color: 'primary.main', fontSize: 18 }} />
                ) : (
                  <FileIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ flexShrink: 1, minWidth: 0 }}>{att.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    {formatFileSize(att.size)}
                  </Typography>
                  {!isUsed && (
                    <Chip
                      label="Unused"
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: '0.6rem',
                        bgcolor: 'action.disabledBackground',
                        color: 'text.secondary',
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', ml: 1 }}>
                  <Tooltip title="Insert">
                    <IconButton
                      size="small"
                      sx={{ p: 0.5 }}
                      color="primary"
                      onClick={() => handleInsert(att)}
                    >
                      <InsertIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={copySuccess === att.path ? 'Copied!' : 'Copy link'}>
                    <IconButton
                      size="small"
                      sx={{ p: 0.5 }}
                      onClick={() => handleCopyLink(att)}
                    >
                      <CopyIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download">
                    <IconButton
                      size="small"
                      sx={{ p: 0.5 }}
                      onClick={() => handleDownload(att)}
                    >
                      <DownloadIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    size="small"
                    sx={{ p: 0.5 }}
                    color="error"
                    onClick={() => handleDelete(att.name)}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
