import { create } from 'zustand';

let nextToastId = 1;

export const useUiStore = create((set) => ({
  toasts: [],
  sidebarOpen: false,

  openSidebar() {
    set({ sidebarOpen: true });
  },

  closeSidebar() {
    set({ sidebarOpen: false });
  },

  toggleSidebar() {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  pushToast(message, kind = 'info') {
    const id = nextToastId++;
    set((state) => ({
      toasts: [...state.toasts, { id, message, kind }],
    }));

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, 5000);

    return id;
  },

  dismissToast(id) {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

export const toast = {
  info: (message) => useUiStore.getState().pushToast(message, 'info'),
  success: (message) => useUiStore.getState().pushToast(message, 'success'),
  error: (message) => useUiStore.getState().pushToast(message, 'error'),
};
