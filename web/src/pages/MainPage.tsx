import { useState, useEffect } from 'react';
import { Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, TextField, InputAdornment, CircularProgress } from '@mui/material';
import { Menu as MenuIcon, Search as SearchIcon, Add as AddIcon, Folder as FolderIcon, Description as DescriptionIcon, Logout as LogoutIcon, Settings as SettingsIcon, Public as PublicIcon, SettingsApplications as AppSettingsIcon, LocalOffer as TagIcon, CreateNewFolder as CreateNewFolderIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useNoteStore } from '../stores/noteStore';
import NoteEditor from '../components/NoteEditor';
import CreateNoteDialog from '../components/CreateNoteDialog';
import CreateNotebookDialog from '../components/CreateNotebookDialog';
import NotebookSettingsDialog from '../components/NotebookSettingsDialog';
import SettingsDialog from '../components/SettingsDialog';
import TagPanel from '../components/TagPanel';
import type { Notebook } from '../services/api';

const DRAWER_WIDTH = 280;

export default function MainPage() {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [notebookSettingsOpen, setNotebookSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const { user, logout } = useAuthStore();
  const { notebooks, notes, currentNote, isLoading, loadNotebooks, loadNotes, loadNote } = useNoteStore();

  useEffect(() => {
    loadNotebooks();
    loadNotes();
  }, [loadNotebooks, loadNotes]);

  const handleNoteClick = (path: string) => {
    loadNote(path);
  };

  const handleNotebookSettings = (notebook: Notebook) => {
    setSelectedNotebook(notebook);
    setNotebookSettingsOpen(true);
  };

  const filteredNotes = notes.filter(
    (note) =>
      note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedNotes = filteredNotes.reduce((acc, note) => {
    const notebook = note.path.split('/')[0];
    if (!acc[notebook]) acc[notebook] = [];
    acc[notebook].push(note);
    return acc;
  }, {} as Record<string, typeof notes>);

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(!drawerOpen)} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            ValeNote
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.username}
          </Typography>
          <IconButton color="inherit" onClick={() => setAppSettingsOpen(true)} title="Settings">
            <AppSettingsIcon />
          </IconButton>
          <IconButton color="inherit" onClick={logout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        <Divider />
        <Box sx={{ p: 1 }}>
          <ListItemButton onClick={() => setCreateDialogOpen(true)}>
            <ListItemIcon><AddIcon /></ListItemIcon>
            <ListItemText primary="New Note" />
          </ListItemButton>
          <ListItemButton onClick={() => setCreateNotebookOpen(true)}>
            <ListItemIcon><CreateNewFolderIcon /></ListItemIcon>
            <ListItemText primary="New Notebook" />
          </ListItemButton>
          <ListItemButton onClick={() => setShowTags(!showTags)}>
            <ListItemIcon><TagIcon color={showTags ? 'primary' : 'inherit'} /></ListItemIcon>
            <ListItemText primary="Tags" />
          </ListItemButton>
        </Box>
        <Divider />
        {showTags ? (
          <Box sx={{ p: 1, overflow: 'auto', flexGrow: 1 }}>
            <TagPanel onTagClick={() => setShowTags(false)} />
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <List sx={{ overflow: 'auto', flexGrow: 1 }}>
            {Object.entries(groupedNotes).map(([notebookName, notebookNotes]) => {
              const notebook = notebooks.find(n => n.name === notebookName);
              return (
                <Box key={notebookName}>
                  <ListItem
                    secondaryAction={
                      notebook && (
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleNotebookSettings(notebook)}
                        >
                          {notebook.is_public ? <PublicIcon fontSize="small" color="primary" /> : <SettingsIcon fontSize="small" />}
                        </IconButton>
                      )
                    }
                  >
                    <ListItemIcon><FolderIcon /></ListItemIcon>
                    <ListItemText primary={notebook?.display_name || notebookName} />
                  </ListItem>
                  {notebookNotes.map((note) => (
                    <ListItemButton
                      key={note.path}
                      selected={currentNote?.path === note.path}
                      onClick={() => handleNoteClick(note.path)}
                      sx={{ pl: 4 }}
                    >
                      <ListItemIcon><DescriptionIcon /></ListItemIcon>
                      <ListItemText primary={note.title || note.path.split('/').pop()} slotProps={{ primary: { noWrap: true } }} />
                    </ListItemButton>
                  ))}
                </Box>
              );
            })}
          </List>
        )}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          ml: drawerOpen ? `${DRAWER_WIDTH}px` : 0,
          transition: 'margin 0.2s',
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

      <CreateNoteDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        notebooks={notebooks}
      />

      <CreateNotebookDialog
        open={createNotebookOpen}
        onClose={() => setCreateNotebookOpen(false)}
        onCreated={() => {
          loadNotebooks();
          loadNotes();
        }}
      />

      <NotebookSettingsDialog
        open={notebookSettingsOpen}
        onClose={() => setNotebookSettingsOpen(false)}
        notebook={selectedNotebook}
        onSave={() => {
          loadNotebooks();
          loadNotes();
        }}
      />

      <SettingsDialog
        open={appSettingsOpen}
        onClose={() => setAppSettingsOpen(false)}
        notebooks={notebooks}
      />
    </Box>
  );
}
