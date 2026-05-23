import { create } from 'zustand';
import { noteApi, notebookApi } from '../services/api';
import type { Note, Notebook } from '../services/api';

interface NoteState {
  notebooks: Notebook[];
  notes: Note[];
  currentNote: Note | null;
  isLoading: boolean;
  loadNotebooks: () => Promise<void>;
  loadNotes: (notebook?: string) => Promise<void>;
  loadNote: (path: string) => Promise<void>;
  createNote: (data: { path: string; title?: string; content: string; tags?: string[] }) => Promise<Note>;
  updateNote: (path: string, content: string, append?: boolean) => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  searchNotes: (query: string, notebook?: string, tags?: string[]) => Promise<Note[]>;
  setCurrentNote: (note: Note | null) => void;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notebooks: [],
  notes: [],
  currentNote: null,
  isLoading: false,

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

  loadNote: async (path: string) => {
    set({ isLoading: true });
    try {
      const { data } = await noteApi.get(path);
      set({ currentNote: data });
    } finally {
      set({ isLoading: false });
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
}));
