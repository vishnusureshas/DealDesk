import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

let socket = null;
let chatMessageHandler = null;
const statusListeners = new Set();

function notifyStatus(connected) {
  statusListeners.forEach((listener) => listener(connected));
}

export function subscribeSocketStatus(listener) {
  statusListeners.add(listener);
  listener(socket?.connected ?? false);
  return () => statusListeners.delete(listener);
}

export function setChatMessageHandler(handler) {
  chatMessageHandler = handler;
}

export function emitWithAck(event, payload, timeoutMs = 5000) {
  const active = socket;

  if (!active?.connected) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    active.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(response ?? null);
    });
  });
}

export function connectSocket() {
  const { token, logout } = useAuthStore.getState();

  if (!token) return null;

  if (socket) {
    socket.auth = { token };

    if (!socket.connected) socket.connect();

    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    notifyStatus(true);
    // Events emitted while offline are not replayed; refresh the persisted list.
    void useNotificationStore.getState().fetchFirstPage();
  });

  socket.on('disconnect', () => {
    notifyStatus(false);
  });

  socket.on('notification', (envelope) => {
    const notification = envelope?.data?.notification;

    if (notification) {
      useNotificationStore.getState().ingest(notification);
    }
  });

  socket.on('chat:message', (envelope) => {
    if (envelope?.data) chatMessageHandler?.(envelope.data);
  });

  socket.on('connect_error', (error) => {
    if (error?.message === 'UNAUTHENTICATED') {
      logout();
      window.dispatchEvent(new CustomEvent('dealdesk:unauthorized'));
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (!socket) return;

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  notifyStatus(false);
}

export function getSocket() {
  return socket;
}

// Logout clears the token; tear the connection down without importing this
// module from the store (which would create a cycle).
useAuthStore.subscribe((state, previous) => {
  if (!state.token && previous.token) disconnectSocket();
});
