import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Paper, Typography, IconButton, Tabs, Tab, Chip, Stack, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { Save as SaveIcon, Edit as EditIcon, Visibility as ViewIcon, History as HistoryIcon, AttachFile as AttachFileIcon, FileDownload as ExportIcon } from '@mui/icons-material';
import { useNoteStore, ConflictError } from '../stores/noteStore';
import type { Note, ConflictDetail } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';
import MarkdownEditor from './MarkdownEditor';
import VersionHistoryDialog from './VersionHistoryDialog';
import AttachmentManagerDialog from './AttachmentManagerDialog';
import ExportDialog from './ExportDialog';
import TableOfContents from './TableOfContents';
import { formatTimestamp } from '../utils/time';

interface Props {
  note: Note;
}

const EDITOR_MODE_KEY = 'valenote-editor-mode';

function getInitialMode(): 'edit' | 'preview' {
  const saved = localStorage.getItem(EDITOR_MODE_KEY);
  return saved === 'preview' ? 'preview' : 'edit';
}

interface ConflictDialogProps {
  open: boolean;
  onClose: () => void;
  detail: ConflictDetail | null;
  onForceOverwrite: () => void;
  onDiscard: () => void;
}

function ConflictDialog({ open, onClose, detail, onForceOverwrite, onDiscard }: ConflictDialogProps) {
  if (!detail) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Conflict</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This note has been modified elsewhere while you were editing. Please choose how to proceed:
        </DialogContentText>
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Server version info:
          </Typography>
          <Typography variant="body2">
            Modified at: {formatTimestamp(detail.modified_at)}
          </Typography>
          <Typography variant="body2">
            File size: {detail.size} bytes
          </Typography>
          {detail.preview && (
            <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              Preview: {detail.preview}
            </Typography>
          )}
        </Box>
        <DialogContentText variant="body2" color="text.secondary">
          Note: Whichever option you choose, the overwritten version can be recovered from version history.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onDiscard} color="warning">
          Discard My Changes
        </Button>
        <Button onClick={onForceOverwrite} color="error" variant="contained">
          Force Overwrite
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function NoteEditor({ note }: Props) {
  const [content, setContent] = useState(note.content || '');
  const [mode, setMode] = useState<'edit' | 'preview'>(getInitialMode);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [conflictDialog, setConflictDialog] = useState<{ open: boolean; detail: ConflictDetail | null }>({ open: false, detail: null });
  const { updateNote, forceUpdateNote, setCurrentNote, loadNote, setDirtyChecker, clearDirtyChecker } = useNoteStore();
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const isDirty = content !== (note.content || '');

  const contentRef = useRef(content);
  const noteContentRef = useRef(note.content);
  contentRef.current = content;
  noteContentRef.current = note.content;

  useEffect(() => {
    setContent(note.content || '');
  }, [note.path, note.content]);

  useEffect(() => {
    setDirtyChecker(() => contentRef.current !== (noteContentRef.current || ''));
    return () => clearDirtyChecker();
  }, [note.path, setDirtyChecker, clearDirtyChecker]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contentRef.current !== (noteContentRef.current || '')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [note.path]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateNote(note.path, content);
      setSnackbar({ open: true, message: 'Saved', severity: 'success' });
    } catch (error) {
      if (error instanceof ConflictError) {
        setConflictDialog({ open: true, detail: error.detail });
      } else {
        setSnackbar({ open: true, message: 'Save failed', severity: 'error' });
      }
    } finally {
      setSaving(false);
    }
  }, [note.path, content, updateNote]);

  const handleForceOverwrite = async () => {
    setConflictDialog({ open: false, detail: null });
    setSaving(true);
    try {
      await forceUpdateNote(note.path, content);
      setSnackbar({ open: true, message: 'Force overwritten', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setConflictDialog({ open: false, detail: null });
    loadNote(note.path);
    setSnackbar({ open: true, message: 'Loaded server version', severity: 'success' });
  };

  const handleVersionRestore = () => {
    loadNote(note.path);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <Paper sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {note.title || note.path.split('/').pop()}
          {isDirty && (
            <Chip
              label="Unsaved"
              size="small"
              color="warning"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          )}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {note.tags?.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </Stack>
        <Tabs value={mode} onChange={(_, v) => { setMode(v); localStorage.setItem(EDITOR_MODE_KEY, v); }}>
          <Tab icon={<EditIcon fontSize="small" />} value="edit" />
          <Tab icon={<ViewIcon fontSize="small" />} value="preview" />
        </Tabs>
        <IconButton onClick={() => setHistoryOpen(true)} title="Version History">
          <HistoryIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={() => setAttachmentOpen(true)} title="Attachments">
          <AttachFileIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={() => setExportOpen(true)} title="Export">
          <ExportIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={handleSave} disabled={saving} color="primary">
          <SaveIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {mode === 'edit' ? (
          <MarkdownEditor
            value={content}
            onChange={setContent}
            notePath={note.path}
          />
        ) : (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <Box ref={previewContainerRef} sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              <MarkdownRenderer content={content} notePath={note.path} />
            </Box>
            <TableOfContents containerRef={previewContainerRef} />
          </Box>
        )}
      </Box>
      <VersionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        notePath={note.path}
        onRestore={handleVersionRestore}
      />
      <AttachmentManagerDialog
        open={attachmentOpen}
        onClose={() => setAttachmentOpen(false)}
        notePath={note.path}
        markdownContent={content}
        onInsert={(link) => setContent((prev) => prev + '\n' + link)}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        notePath={note.path}
        noteTitle={note.title || note.path.split('/').pop() || 'note'}
        content={content}
      />
      <ConflictDialog
        open={conflictDialog.open}
        onClose={() => setConflictDialog({ open: false, detail: null })}
        detail={conflictDialog.detail}
        onForceOverwrite={handleForceOverwrite}
        onDiscard={handleDiscardChanges}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  );
}
