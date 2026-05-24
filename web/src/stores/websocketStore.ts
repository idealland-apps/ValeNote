import { create } from 'zustand';

type WSMessageType =
  | 'note.updated'
  | 'note.deleted'
  | 'editor.joined'
  | 'editor.left'
  | 'conflict'
  | 'ping'
  | 'pong'
  | 'editor.focus'
  | 'editor.blur';

interface WSMessage {
  type: WSMessageType;
  payload?: Record<string, unknown>;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error';
  message: string;
  notePath?: string;
  timestamp: Date;
}

interface ConflictInfo {
  path: string;
  serverChecksum: string;
  serverUpdatedBy: string;
  serverUpdatedAt: string;
}

interface WebSocketState {
  socket: WebSocket | null;
  isConnected: boolean;
  editors: Record<string, string[]>; // notePath -> usernames
  notifications: Notification[];
  conflict: ConflictInfo | null;
  connect: (token: string) => void;
  disconnect: () => void;
  focusNote: (path: string) => void;
  blurNote: () => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearConflict: () => void;
}

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  editors: {},
  notifications: [],
  conflict: null,

  connect: (token: string) => {
    const existingSocket = get().socket;
    if (existingSocket) {
      existingSocket.close();
    }

    const wsUrl = getWsUrl();
    const socket = new WebSocket(`${wsUrl}?token=${token}`);

    socket.onopen = () => {
      set({ isConnected: true });
      console.log('WebSocket connected');
    };

    socket.onclose = () => {
      set({ isConnected: false, socket: null });
      console.log('WebSocket disconnected');

      setTimeout(() => {
        const currentToken = localStorage.getItem('token');
        if (currentToken) {
          get().connect(currentToken);
        }
      }, 3000);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onmessage = (event) => {
      try {
        const messages = event.data.split('\n').filter(Boolean);
        messages.forEach((msgStr: string) => {
          const msg: WSMessage = JSON.parse(msgStr);
          handleMessage(msg, set, get);
        });
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.close();
      set({ socket: null, isConnected: false });
    }
  },

  focusNote: (path: string) => {
    const socket = get().socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'editor.focus',
        payload: { path }
      }));
    }
  },

  blurNote: () => {
    const socket = get().socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'editor.blur'
      }));
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 10)
    }));

    setTimeout(() => {
      get().removeNotification(notification.id);
    }, 5000);
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }));
  },

  clearConflict: () => {
    set({ conflict: null });
  },
}));

function handleMessage(
  msg: WSMessage,
  set: (fn: (state: WebSocketState) => Partial<WebSocketState>) => void,
  get: () => WebSocketState
) {
  const payload = msg.payload || {};

  switch (msg.type) {
    case 'note.updated': {
      const notification: Notification = {
        id: crypto.randomUUID(),
        type: 'info',
        message: `Note updated by ${payload.updated_by}`,
        notePath: payload.path as string,
        timestamp: new Date(),
      };
      get().addNotification(notification);
      break;
    }

    case 'note.deleted': {
      const notification: Notification = {
        id: crypto.randomUUID(),
        type: 'warning',
        message: `Note deleted by ${payload.deleted_by}`,
        notePath: payload.path as string,
        timestamp: new Date(),
      };
      get().addNotification(notification);
      break;
    }

    case 'editor.joined': {
      const path = payload.path as string;
      const username = payload.username as string;
      set((state) => ({
        editors: {
          ...state.editors,
          [path]: [...(state.editors[path] || []).filter(u => u !== username), username]
        }
      }));
      break;
    }

    case 'editor.left': {
      const path = payload.path as string;
      const username = payload.username as string;
      set((state) => ({
        editors: {
          ...state.editors,
          [path]: (state.editors[path] || []).filter(u => u !== username)
        }
      }));
      break;
    }

    case 'conflict': {
      const conflictInfo: ConflictInfo = {
        path: payload.path as string,
        serverChecksum: payload.checksum as string || '',
        serverUpdatedBy: payload.updated_by as string || 'another user',
        serverUpdatedAt: payload.updated_at as string || new Date().toISOString(),
      };
      set(() => ({ conflict: conflictInfo }));

      const notification: Notification = {
        id: crypto.randomUUID(),
        type: 'error',
        message: 'Conflict detected! Please resolve the conflict.',
        notePath: payload.path as string,
        timestamp: new Date(),
      };
      get().addNotification(notification);
      break;
    }

    case 'pong':
      break;

    default:
      console.log('Unknown message type:', msg.type);
  }
}
