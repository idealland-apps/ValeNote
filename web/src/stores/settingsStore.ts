import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  themeMode: ThemeMode;
  editorFontSize: number;
  sidebarWidth: number;
  setThemeMode: (mode: ThemeMode) => void;
  setEditorFontSize: (size: number) => void;
  setSidebarWidth: (width: number) => void;
  getEffectiveTheme: () => 'light' | 'dark';
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      editorFontSize: 14,
      sidebarWidth: 280,

      setThemeMode: (mode: ThemeMode) => set({ themeMode: mode }),
      setEditorFontSize: (size: number) => set({ editorFontSize: size }),
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),

      getEffectiveTheme: () => {
        const mode = get().themeMode;
        if (mode === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return mode;
      },
    }),
    {
      name: 'valenote-settings',
    }
  )
);
