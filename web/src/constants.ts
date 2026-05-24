declare global {
  interface Window {
    __VALENOTE_CONFIG__?: {
      publicBasePath: string;
    };
  }
}

export const PUBLIC_BASE_PATH = window.__VALENOTE_CONFIG__?.publicBasePath || '/public';

export const RESERVED_FOLDER_NAMES = ['attachments'] as const;

export function isReservedFolderName(name: string): boolean {
  return RESERVED_FOLDER_NAMES.includes(name as typeof RESERVED_FOLDER_NAMES[number]);
}

export function containsReservedFolder(path: string): boolean {
  const parts = path.split('/');
  return parts.some(part => isReservedFolderName(part));
}
