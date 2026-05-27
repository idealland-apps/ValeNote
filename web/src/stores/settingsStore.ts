import { create } from 'zustand';
import { settingsApi } from '../services/api';

type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColorOption {
  name: string;
  color: string;
}

export const THEME_COLOR_OPTIONS: ThemeColorOption[] = [
  { name: 'Default Blue', color: '#1976d2' },
  { name: 'Teal', color: '#009688' },
  { name: 'Indigo', color: '#3f51b5' },
  { name: 'Purple', color: '#9c27b0' },
  { name: 'Deep Orange', color: '#ff5722' },
  { name: 'Green', color: '#4caf50' },
  { name: 'Cyan', color: '#00bcd4' },
  { name: 'Amber', color: '#ffc107' },
];

interface SettingsState {
  themeMode: ThemeMode;
  primaryColor: string;
  editorFontSize: number;
  sidebarWidth: number;
  smartPasteLink: boolean;
  loaded: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setPrimaryColor: (color: string) => void;
  setEditorFontSize: (size: number) => void;
  setSidebarWidth: (width: number) => void;
  setSmartPasteLink: (enabled: boolean) => void;
  getEffectiveTheme: () => 'light' | 'dark';
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  themeMode: 'system',
  primaryColor: '#1976d2',
  editorFontSize: 14,
  sidebarWidth: 280,
  smartPasteLink: true,
  loaded: false,

  setThemeMode: (mode: ThemeMode) => {
    set({ themeMode: mode });
    get().saveSettings();
  },
  setPrimaryColor: (color: string) => {
    set({ primaryColor: color });
    get().saveSettings();
  },
  setEditorFontSize: (size: number) => {
    set({ editorFontSize: size });
    get().saveSettings();
  },
  setSidebarWidth: (width: number) => {
    set({ sidebarWidth: width });
    get().saveSettings();
  },
  setSmartPasteLink: (enabled: boolean) => {
    set({ smartPasteLink: enabled });
    get().saveSettings();
  },

  getEffectiveTheme: () => {
    const mode = get().themeMode;
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  },

  loadSettings: async () => {
    try {
      const res = await settingsApi.getUserSettings();
      set({
        themeMode: (res.data.theme_mode as ThemeMode) || 'system',
        primaryColor: res.data.primary_color || '#1976d2',
        editorFontSize: res.data.editor_font_size || 14,
        sidebarWidth: res.data.sidebar_width || 280,
        smartPasteLink: res.data.smart_paste_link ?? true,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  saveSettings: async () => {
    const state = get();
    try {
      await settingsApi.updateUserSettings({
        theme_mode: state.themeMode,
        primary_color: state.primaryColor,
        editor_font_size: state.editorFontSize,
        sidebar_width: state.sidebarWidth,
        smart_paste_link: state.smartPasteLink,
      });
    } catch {
      // ignore save errors
    }
  },
}));
