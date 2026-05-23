import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
  Alert,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { noteApi } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  notePath: string;
  localContent: string;
  onResolve: (content: string) => void;
}

export default function ConflictDialog({
  open,
  onClose,
  notePath,
  localContent,
  onResolve,
}: Props) {
  const [serverContent, setServerContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<'local' | 'server' | 'merge'>('local');
  const [mergedContent, setMergedContent] = useState('');

  useEffect(() => {
    if (open && notePath) {
      setLoading(true);
      noteApi
        .get(notePath)
        .then((res) => {
          setServerContent(res.data.content || '');
          setMergedContent(res.data.content || '');
        })
        .catch((err) => {
          console.error('Failed to fetch server content:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, notePath]);

  const handleVersionChange = (
    _: React.MouseEvent<HTMLElement>,
    newVersion: 'local' | 'server' | 'merge' | null
  ) => {
    if (newVersion) {
      setSelectedVersion(newVersion);
      if (newVersion === 'local') {
        setMergedContent(localContent);
      } else if (newVersion === 'server') {
        setMergedContent(serverContent);
      }
    }
  };

  const handleResolve = () => {
    let finalContent = '';
    switch (selectedVersion) {
      case 'local':
        finalContent = localContent;
        break;
      case 'server':
        finalContent = serverContent;
        break;
      case 'merge':
        finalContent = mergedContent;
        break;
    }
    onResolve(finalContent);
    onClose();
  };

  const renderDiff = (left: string, right: string) => {
    const leftLines = left.split('\n');
    const rightLines = right.split('\n');

    return (
      <Box sx={{ display: 'flex', gap: 2, height: 300, overflow: 'auto' }}>
        <Paper
          variant="outlined"
          sx={{ flex: 1, p: 1, overflow: 'auto', bgcolor: 'grey.50' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Your Version (Local)
          </Typography>
          <Box component="pre" sx={{ fontSize: '0.85rem', m: 0, whiteSpace: 'pre-wrap' }}>
            {leftLines.map((line, i) => {
              const isDiff = rightLines[i] !== line;
              return (
                <Box
                  key={i}
                  component="div"
                  sx={{
                    bgcolor: isDiff ? 'warning.light' : 'transparent',
                    px: 0.5,
                  }}
                >
                  {line || ' '}
                </Box>
              );
            })}
          </Box>
        </Paper>
        <Paper
          variant="outlined"
          sx={{ flex: 1, p: 1, overflow: 'auto', bgcolor: 'grey.50' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Server Version
          </Typography>
          <Box component="pre" sx={{ fontSize: '0.85rem', m: 0, whiteSpace: 'pre-wrap' }}>
            {rightLines.map((line, i) => {
              const isDiff = leftLines[i] !== line;
              return (
                <Box
                  key={i}
                  component="div"
                  sx={{
                    bgcolor: isDiff ? 'info.light' : 'transparent',
                    px: 0.5,
                  }}
                >
                  {line || ' '}
                </Box>
              );
            })}
          </Box>
        </Paper>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Conflict Detected
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          The note has been modified by another user while you were editing. Please choose how to
          resolve the conflict.
        </Alert>

        <Typography variant="subtitle2" gutterBottom>
          Compare Versions
        </Typography>

        {loading ? (
          <Typography color="text.secondary">Loading server content...</Typography>
        ) : (
          renderDiff(localContent, serverContent)
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          Resolution
        </Typography>

        <ToggleButtonGroup
          value={selectedVersion}
          exclusive
          onChange={handleVersionChange}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="local">Keep My Version</ToggleButton>
          <ToggleButton value="server">Use Server Version</ToggleButton>
          <ToggleButton value="merge">Manual Merge</ToggleButton>
        </ToggleButtonGroup>

        {selectedVersion === 'merge' && (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Edit merged content below:
            </Typography>
            <Box
              component="textarea"
              value={mergedContent}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setMergedContent(e.target.value)
              }
              sx={{
                width: '100%',
                height: 200,
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                border: 'none',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </Paper>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleResolve} disabled={loading}>
          Apply Resolution
        </Button>
      </DialogActions>
    </Dialog>
  );
}
