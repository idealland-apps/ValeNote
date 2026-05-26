import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  email?: string;
  is_admin: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Notebook {
  id: number;
  name: string;
  description?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Note {
  path: string;
  title: string;
  content?: string;
  tags?: string[];
  size: number;
  created_at: string;
  updated_at: string;
  etag?: string;
}

export interface ConflictDetail {
  modified_at: string;
  size: number;
  preview: string;
}

export interface ConflictError {
  error: 'conflict';
  message: string;
  detail: ConflictDetail;
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }),
  me: () => api.get<User>('/auth/me'),
};

export const userApi = {
  list: () => api.get<User[]>('/users'),
  create: (data: { username: string; password: string; email?: string; is_admin: boolean }) =>
    api.post<User>('/users', data),
  update: (id: number, data: { username?: string; email?: string; is_admin?: boolean }) =>
    api.put<User>(`/users/${id}`, data),
  updatePassword: (id: number, password: string) =>
    api.put(`/users/${id}/password`, { password }),
  delete: (id: number) => api.delete(`/users/${id}`),
};

export const notebookApi = {
  list: () => api.get<Notebook[]>('/notebooks'),
  create: (data: { name: string; description?: string }) =>
    api.post<Notebook>('/notebooks', data),
  get: (name: string) => api.get<Notebook>(`/notebooks/${name}`),
  update: (name: string, data: { description?: string; is_public?: boolean }) =>
    api.put<Notebook>(`/notebooks/${name}`, data),
  delete: (name: string) => api.delete(`/notebooks/${name}`),
};

export interface SearchResult {
  path: string;
  title: string;
  snippet?: string;
  tags?: string[];
  notebook: string;
}

export const noteApi = {
  list: (notebook?: string, recursive = true) =>
    api.get<Note[]>('/notes', { params: { notebook, recursive } }),
  get: (path: string) => api.get<Note>(`/notes/${path}`),
  create: (data: { path: string; title?: string; content: string; tags?: string[] }) =>
    api.post<Note>('/notes', data),
  update: (path: string, data: { content: string; append?: boolean; etag?: string }) =>
    api.put<Note>(`/notes/${path}`, data),
  delete: (path: string) => api.delete(`/notes/${path}`),
  search: (q: string, notebook?: string, tags?: string[], limit = 20) =>
    api.get<Note[]>('/search', { params: { q, notebook, tags: tags?.join(','), limit } }),
  searchFulltext: (q: string, notebook?: string, limit = 20) =>
    api.get<SearchResult[]>('/search/fulltext', { params: { q, notebook, limit } }),
};

export interface UploadResult {
  path: string;
  filename: string;
  size: number;
  mime_type: string;
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  updated_at?: string;
}

export interface PublicTreeItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: PublicTreeItem[];
}

// Public API (no auth required)
const publicAxios = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const publicApi = {
  listNotebooks: () => publicAxios.get<Notebook[]>('/public/notebooks'),
  getSettings: () => publicAxios.get<{ site_name: string; show_powered_by: boolean; public_base_path: string }>('/public/settings'),
  getTree: (notebook: string) => publicAxios.get<PublicTreeItem>(`/public/${notebook}/tree`),
  getNote: (notebook: string, path: string) => publicAxios.get<Note>(`/public/${notebook}/note/${path}`),
  getFolderNotes: (notebook: string, path?: string) => {
    const url = path ? `/public/${notebook}/folder/${path}` : `/public/${notebook}/folder`;
    return publicAxios.get<Note[]>(url);
  },
};

export interface AttachmentInfo {
  name: string;
  path: string;
  size: number;
  mime_type: string;
}

export const attachmentApi = {
  upload: (notePath: string, file: File) => {
    const formData = new FormData();
    formData.append('note_path', notePath);
    formData.append('file', file);
    return api.post<UploadResult>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (notePath: string) =>
    api.get<AttachmentInfo[]>('/note-attachments', { params: { note_path: notePath } }),
  delete: (notePath: string, filename: string) =>
    api.delete('/note-attachments', { data: { note_path: notePath, filename } }),
};

export const tagApi = {
  list: () => api.get<TagInfo[]>('/tags'),
};

export const fileApi = {
  list: (notebook?: string, includeFolders = true) =>
    api.get<FileItem[]>('/files', { params: { notebook, include_folders: includeFolders } }),
  move: (source: string, target: string) =>
    api.post('/files/move', { source, target }),
  copy: (source: string, target: string) =>
    api.post('/files/copy', { source, target }),
};

export const folderApi = {
  create: (path: string) => api.post('/folders', { path }),
  delete: (path: string) => api.delete(`/folders/${path}`),
};

export const settingsApi = {
  uploadFavicon: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/settings/favicon', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
