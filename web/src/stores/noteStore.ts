import { create } from 'zustand';
import { noteApi, notebookApi, fileApi, folderApi } from '../services/api';
import type { Note, Notebook, FileItem } from '../services/api';

interface NoteState {
  notebooks: Notebook[];
  notes: Note[];
  fileItems: FileItem[];
  currentNote: Note | null;
  isLoading: boolean;
  isNoteLoading: boolean;
  loadNotebooks: () => Promise<void>;
  loadNotes: (notebook?: string) => Promise<void>;
  loadFiles: (notebook?: string) => Promise<void>;
  loadNote: (path: string) => Promise<void>;
  createNote: (data: { path: string; title?: string; content: string; tags?: string[] }) => Promise<Note>;
  updateNote: (path: string, content: string, append?: boolean) => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  searchNotes: (query: string, notebook?: string, tags?: string[]) => Promise<Note[]>;
  setCurrentNote: (note: Note | null) => void;
  createFolder: (path: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  moveFile: (source: string, target: string) => Promise<void>;
  copyFile: (source: string, target: string) => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notebooks: [],
  notes: [],
  fileItems: [],
  currentNote: null,
  isLoading: false,
  isNoteLoading: false,

  loadNotebooks: async () => {
    const { data } = await notebookApi.list();
    set({ notebooks: data });
  },

  loadNotes: async (notebook?: string) => {
    set({ isLoading: true });
    try {
      const { data } = await noteApi.list(notebook);
      set({ notes: data || [] });
    } finally {
      set({ isLoading: false });
    }
  },

  loadFiles: async (notebook?: string) => {
    set({ isLoading: true });
    try {
      const { data } = await fileApi.list(notebook, true);
      set({ fileItems: data || [] });
    } finally {
      set({ isLoading: false });
    }
  },

  loadNote: async (path: string) => {
    set({ isNoteLoading: true });
    try {
      const { data } = await noteApi.get(path);
      set({ currentNote: data });
    } finally {
      set({ isNoteLoading: false });
    }
  },

  createNote: async (data) => {
    const { data: note } = await noteApi.create(data);
    const notes = get().notes;
    set({ notes: [...notes, note], currentNote: note });
    return note;
  },

  updateNote: async (path: string, content: string, append = false) => {
    const { data: note } = await noteApi.update(path, { content, append });
    const notes = get().notes.map((n) => (n.path === path ? note : n));
    set({ notes, currentNote: note });
  },

  deleteNote: async (path: string) => {
    await noteApi.delete(path);
    const notes = get().notes.filter((n) => n.path !== path);
    set({ notes, currentNote: null });
  },

  searchNotes: async (query: string, notebook?: string, tags?: string[]) => {
    set({ isLoading: true });
    try {
      const { data } = await noteApi.search(query, notebook, tags);
      const results = data || [];
      set({ notes: results });
      return results;
    } finally {
      set({ isLoading: false });
    }
  },

  setCurrentNote: (note: Note | null) => set({ currentNote: note }),

  createFolder: async (path: string) => {
    await folderApi.create(path);
    await get().loadFiles();
  },

  deleteFolder: async (path: string) => {
    await folderApi.delete(path);
    await get().loadFiles();
  },

  moveFile: async (source: string, target: string) => {
    await fileApi.move(source, target);
    await get().loadFiles();
    const currentNote = get().currentNote;
    if (currentNote && currentNote.path === source) {
      await get().loadNote(target);
    }
  },

  copyFile: async (source: string, target: string) => {
    await fileApi.copy(source, target);
    await get().loadFiles();
  },
}));
