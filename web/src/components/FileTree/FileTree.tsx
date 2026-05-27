import React, { useRef, useState, useCallback } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Box, Typography, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  FolderShared as FolderSharedIcon,
  FolderSharedOutlined as FolderSharedOpenIcon,
  DescriptionOutlined as FileOutlinedIcon,
  CreateNewFolder as NewFolderIcon,
  NoteAdd as NewFileIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  DriveFileRenameOutline as RenameIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useFileTree } from './useFileTree';
import type { TreeNode, FileItem } from './useFileTree';
import type { Notebook } from '../../services/api';

const DRAG_TYPE = 'FILE_TREE_ITEM';

interface DragItem {
  id: string;
  type: 'file' | 'folder';
  isNotebook: boolean;
}

interface DraggableTreeItemProps {
  node: TreeNode;
  expandedIds: string[];
  selectedId: string | null;
  currentNotePath?: string | null;
  notebooks: Notebook[];
  onMove: (source: string, targetFolder: string) => void;
  onSelect: (path: string, type: 'file' | 'folder') => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
}

function DraggableTreeItem({ node, expandedIds, selectedId, currentNotePath, notebooks, onMove, onSelect, onContextMenu }: DraggableTreeItemProps) {
  const ref = useRef<HTMLLIElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: DRAG_TYPE,
    item: { id: node.id, type: node.type, isNotebook: node.isNotebook },
    canDrag: !node.isNotebook,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: DRAG_TYPE,
    canDrop: (item: DragItem) => {
      if (node.type !== 'folder') return false;
      if (item.id === node.id) return false;
      if (item.id.startsWith(node.id + '/')) return false;
      if (node.id.startsWith(item.id + '/')) return false;
      if (item.isNotebook) return false;
      return true;
    },
    drop: (item: DragItem) => {
      const sourceName = item.id.split('/').pop()!;
      const targetPath = `${node.id}/${sourceName}`;
      onMove(item.id, targetPath);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drag(drop(ref));

  const isExpanded = expandedIds.includes(node.id);
  const notebook = node.isNotebook ? notebooks.find(n => n.name === node.id) : null;
  const isPublic = notebook?.is_public;

  let icon;
  if (node.isNotebook) {
    if (isPublic) {
      icon = isExpanded
        ? <FolderSharedOpenIcon fontSize="small" color="primary" />
        : <FolderSharedIcon fontSize="small" color="primary" />;
    } else {
      icon = isExpanded
        ? <FolderOpenIcon fontSize="small" color="primary" />
        : <FolderIcon fontSize="small" color="primary" />;
    }
  } else if (node.type === 'folder') {
    icon = isExpanded
      ? <FolderOpenIcon fontSize="small" color="action" />
      : <FolderIcon fontSize="small" color="action" />;
  } else {
    icon = <FileOutlinedIcon fontSize="small" />;
  }

  const normalizedCurrentPath = currentNotePath?.replace(/^\//, '');
  const isCurrentNote = node.type === 'file' && normalizedCurrentPath === node.id;

  return (
    <TreeItem
      ref={ref}
      itemId={node.id}
      sx={{
        '& > .MuiTreeItem-content': {
          py: 0,
          minHeight: 24,
          ...(isCurrentNote && {
            bgcolor: 'rgba(33, 150, 243, 0.12)',
            borderRadius: 1,
          }),
        },
      }}
      label={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            py: 0,
            opacity: isDragging ? 0.5 : 1,
            bgcolor: isOver && canDrop ? 'action.hover' : 'transparent',
            borderRadius: 1,
          }}
          onClick={() => onSelect(node.id, node.type)}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          {icon}
          <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontSize: '0.8rem' }}>
            {node.label}
          </Typography>
        </Box>
      }
    >
      {node.children.map(child => (
        <DraggableTreeItem
          key={child.id}
          node={child}
          expandedIds={expandedIds}
          selectedId={selectedId}
          currentNotePath={currentNotePath}
          notebooks={notebooks}
          onMove={onMove}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </TreeItem>
  );
}

export interface FileTreeProps {
  items: FileItem[];
  notebooks: Notebook[];
  currentNotePath?: string | null;
  onFileSelect: (path: string) => void;
  onCreateNotebook: () => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onRename: (path: string, type: 'file' | 'folder', isNotebook: boolean) => void;
  onDelete: (path: string, type: 'file' | 'folder', isNotebook: boolean) => void;
  onCopy: (path: string) => void;
  onPaste: (targetPath: string) => void;
  onMove: (source: string, target: string) => void;
  onNotebookSettings: (notebookName: string) => void;
  clipboardPath: string | null;
}

export default function FileTree({
  items,
  notebooks,
  currentNotePath,
  onFileSelect,
  onCreateNotebook,
  onCreateFolder,
  onCreateFile,
  onRename,
  onDelete,
  onCopy,
  onPaste,
  onMove,
  onNotebookSettings,
  clipboardPath,
}: FileTreeProps) {
  const { tree, expandedIds, selectedId, handleExpandedChange, handleSelectChange, setSelectedId, expandTo } = useFileTree(items);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-expand to current note and select it
  React.useEffect(() => {
    if (currentNotePath) {
      expandTo(currentNotePath);
      setSelectedId(currentNotePath);
    }
  }, [currentNotePath, expandTo, setSelectedId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).closest('[data-empty-area]')) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node: null });
    }
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const handleSelect = useCallback((path: string, type: 'file' | 'folder') => {
    setSelectedId(path);
    if (type === 'file') {
      onFileSelect(path);
    }
  }, [setSelectedId, onFileSelect]);

  const handleTreeSelectChange = useCallback((_event: React.SyntheticEvent | null, nodeId: string | null) => {
    handleSelectChange(_event, nodeId);
  }, [handleSelectChange]);

  const menuNode = contextMenu?.node;
  const isFolder = menuNode?.type === 'folder' || menuNode === null;
  const isNotebook = menuNode?.isNotebook || false;
  const isRootContext = menuNode === null;
  const parentPath = menuNode ? (menuNode.type === 'folder' ? menuNode.id : menuNode.id.split('/').slice(0, -1).join('/') || '') : '';

  return (
    <DndProvider backend={HTML5Backend}>
      <Box
        ref={containerRef}
        sx={{ height: '100%', overflow: 'auto' }}
        onContextMenu={handleContainerContextMenu}
      >
        {tree.length === 0 ? (
          <Box data-empty-area sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No files yet</Typography>
            <Typography variant="caption">Right-click to create a notebook</Typography>
          </Box>
        ) : (
          <SimpleTreeView
            expandedItems={expandedIds}
            selectedItems={selectedId}
            onExpandedItemsChange={handleExpandedChange}
            onSelectedItemsChange={handleTreeSelectChange}
          >
            {tree.map(node => (
              <DraggableTreeItem
                key={node.id}
                node={node}
                expandedIds={expandedIds}
                selectedId={selectedId}
                currentNotePath={currentNotePath}
                notebooks={notebooks}
                onMove={onMove}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </SimpleTreeView>
        )}

        <Menu
          open={contextMenu !== null}
          onClose={closeMenu}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
          transitionDuration={0}
          slotProps={{
            paper: {
              sx: {
                '& .MuiMenuItem-root': {
                  py: 0.25,
                  minHeight: 24,
                  fontSize: '0.75rem',
                },
                '& .MuiListItemIcon-root': {
                  minWidth: 24,
                },
                '& .MuiListItemText-primary': {
                  fontSize: '0.75rem',
                },
                '& .MuiDivider-root': {
                  my: 0.25,
                },
                '& .MuiSvgIcon-root': {
                  fontSize: '1rem',
                },
              },
            },
          }}
        >
          {isRootContext && (
            <MenuItem onClick={() => { onCreateNotebook(); closeMenu(); }}>
              <ListItemIcon><FolderIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>New Notebook</ListItemText>
            </MenuItem>
          )}

          {isNotebook && menuNode && (
            <>
              <MenuItem onClick={() => { onNotebookSettings(menuNode.id); closeMenu(); }}>
                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Notebook Settings</ListItemText>
              </MenuItem>
              <Divider />
            </>
          )}

          {isFolder && !isRootContext && (
            <>
              <MenuItem onClick={() => { onCreateFolder(parentPath); closeMenu(); }}>
                <ListItemIcon><NewFolderIcon fontSize="small" /></ListItemIcon>
                <ListItemText>New Folder</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { onCreateFile(parentPath); closeMenu(); }}>
                <ListItemIcon><NewFileIcon fontSize="small" /></ListItemIcon>
                <ListItemText>New File</ListItemText>
              </MenuItem>
              <Divider />
            </>
          )}

          {menuNode && !isNotebook && (
            <MenuItem onClick={() => { onCopy(menuNode.id); closeMenu(); }}>
              <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Copy</ListItemText>
            </MenuItem>
          )}

          {isFolder && !isRootContext && clipboardPath && (
            <MenuItem onClick={() => { onPaste(parentPath); closeMenu(); }}>
              <ListItemIcon><PasteIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Paste</ListItemText>
            </MenuItem>
          )}

          {menuNode && (
            <>
              <Divider />
              <MenuItem onClick={() => { onRename(menuNode.id, menuNode.type, isNotebook); closeMenu(); }}>
                <ListItemIcon><RenameIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Rename</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { onDelete(menuNode.id, menuNode.type, isNotebook); closeMenu(); }} sx={{ color: 'error.main' }}>
                <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </>
          )}
        </Menu>
      </Box>
    </DndProvider>
  );
}
