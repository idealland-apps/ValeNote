import { useState, useEffect, useCallback } from 'react';
import { Box, Drawer, AppBar, Toolbar, Typography, IconButton, Divider, TextField, InputAdornment, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import { Menu as MenuIcon, Search as SearchIcon, Logout as LogoutIcon, Settings as AppSettingsIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useNoteStore } from '../stores/noteStore';
import { useSiteStore } from '../stores/siteStore';
import NoteEditor from '../components/NoteEditor';
import { FileTree } from '../components/FileTree';
import CreateFolderDialog from '../components/CreateFolderDialog';
import CreateFileDialog from '../components/CreateFileDialog';
import CreateNotebookDialog from '../components/CreateNotebookDialog';
import RenameDialog from '../components/RenameDialog';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import NotebookSettingsDialog from '../components/NotebookSettingsDialog';
import SettingsDialog from '../components/SettingsDialog';
import SearchDialog from '../components/SearchDialog';
import type { Notebook } from '../services/api';

const DRAWER_WIDTH = 280;

export default function MainPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);

  useEffect(() => {
    setDrawerOpen(!isMobile);
  }, [isMobile]);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState('');
  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [createFileParent, setCreateFileParent] = useState('');
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [notebookSettingsOpen, setNotebookSettingsOpen] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder'; isNotebook: boolean } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string; type: 'file' | 'folder'; isNotebook: boolean } | null>(null);
  const [clipboardPath, setClipboardPath] = useState<string | null>(null);

  const { user, logout } = useAuthStore();
  const { notebooks, fileItems, currentNote, isLoading, loadNotebooks, loadFiles, loadNote, createNote, deleteNote, createFolder, deleteFolder, moveFile, copyFile, checkDirty } = useNoteStore();
  const { siteName } = useSiteStore();

  useEffect(() => {
    loadNotebooks();
    loadFiles();
  }, [loadNotebooks, loadFiles]);

  const handleFileSelect = useCallback((path: string) => {
    if (path.endsWith('.md')) {
      if (checkDirty()) {
        if (!window.confirm('当前笔记有未保存的修改，确定要离开吗？')) {
          return;
        }
      }
      loadNote(path);
    }
  }, [loadNote, checkDirty]);

  const handleCreateNotebook = useCallback(() => {
    setCreateNotebookOpen(true);
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    setCreateFolderParent(parentPath);
    setCreateFolderOpen(true);
  }, []);

  const handleCreateFolderConfirm = useCallback(async (name: string) => {
    const path = createFolderParent ? `${createFolderParent}/${name}` : name;
    await createFolder(path);
    setCreateFolderOpen(false);
  }, [createFolderParent, createFolder]);

  const handleCreateFile = useCallback((parentPath: string) => {
    setCreateFileParent(parentPath);
    setCreateFileOpen(true);
  }, []);

  const handleCreateFileConfirm = useCallback(async (name: string) => {
    const path = createFileParent ? `${createFileParent}/${name}` : name;
    await createNote({ path, content: '', title: name.replace(/\.[^.]+$/, '') });
    await loadFiles();
    setCreateFileOpen(false);
  }, [createFileParent, createNote, loadFiles]);

  const handleRename = useCallback((path: string, type: 'file' | 'folder', isNotebook: boolean) => {
    const name = path.split('/').pop() || '';
    setRenameTarget({ path, name, type, isNotebook });
    setRenameOpen(true);
  }, []);

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renameTarget) return;
    if (renameTarget.isNotebook) {
      // Notebook renaming not supported - use filesystem rename instead
      setRenameOpen(false);
      setRenameTarget(null);
      return;
    }
    const parentPath = renameTarget.path.split('/').slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    await moveFile(renameTarget.path, newPath);
    setRenameOpen(false);
    setRenameTarget(null);
  }, [renameTarget, moveFile]);

  const handleDelete = useCallback((path: string, type: 'file' | 'folder', isNotebook: boolean) => {
    const name = path.split('/').pop() || '';
    setDeleteTarget({ path, name, type, isNotebook });
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.isNotebook) {
      // Use notebook delete API
      await deleteFolder(deleteTarget.path);
      await loadNotebooks();
    } else if (deleteTarget.type === 'folder') {
      await deleteFolder(deleteTarget.path);
    } else {
      await deleteNote(deleteTarget.path);
      await loadFiles();
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteFolder, deleteNote, loadFiles, loadNotebooks]);

  const handleCopy = useCallback((path: string) => {
    setClipboardPath(path);
  }, []);

  const handlePaste = useCallback(async (targetPath: string) => {
    if (!clipboardPath) return;
    const name = clipboardPath.split('/').pop() || '';
    const newPath = targetPath ? `${targetPath}/${name}` : name;
    await copyFile(clipboardPath, newPath);
  }, [clipboardPath, copyFile]);

  const handleMove = useCallback(async (source: string, target: string) => {
    await moveFile(source, target);
  }, [moveFile]);

  const handleNotebookSettings = useCallback((notebookName: string) => {
    const notebook = notebooks.find(n => n.name === notebookName);
    if (notebook) {
      setSelectedNotebook(notebook);
      setNotebookSettingsOpen(true);
    }
  }, [notebooks]);

  const handleSearchSelect = useCallback((path: string) => {
    if (checkDirty()) {
      if (!window.confirm('当前笔记有未保存的修改，确定要离开吗？')) {
        return;
      }
    }
    loadNote(path);
  }, [loadNote, checkDirty]);

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(!drawerOpen)} sx={{ mr: 1 }}>
            <MenuIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1 }}>
            {siteName}
          </Typography>
          <Typography variant="body2" sx={{ mr: 1 }}>
            {user?.username}
          </Typography>
          <IconButton color="inherit" onClick={() => setAppSettingsOpen(true)} title="Settings">
            <AppSettingsIcon fontSize="small" />
          </IconButton>
          <IconButton color="inherit" onClick={logout}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: drawerOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ px: 1.5, py: 1 }}>
          <TextField
            fullWidth
            placeholder="Search..."
            onClick={() => setSearchDialogOpen(true)}
            slotProps={{
              input: {
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                sx: { cursor: 'pointer' },
              },
            }}
            sx={{ '& input': { cursor: 'pointer' } }}
          />
        </Box>
        <Divider />
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <FileTree
              items={fileItems}
              notebooks={notebooks}
              currentNotePath={currentNote?.path}
              onFileSelect={handleFileSelect}
              onCreateNotebook={handleCreateNotebook}
              onCreateFolder={handleCreateFolder}
              onCreateFile={handleCreateFile}
              onRename={handleRename}
              onDelete={handleDelete}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onMove={handleMove}
              onNotebookSettings={handleNotebookSettings}
              clipboardPath={clipboardPath}
            />
          </Box>
        )}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          transition: 'width 0.2s',
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <Toolbar />
        {currentNote ? (
          <NoteEditor note={currentNote} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80%', color: 'text.secondary' }}>
            <Typography variant="h6">Select a note or create a new one</Typography>
          </Box>
        )}
      </Box>

      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onConfirm={handleCreateFolderConfirm}
        parentPath={createFolderParent}
      />

      <CreateFileDialog
        open={createFileOpen}
        onClose={() => setCreateFileOpen(false)}
        onConfirm={handleCreateFileConfirm}
        parentPath={createFileParent}
      />

      <CreateNotebookDialog
        open={createNotebookOpen}
        onClose={() => setCreateNotebookOpen(false)}
        onCreated={() => {
          loadNotebooks();
          loadFiles();
        }}
      />

      <RenameDialog
        open={renameOpen}
        onClose={() => { setRenameOpen(false); setRenameTarget(null); }}
        onConfirm={handleRenameConfirm}
        currentName={renameTarget?.name || ''}
        type={renameTarget?.type || 'file'}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        onConfirm={handleDeleteConfirm}
        name={deleteTarget?.name || ''}
        type={deleteTarget?.isNotebook ? 'folder' : (deleteTarget?.type || 'file')}
      />

      <NotebookSettingsDialog
        open={notebookSettingsOpen}
        onClose={() => setNotebookSettingsOpen(false)}
        notebook={selectedNotebook}
        onSave={() => {
          loadNotebooks();
          loadFiles();
        }}
      />

      <SettingsDialog
        open={appSettingsOpen}
        onClose={() => setAppSettingsOpen(false)}
        notebooks={notebooks}
      />

      <SearchDialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        onSelect={handleSearchSelect}
        fileItems={fileItems}
      />
    </Box>
  );
}
