import { create } from 'zustand';
import { notificationsApi } from '../api/endpoints';

function countUnread(items) {
  return items.filter((item) => !item.readAt).length;
}

export const useNotificationStore = create((set, get) => ({
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  loaded: false,
  error: null,

  async fetchFirstPage() {
    if (get().loading) return;

    set({ loading: true, error: null });

    try {
      const { items, nextCursor } = await notificationsApi.list({ limit: 20 });
      set({
        items,
        nextCursor: nextCursor ?? null,
        unreadCount: countUnread(items),
        loading: false,
        loaded: true,
      });
    } catch (error) {
      set({ loading: false, error: error?.message || 'Failed to load notifications' });
    }
  },

  async fetchMore() {
    const { nextCursor, loadingMore, items } = get();

    if (!nextCursor || loadingMore) return;

    set({ loadingMore: true });

    try {
      const page = await notificationsApi.list({ limit: 20, cursor: nextCursor });
      const merged = [...items, ...page.items];
      set({
        items: merged,
        nextCursor: page.nextCursor ?? null,
        unreadCount: countUnread(merged),
        loadingMore: false,
      });
    } catch (error) {
      set({ loadingMore: false, error: error?.message || 'Failed to load notifications' });
    }
  },

  ingest(notification) {
    if (!notification?._id) return;

    set((state) => {
      if (state.items.some((item) => item._id === notification._id)) {
        return state;
      }

      const items = [notification, ...state.items];

      return {
        items,
        unreadCount: countUnread(items),
        loaded: true,
      };
    });
  },

  async markRead(id) {
    const target = get().items.find((item) => item._id === id);

    if (!target || target.readAt) return;

    set((state) => ({
      items: state.items.map((item) =>
        item._id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));

    try {
      const updated = await notificationsApi.markRead(id);

      set((state) => {
        const items = state.items.map((item) =>
          item._id === id ? updated : item,
        );
        return { items, unreadCount: countUnread(items) };
      });
    } catch {
      set((state) => {
        const items = state.items.map((item) =>
          item._id === id ? { ...item, readAt: null } : item,
        );
        return { items, unreadCount: countUnread(items) };
      });
    }
  },

  reset() {
    set({
      items: [],
      unreadCount: 0,
      nextCursor: null,
      loading: false,
      loadingMore: false,
      loaded: false,
      error: null,
    });
  },
}));
