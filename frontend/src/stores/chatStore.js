import { create } from 'zustand';
import { chatApi } from '../api/endpoints';
import { useAuthStore } from './authStore';
import {
  emitWithAck,
  setChatMessageHandler,
} from '../realtime/socket';
import { relativeTime } from '../lib/format';
import {
  mergeMessages,
  mergeThreads,
  newClientId,
  normalize,
  previewOf,
  sortByCreatedAt,
} from '../lib/chat';

export const useChatStore = create((set, get) => ({
  threads: [],
  threadsLoading: false,
  threadsLoaded: false,
  threadsLoadingMore: false,
  threadsNextCursor: null,
  threadsError: null,

  messages: {},
  meta: {},
  sending: {},

  async fetchThreads() {
    if (get().threadsLoading) return;

    set({ threadsLoading: true, threadsError: null });

    try {
      const page = await chatApi.threads({ limit: 20 });
      set({
        threads: mergeThreads([], page.items),
        threadsLoading: false,
        threadsLoadingMore: false,
        threadsNextCursor: page.nextCursor ?? null,
        threadsLoaded: true,
      });
    } catch (error) {
      set({
        threadsLoading: false,
        threadsError: error,
      });
    }
  },

  async loadMoreThreads() {
    const { threadsNextCursor, threadsLoadingMore } = get();

    if (!threadsNextCursor || threadsLoadingMore) return false;

    set({ threadsLoadingMore: true, threadsError: null });

    try {
      const page = await chatApi.threads({
        limit: 20,
        cursor: threadsNextCursor,
      });

      set((state) => ({
        threads: mergeThreads(state.threads, page.items),
        threadsLoadingMore: false,
        threadsNextCursor: page.nextCursor ?? null,
      }));

      return true;
    } catch (error) {
      set({
        threadsLoadingMore: false,
        threadsError: error,
      });

      return false;
    }
  },

  async ensureThread(dealId) {
    const target = String(dealId);
    const hasTarget = () =>
      get().threads.some(
        (thread) => String(thread.dealId) === target,
      );

    if (hasTarget()) return;

    while (get().threadsNextCursor) {
      const cursor = get().threadsNextCursor;
      const loaded = await get().loadMoreThreads();

      if (!loaded || hasTarget()) return;
      if (get().threadsNextCursor === cursor) return;
    }
  },

  async loadMessages(dealId, threadId, { force = false } = {}) {
    if (!dealId || !threadId) return;

    const meta = get().meta[dealId];

    if (!force && meta?.loaded) return;

    set((state) => ({
      meta: {
        ...state.meta,
        [dealId]: { ...(meta ?? {}), loading: true, error: null },
      },
    }));

    try {
      const page = await chatApi.messages(threadId, { limit: 20 });
      set((state) => ({
        messages: {
          ...state.messages,
          [dealId]: sortByCreatedAt(page.items.map(normalize)),
        },
        meta: {
          ...state.meta,
          [dealId]: {
            loading: false,
            loaded: true,
            error: null,
            nextCursor: page.nextCursor ?? null,
            loadingOlder: false,
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        meta: {
          ...state.meta,
          [dealId]: {
            ...(state.meta[dealId] ?? {}),
            loading: false,
            loaded: false,
            error,
          },
        },
      }));
    }
  },

  async loadOlder(dealId, threadId) {
    const meta = get().meta[dealId];

    if (!meta?.nextCursor || meta.loadingOlder) return;

    set((state) => ({
      meta: {
        ...state.meta,
        [dealId]: { ...meta, loadingOlder: true },
      },
    }));

    try {
      const page = await chatApi.messages(threadId, {
        limit: 20,
        cursor: meta.nextCursor,
      });

      set((state) => ({
        messages: {
          ...state.messages,
          [dealId]: mergeMessages(
            state.messages[dealId] ?? [],
            page.items.map(normalize),
          ),
        },
        meta: {
          ...state.meta,
          [dealId]: {
            ...meta,
            nextCursor: page.nextCursor ?? null,
            loadingOlder: false,
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        meta: {
          ...state.meta,
          [dealId]: {
            ...meta,
            loadingOlder: false,
            error,
          },
        },
      }));
    }
  },

  async sendMessage(dealId, threadId, body) {    const text = body.trim();
    const userId = useAuthStore.getState().user?.id;

    if (!text || !userId || text.length > 2000) return;

    const clientId = newClientId();
    const optimistic = {
      _id: `temp-${clientId}`,
      threadId,
      senderId: userId,
      body: text,
      clientId,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [dealId]: sortByCreatedAt([
          ...(state.messages[dealId] ?? []),
          optimistic,
        ]),
      },
      sending: { ...state.sending, [dealId]: true },
    }));

    function applyMessage(message) {
      set((state) => ({
        messages: {
          ...state.messages,
          [dealId]: mergeMessages(state.messages[dealId] ?? [], [
            { ...normalize(message), pending: false, failed: false },
          ]),
        },
        threads: state.threads.map((thread) =>
          String(thread.dealId) === String(dealId)
            ? {
                ...thread,
                lastMessage: {
                  preview: previewOf(message.body ?? text),
                  body: previewOf(message.body ?? text),
                  senderId: String(message.senderId ?? userId),
                  createdAt: message.createdAt ?? new Date().toISOString(),
                },
                lastMessageAt: message.createdAt ?? new Date().toISOString(),
              }
            : thread,
        ),
      }));
    }

    try {
      const ack = await emitWithAck('message:send', {
        dealId,
        body: text,
        clientId,
      });

      if (ack?.ok && ack.message) {
        applyMessage(ack.message);
      } else if (ack && ack.ok === false) {
        throw new Error(ack.error?.message || 'Message could not be sent');
      } else {
        const { message } = await chatApi.send(threadId, { body: text, clientId });
        applyMessage(message);
      }
    } catch (error) {
      set((state) => ({
        messages: {
          ...state.messages,
          [dealId]: (state.messages[dealId] ?? []).map((message) =>
            message.clientId === clientId
              ? { ...message, pending: false, failed: true }
              : message,
          ),
        },
      }));
      throw error;
    } finally {
      set((state) => ({
        sending: { ...state.sending, [dealId]: false },
      }));
    }
  },

  discardMessage(dealId, messageId) {
    set((state) => ({
      messages: {
        ...state.messages,
        [dealId]: (state.messages[dealId] ?? []).filter(
          (message) => message._id !== messageId,
        ),
      },
    }));
  },

  ingestMessage(dealId, rawMessage) {
    if (!dealId || !rawMessage) return;

    const message = normalize(rawMessage);
    const userId = useAuthStore.getState().user?.id;
    const mine = String(message.senderId) === userId;

    set((state) => {
      const current = state.messages[dealId];
      const createdAt = message.createdAt ?? new Date().toISOString();

      return {
        messages: current
          ? {
              ...state.messages,
              [dealId]: mergeMessages(current, [
                { ...message, pending: false, failed: false },
              ]),
            }
          : state.messages,
        threads: state.threads
          .map((thread) => {
            if (String(thread.dealId) !== String(dealId)) return thread;

            return {
              ...thread,
              lastMessage: {
                preview: previewOf(message.body),
                body: previewOf(message.body),
                senderId: String(message.senderId),
                createdAt,
              },
              lastMessageAt: createdAt,
              unreadCount: mine ? thread.unreadCount : thread.unreadCount + 1,
            };
          })
          .sort(
            (left, right) =>
              new Date(right.lastMessageAt).getTime() -
              new Date(left.lastMessageAt).getTime(),
          ),
      };
    });
  },

  async markRead(dealId, threadId) {
    if (!dealId || !threadId) return;

    set((state) => ({
      threads: state.threads.map((thread) =>
        String(thread.dealId) === String(dealId)
          ? { ...thread, unreadCount: 0, lastReadAt: new Date().toISOString() }
          : thread,
      ),
    }));

    try {
      const ack = await emitWithAck('thread:read', { dealId });

      if (!ack?.ok) {
        await chatApi.read(threadId);
      }
    } catch {
      /* read state is best-effort; the next open retries */
    }
  },

  reset() {
    set({
      threads: [],
      threadsLoading: false,
      threadsLoaded: false,
      threadsLoadingMore: false,
      threadsNextCursor: null,
      threadsError: null,
      messages: {},
      meta: {},
      sending: {},
    });
  },
}));

setChatMessageHandler(({ dealId, message }) => {
  if (dealId && message) {
    useChatStore.getState().ingestMessage(String(dealId), message);
  }
});

// A different user (or logout) must not see the previous session's threads.
let lastUserId = useAuthStore.getState().user?.id ?? null;
useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null;

  if (nextUserId !== lastUserId) {
    lastUserId = nextUserId;
    useChatStore.getState().reset();
  }
});

export function threadPreviewRelative(lastMessageAt) {
  return relativeTime(lastMessageAt);
}
