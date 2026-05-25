import { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, Tabs, Tab, Chip, Stack, Snackbar, Alert } from '@mui/material';
import { Save as SaveIcon, Edit as EditIcon, Visibility as ViewIcon, Delete as DeleteIcon, History as HistoryIcon, AttachFile as AttachFileIcon } from '@mui/icons-material';
import { useNoteStore } from '../stores/noteStore';
import { useWebSocketStore } from '../stores/websocketStore';
import type { Note } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';
import MarkdownEditor from './MarkdownEditor';
import VersionHistoryDialog from './VersionHistoryDialog';
import AttachmentManagerDialog from './AttachmentManagerDialog';
import ConflictDialog from './ConflictDialog';
import { EditorIndicator } from './NotificationBar';

interface Props {
  note: Note;
}

const EDITOR_MODE_KEY = 'valenote-editor-mode';

function getInitialMode(): 'edit' | 'preview' {
  const saved = localStorage.getItem(EDITOR_MODE_KEY);
  return saved === 'preview' ? 'preview' : 'edit';
}

export default function NoteEditor({ note }: Props) {
  const [content, setContent] = useState(note.content || '');
  const [mode, setMode] = useState<'edit' | 'preview'>(getInitialMode);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const { updateNote, deleteNote, setCurrentNote, loadNote } = useNoteStore();
  const { focusNote, blurNote, conflict, clearConflict } = useWebSocketStore();

  const conflictOpen = conflict !== null && conflict.path === note.path;

  useEffect(() => {
    setContent(note.content || '');
    focusNote(note.path);
    return () => {
      blurNote();
    };
  }, [note.path, note.content, focusNote, blurNote]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateNote(note.path, content);
      setSnackbar({ open: true, message: '保存成功', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: '保存失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [note.path, content, updateNote]);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      await deleteNote(note.path);
      setCurrentNote(null);
    }
  };

  const handleVersionRestore = () => {
    loadNote(note.path);
  };

  const handleConflictResolve = async (resolvedContent: string) => {
    setContent(resolvedContent);
    setSaving(true);
    try {
      await updateNote(note.path, resolvedContent);
    } finally {
      setSaving(false);
    }
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
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {note.title || note.path.split('/').pop()}
        </Typography>
        <EditorIndicator notePath={note.path} />
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
        <IconButton onClick={handleSave} disabled={saving} color="primary">
          <SaveIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={handleDelete} color="error">
          <DeleteIcon fontSize="small" />
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
          <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <MarkdownRenderer content={content} notePath={note.path} />
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
        onInsert={(link) => setContent((prev) => prev + '\n' + link)}
      />
      <ConflictDialog
        open={conflictOpen}
        onClose={clearConflict}
        notePath={note.path}
        localContent={content}
        onResolve={handleConflictResolve}
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
