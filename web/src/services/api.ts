import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

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
    if (error.response?.status === 401) {
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
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Notebook {
  id: number;
  name: string;
  display_name: string;
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
}

export const authApi = {
  register: (username: string, password: string, email?: string) =>
    api.post<AuthResponse>('/auth/register', { username, password, email }),
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }),
  me: () => api.get<User>('/auth/me'),
};

export const notebookApi = {
  list: () => api.get<Notebook[]>('/notebooks'),
  create: (data: { name: string; display_name?: string; description?: string }) =>
    api.post<Notebook>('/notebooks', data),
  get: (name: string) => api.get<Notebook>(`/notebooks/${name}`),
  update: (name: string, data: { display_name?: string; description?: string; is_public?: boolean }) =>
    api.put<Notebook>(`/notebooks/${name}`, data),
  delete: (name: string) => api.delete(`/notebooks/${name}`),
};

export const noteApi = {
  list: (notebook?: string, recursive = true) =>
    api.get<Note[]>('/notes', { params: { notebook, recursive } }),
  get: (path: string) => api.get<Note>(`/notes/${path}`),
  create: (data: { path: string; title?: string; content: string; tags?: string[] }) =>
    api.post<Note>('/notes', data),
  update: (path: string, data: { content: string; append?: boolean }) =>
    api.put<Note>(`/notes/${path}`, data),
  delete: (path: string) => api.delete(`/notes/${path}`),
  search: (q: string, notebook?: string, tags?: string[], limit = 20) =>
    api.get<Note[]>('/search', { params: { q, notebook, tags: tags?.join(','), limit } }),
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

export const attachmentApi = {
  upload: (notePath: string, file: File) => {
    const formData = new FormData();
    formData.append('note_path', notePath);
    formData.append('file', file);
    return api.post<UploadResult>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const tagApi = {
  list: () => api.get<TagInfo[]>('/tags'),
};

export default api;
