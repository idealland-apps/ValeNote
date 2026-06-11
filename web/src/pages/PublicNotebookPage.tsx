import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Box, Drawer, Typography, CircularProgress, List, ListItem, ListItemButton, ListItemText, Alert, Paper, Breadcrumbs, Link, IconButton, useMediaQuery, useTheme, Tooltip } from '@mui/material';
import { Description as FileIcon, Folder as FolderIcon, Menu as MenuIcon, MenuOpen as MenuOpenIcon } from '@mui/icons-material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { publicApi, type PublicTreeItem, type Note } from '../services/api';
import { useSiteStore } from '../stores/siteStore';
import { PUBLIC_BASE_PATH } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import TableOfContents from '../components/TableOfContents';
import { formatDate } from '../utils/time';

const DRAWER_WIDTH = 280;

function findNodeByPath(node: PublicTreeItem, targetPath: string): PublicTreeItem | null {
  if (node.path === targetPath) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function resolveUrlPath(tree: PublicTreeItem, urlPath: string): PublicTreeItem | null {
  const exactMatch = findNodeByPath(tree, urlPath);
  if (exactMatch) return exactMatch;

  const withMd = findNodeByPath(tree, urlPath + '.md');
  if (withMd) return withMd;

  return null;
}

function hasSiblingFolder(tree: PublicTreeItem, filePath: string): boolean {
  if (!filePath.endsWith('.md')) return false;
  const folderPath = filePath.slice(0, -3);
  return findNodeByPath(tree, folderPath)?.type === 'folder';
}

function renderTreeItem(node: PublicTreeItem): React.ReactNode {
  const displayName = node.type === 'file' && node.name.endsWith('.md')
    ? node.name.slice(0, -3)
    : node.name;

  return (
    <TreeItem
      key={node.path}
      itemId={node.path}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
          {node.type === 'folder' ? <FolderIcon fontSize="small" color="primary" /> : <FileIcon fontSize="small" />}
          <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontSize: '0.8rem' }}>
            {displayName}
          </Typography>
        </Box>
      }
    >
      {node.children?.map(child => renderTreeItem(child))}
    </TreeItem>
  );
}

