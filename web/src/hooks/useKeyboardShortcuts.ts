import { useEffect, useCallback } from 'react';

type KeyHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
  description: string;
}

const shortcuts: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut) {
  const existingIndex = shortcuts.findIndex(
    s => s.key === shortcut.key &&
         s.ctrl === shortcut.ctrl &&
         s.meta === shortcut.meta &&
         s.shift === shortcut.shift &&
         s.alt === shortcut.alt
  );

  if (existingIndex !== -1) {
    shortcuts[existingIndex] = shortcut;
  } else {
    shortcuts.push(shortcut);
  }
}

export function unregisterShortcut(key: string, modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) {
  const index = shortcuts.findIndex(
    s => s.key === key &&
         s.ctrl === modifiers?.ctrl &&
         s.meta === modifiers?.meta &&
         s.shift === modifiers?.shift &&
         s.alt === modifiers?.alt
  );
  if (index !== -1) {
    shortcuts.splice(index, 1);
  }
}

export function getShortcuts(): Shortcut[] {
  return [...shortcuts];
}

export function useKeyboardShortcuts() {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (!(e.metaKey || e.ctrlKey)) {
        return;
      }
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
      const metaMatch = shortcut.meta ? e.metaKey : true;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useShortcut(
  key: string,
  handler: KeyHandler,
  description: string,
  modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }
) {
  useEffect(() => {
    registerShortcut({
      key,
      ...modifiers,
      handler,
      description,
    });

    return () => {
      unregisterShortcut(key, modifiers);
    };
  }, [key, handler, description, modifiers]);
}

export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = [];
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrl) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Win');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  parts.push(shortcut.key.toUpperCase());

  return parts.join(isMac ? '' : '+');
}
