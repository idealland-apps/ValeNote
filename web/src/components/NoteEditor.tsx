import { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, Tabs, Tab, Chip, Stack } from '@mui/material';
import { Save as SaveIcon, Edit as EditIcon, Visibility as ViewIcon, Delete as DeleteIcon, History as HistoryIcon } from '@mui/icons-material';
import { useNoteStore } from '../stores/noteStore';
import { useWebSocketStore } from '../stores/websocketStore';
import type { Note } from '../services/api';
import MilkdownEditor from './MilkdownEditor';
import VersionHistoryDialog from './VersionHistoryDialog';
import ConflictDialog from './ConflictDialog';
import { EditorIndicator } from './NotificationBar';

interface Props {
  note: Note;
}

export default function NoteEditor({ note }: Props) {
  const [content, setContent] = useState(note.content || '');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {note.title || note.path.split('/').pop()}
        </Typography>
        <EditorIndicator notePath={note.path} />
        <Stack direction="row" spacing={1}>
          {note.tags?.map((tag) => (
            <Chip key={tag} label={tag} size="small" />
          ))}
        </Stack>
        <Tabs value={mode} onChange={(_, v) => setMode(v)} sx={{ minHeight: 36 }}>
          <Tab icon={<EditIcon />} value="edit" sx={{ minHeight: 36, minWidth: 48 }} />
          <Tab icon={<ViewIcon />} value="preview" sx={{ minHeight: 36, minWidth: 48 }} />
        </Tabs>
        <IconButton onClick={() => setHistoryOpen(true)} title="Version History">
          <HistoryIcon />
        </IconButton>
        <IconButton onClick={handleSave} disabled={saving} color="primary">
          <SaveIcon />
        </IconButton>
        <IconButton onClick={handleDelete} color="error">
          <DeleteIcon />
        </IconButton>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        {mode === 'edit' ? (
          <MilkdownEditor value={content} onChange={setContent} notePath={note.path} />
        ) : (
          <Box
            sx={{ '& h1, & h2, & h3': { mt: 2, mb: 1 }, '& p': { mb: 1 }, '& code': { bgcolor: 'grey.100', px: 0.5, borderRadius: 0.5 } }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </Box>
      <VersionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        notePath={note.path}
        onRestore={handleVersionRestore}
      />
      <ConflictDialog
        open={conflictOpen}
        onClose={clearConflict}
        notePath={note.path}
        localContent={content}
        onResolve={handleConflictResolve}
      />
    </Paper>
  );
}