export default function PublicNotebookPage() {
  const { notebook, '*': subPath } = useParams<{ notebook: string; '*': string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { siteName, showPoweredBy } = useSiteStore();
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [tree, setTree] = useState<PublicTreeItem | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [content, setContent] = useState<{ type: 'note' | 'folder'; data: Note | Note[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    setDrawerOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (!notebook) return;

    setLoading(true);
    setError(null);

    publicApi.getTree(notebook)
      .then(res => {
        setTree(res.data);
        setExpandedItems([res.data.path]);
      })
      .catch(() => {
        setError('Notebook not found or not public');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [notebook]);

  useEffect(() => {
    if (!notebook) {
      document.title = siteName;
      return;
    }

    const currentTitle = subPath ? subPath.split('/').pop()?.replace(/\.md$/, '') || notebook : notebook;
    document.title = `${currentTitle} - ${siteName}`;
  }, [notebook, subPath, siteName]);

  useEffect(() => {
    if (!notebook || !tree) return;

    const urlPath = subPath ? `${notebook}/${subPath}` : notebook;

    if (urlPath === notebook || !subPath) {
      setSelectedPath(notebook);
      publicApi.getFolderNotes(notebook)
        .then(res => setContent({ type: 'folder', data: res.data }))
        .catch(() => setContent(null));
      return;
    }

    const node = resolveUrlPath(tree, urlPath);

    if (node) {
      setSelectedPath(node.path);
      const pathParts = node.path.split('/');
      const pathsToExpand = pathParts.slice(0, -1).map((_, i) => pathParts.slice(0, i + 1).join('/'));
      setExpandedItems(prev => [...new Set([...prev, ...pathsToExpand])]);

      if (node.type === 'file') {
        const notePath = node.path.slice(notebook.length + 1);
        publicApi.getNote(notebook, notePath)
          .then(res => setContent({ type: 'note', data: res.data }))
          .catch(() => setContent(null));
      } else {
        const folderPath = node.path.slice(notebook.length + 1);
        publicApi.getFolderNotes(notebook, folderPath)
          .then(res => setContent({ type: 'folder', data: res.data }))
          .catch(() => setContent(null));
      }
    } else {
      setSelectedPath(undefined);
      publicApi.getFolderNotes(notebook, subPath)
        .then(res => setContent({ type: 'folder', data: res.data }))
        .catch(() => {
          publicApi.getNote(notebook, subPath)
            .then(res => setContent({ type: 'note', data: res.data }))
            .catch(() => setContent(null));
        });
    }
  }, [notebook, subPath, tree]);

  const handleItemSelect = useCallback((_event: React.SyntheticEvent | null, itemId: string | null) => {
    if (!itemId || typeof itemId !== 'string' || !notebook || !tree) return;

    let cleanPath = itemId;
    if (itemId.endsWith('.md')) {
      if (hasSiblingFolder(tree, itemId)) {
        cleanPath = itemId;
      } else {
        cleanPath = itemId.slice(0, -3);
      }
    }

    const newPath = cleanPath === notebook ? `${PUBLIC_BASE_PATH}/${notebook}` : `${PUBLIC_BASE_PATH}/${cleanPath}`;
    navigate(newPath);
  }, [navigate, notebook, tree]);

  const handleNoteClick = useCallback((notePath: string) => {
    if (!tree) return;

    let cleanPath = notePath;
    if (notePath.endsWith('.md')) {
      if (hasSiblingFolder(tree, notePath)) {
        cleanPath = notePath;
      } else {
        cleanPath = notePath.slice(0, -3);
      }
    }

    navigate(`${PUBLIC_BASE_PATH}/${cleanPath}`);
  }, [navigate, tree]);

  const handleExpandedItemsChange = useCallback((_event: React.SyntheticEvent | null, itemIds: string[]) => {
    setExpandedItems(itemIds);
  }, []);

  const breadcrumbs = location.pathname
    .replace(new RegExp(`^${PUBLIC_BASE_PATH}/`), '')
    .split('/')
    .filter(Boolean)
    .map((part, index, arr) => {
      const path = `${PUBLIC_BASE_PATH}/${arr.slice(0, index + 1).join('/')}`;
      const isLast = index === arr.length - 1;
      const decodedPart = decodeURIComponent(part);
      return isLast ? (
        <Typography key={path} color="text.primary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={decodedPart}>{decodedPart}</Typography>
      ) : (
        <Link key={path} underline="hover" color="inherit" href={path} onClick={(e) => { e.preventDefault(); navigate(path); }} sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }} title={decodedPart}>
          {decodedPart}
        </Link>
      );
    });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: drawerOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        {/* Header: Logo + Site Name + Collapse Button */}
        <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', minHeight: 48 }}>
          <Box component="img" src="/favicon.svg" sx={{ width: 24, height: 24, minWidth: 24, minHeight: 24, maxWidth: 24, maxHeight: 24, flexShrink: 0, borderRadius: '4px' }} />
          <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1, fontWeight: 500 }}>
            {siteName}
          </Typography>
          <Tooltip title="Collapse sidebar">
            <IconButton onClick={() => setDrawerOpen(false)} size="small">
              <MenuOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* File Tree */}
        <Box sx={{ overflow: 'auto', p: 1, flexGrow: 1 }}>
          {tree && (
            <SimpleTreeView
              selectedItems={selectedPath}
              onSelectedItemsChange={handleItemSelect}
              expandedItems={expandedItems}
              onExpandedItemsChange={handleExpandedItemsChange}
            >
              {renderTreeItem(tree)}
            </SimpleTreeView>
          )}
        </Box>

        {/* Credit */}
        {showPoweredBy && (
          <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              Powered by{' '}
              <Link
                href="https://github.com/idealland-apps/ValeNote"
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
              >
                ValeNote
              </Link>
            </Typography>
          </Box>
        )}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top bar with breadcrumbs */}
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper', minHeight: 48 }}>
          {!drawerOpen && (
            <Tooltip title="Expand sidebar">
              <IconButton onClick={() => setDrawerOpen(true)} size="small">
                <MenuIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Breadcrumbs sx={{ flexGrow: 1, flexWrap: 'nowrap', overflow: 'hidden', '& ol': { flexWrap: 'nowrap' } }}>
            {breadcrumbs}
          </Breadcrumbs>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {content?.type === 'note' && !Array.isArray(content.data) && (
            <Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
              <Paper ref={contentContainerRef} sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}>
                <MarkdownRenderer
                  content={content.data.content || ''}
                  notePath={content.data.path}
                  isPublic={true}
                  notebook={notebook}
                />
              </Paper>
              <TableOfContents containerRef={contentContainerRef} isPublic />
            </Box>
          )}

          {content?.type === 'folder' && Array.isArray(content.data) && (
            <Paper>
              <List>
                {content.data.length === 0 ? (
                  <ListItem>
                    <ListItemText primary="No notes in this folder" secondary="This folder is empty" />
                  </ListItem>
                ) : (
                  content.data.map(note => (
                    <ListItemButton key={note.path} onClick={() => handleNoteClick(note.path)}>
                      <FileIcon sx={{ mr: 2, color: 'text.secondary' }} />
                      <ListItemText
                        primary={note.title || note.path.split('/').pop()?.replace(/\.md$/, '')}
                        secondary={formatDate(note.updated_at)}
                      />
                    </ListItemButton>
                  ))
                )}
              </List>
            </Paper>
          )}

          {!content && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'text.secondary' }}>
              <Typography>Select a note or folder from the sidebar</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
