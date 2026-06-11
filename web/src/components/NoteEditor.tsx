import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, IconButton, Tabs, Tab, Chip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Tooltip } from '@mui/material';
import { Save as SaveIcon, Edit as EditIcon, Visibility as ViewIcon, History as HistoryIcon, AttachFile as AttachFileIcon, FileDownload as ExportIcon, Menu as MenuIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';
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
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
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
          Note: If you choose "Force Overwrite", the server version being overwritten can be recovered from version history.
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

export default function NoteEditor({ note, sidebarCollapsed, onExpandSidebar }: Props) {
  const [content, setContent] = useState(note.content || '');
  const [mode, setMode] = useState<'edit' | 'preview'>(getInitialMode);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<{ show: boolean; success: boolean; message: string }>({ show: false, success: true, message: '' });
  const [conflictDialog, setConflictDialog] = useState<{ open: boolean; detail: ConflictDetail | null }>({ open: false, detail: null });
  const { updateNote, forceUpdateNote, loadNote, setDirtyChecker, clearDirtyChecker } = useNoteStore();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

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

  const showSaveToast = (success: boolean, message: string) => {
    setSaveToast({ show: true, success, message });
    setTimeout(() => setSaveToast(prev => ({ ...prev, show: false })), 2000);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateNote(note.path, content);
      showSaveToast(true, 'Saved');
    } catch (error) {
      if (error instanceof ConflictError) {
        setConflictDialog({ open: true, detail: error.detail });
      } else {
        showSaveToast(false, 'Save failed');
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
      showSaveToast(true, 'Force overwritten');
    } catch {
      showSaveToast(false, 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setConflictDialog({ open: false, detail: null });
    loadNote(note.path);
    showSaveToast(true, 'Loaded server version');
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
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.paper',
    }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {sidebarCollapsed && (
          <Tooltip title="Expand sidebar">
            <IconButton onClick={onExpandSidebar} size="small">
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        <Typography variant="subtitle1" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
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
        <Tabs value={mode} onChange={(_, v) => { setMode(v); localStorage.setItem(EDITOR_MODE_KEY, v); }} sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, minWidth: 40, p: 0.75 } }}>
          <Tab
            icon={
              <Tooltip title="Edit">
                <EditIcon sx={{ fontSize: 18 }} />
              </Tooltip>
            }
            value="edit"
          />
          <Tab
            icon={
              <Tooltip title="Preview">
                <ViewIcon sx={{ fontSize: 18 }} />
              </Tooltip>
            }
            value="preview"
          />
        </Tabs>
        <Tooltip title="Version History">
          <IconButton onClick={() => setHistoryOpen(true)} size="small">
            <HistoryIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Attachments">
          <IconButton onClick={() => setAttachmentOpen(true)} size="small">
            <AttachFileIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export">
          <IconButton onClick={() => setExportOpen(true)} size="small">
            <ExportIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Box
            sx={{
              position: 'absolute',
              right: '100%',
              mr: 0.5,
              px: 5,
              py: 0.75,
              borderRadius: 1,
              bgcolor: saveToast.success ? 'success.light' : 'error.light',
              color: 'white',
              fontSize: '0.85rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              boxShadow: 2,
              overflow: 'hidden',
              transformOrigin: 'right center',
              transform: saveToast.show ? 'scaleX(1)' : 'scaleX(0)',
              opacity: saveToast.show ? 1 : 0,
              transition: 'transform 0.25s ease-out, opacity 0.2s ease-out',
              minWidth: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
            }}
          >
            {saveToast.success ? <CheckCircleIcon sx={{ fontSize: 18 }} /> : <ErrorIcon sx={{ fontSize: 18 }} />}
            {saveToast.message}
          </Box>
          <Tooltip title="Save">
            <span>
              <IconButton ref={saveButtonRef} onClick={handleSave} disabled={saving} color="primary" size="small">
                <SaveIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
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
    </Box>
  );
}
