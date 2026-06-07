import { useMemo, useState, useCallback, useEffect } from 'react';
import { containsReservedFolder } from '../../constants';

export interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  updated_at?: number;
}

export interface TreeNode {
  id: string;
  label: string;
  type: 'file' | 'folder';
  isNotebook: boolean;
  children: TreeNode[];
  size?: number;
  updatedAt?: number;
}

const EXPANDED_KEY = 'valenote_expanded_folders';

export function buildTree(items: FileItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  const filtered = items.filter(item => !containsReservedFolder(item.path));

  const sorted = [...filtered].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of sorted) {
    const parts = item.path.split('/');
    let currentPath = '';
    let parent: TreeNode[] = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isRootLevel = i === 0;

      let node = map.get(currentPath);
      if (!node) {
        node = {
          id: currentPath,
          label: part,
          type: isLast ? item.type : 'folder',
          isNotebook: isRootLevel && (isLast ? item.type === 'folder' : true),
          children: [],
          size: isLast ? item.size : undefined,
          updatedAt: isLast ? item.updated_at : undefined,
        };
        map.set(currentPath, node);
        parent.push(node);
      }
      parent = node.children;
    }
  }

  return root;
}

export function useFileTree(items: FileItem[]) {
  const [expandedIds, setExpandedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(items), [items]);

  const handleExpandedChange = useCallback((_event: React.SyntheticEvent | null, nodeIds: string[]) => {
    setExpandedIds(nodeIds);
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(nodeIds));
  }, []);

  const handleSelectChange = useCallback((_event: React.SyntheticEvent | null, nodeId: string | null) => {
    setSelectedId(nodeId);
  }, []);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedIds(prev => {
      const newIds = prev.includes(nodeId)
        ? prev.filter(id => id !== nodeId)
        : [...prev, nodeId];
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(newIds));
      return newIds;
    });
  }, []);

  const expandTo = useCallback((path: string) => {
    const parts = path.split('/');
    const pathsToExpand: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      pathsToExpand.push(current);
    }
    setExpandedIds(prev => {
      const newIds = [...new Set([...prev, ...pathsToExpand])];
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(newIds));
      return newIds;
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    const folderPaths = new Set<string>();
    for (const item of items) {
      const parts = item.path.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        folderPaths.add(current);
      }
      if (item.type === 'folder') folderPaths.add(item.path);
    }

    setExpandedIds(prev => {
      const filtered = prev.filter(id => folderPaths.has(id));
      if (filtered.length !== prev.length) {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(filtered));
      }
      return filtered;
    });
  }, [items]);

  return {
    tree,
    expandedIds,
    selectedId,
    handleExpandedChange,
    handleSelectChange,
    toggleExpand,
    expandTo,
    setSelectedId,
  };
}
