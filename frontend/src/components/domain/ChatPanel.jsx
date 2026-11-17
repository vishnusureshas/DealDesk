import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  MessageSquare,
  RotateCw,
  Send,
} from 'lucide-react';
import { Button, EmptyState, Spinner } from '../ui';
import { errorMessage } from '../../lib/errors';
import { emitWithAck, subscribeSocketStatus } from '../../realtime/socket';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';

export default function ChatPanel({ dealId, onBack, className = '' }) {
  const user = useAuthStore((state) => state.user);

  const threads = useChatStore((state) => state.threads);
  const threadsLoading = useChatStore((state) => state.threadsLoading);
  const threadsLoaded = useChatStore((state) => state.threadsLoaded);
  const threadsError = useChatStore((state) => state.threadsError);
  const messagesByDeal = useChatStore((state) => state.messages);
  const metaByDeal = useChatStore((state) => state.meta);
  const sendingByDeal = useChatStore((state) => state.sending);
  const fetchThreads = useChatStore((state) => state.fetchThreads);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const discardMessage = useChatStore((state) => state.discardMessage);
  const markRead = useChatStore((state) => state.markRead);

  const [connected, setConnected] = useState(false);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);
  const connectionRef = useRef(null);
  const hasConnectedRef = useRef(false);

  const thread = threads.find(
    (item) => String(item.dealId) === String(dealId),
  );
  const messages = messagesByDeal[dealId] ?? [];
  const meta = metaByDeal[dealId] ?? {};
  const sending = Boolean(sendingByDeal[dealId]);

  useEffect(() => subscribeSocketStatus(setConnected), []);

  useEffect(() => {
    if (!threadsLoaded) fetchThreads();
  }, [threadsLoaded, fetchThreads]);

  useEffect(() => {
    if (thread) loadMessages(thread.dealId, thread.threadId);
  }, [thread?.threadId, thread?.dealId, loadMessages]);

  useEffect(() => {
    const previous = connectionRef.current;
    connectionRef.current = connected;

    if (!connected) return;

    // Events emitted while offline are not replayed: on a reconnect, reload the
    // newest page for the open thread. The first connection is already covered
    // by the initial REST load.
    if (hasConnectedRef.current && previous === false && thread) {
      loadMessages(thread.dealId, thread.threadId, { force: true });
    }

    hasConnectedRef.current = true;
  }, [connected, thread?.dealId, thread?.threadId, loadMessages]);

  useEffect(() => {
    if (!connected || !dealId || !thread) return;

    emitWithAck('thread:join', { dealId });
  }, [connected, dealId, thread?.threadId]);

  const lastMessageId = messages[messages.length - 1]?._id;

  useEffect(() => {
    if (dealId && thread?.threadId) {
      markRead(dealId, thread.threadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, thread?.threadId, lastMessageId]);

  useEffect(() => {
    if (!meta.loadingOlder) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages.length, dealId, meta.loadingOlder]);

  async function handleSend(event) {
    event?.preventDefault();

    if (!thread || !text.trim() || sending) return;

    const value = text;
    setText('');
    setSendError('');

    try {
      await sendMessage(dealId, thread.threadId, value);
    } catch (error) {
      setSendError(errorMessage(error));
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function retryMessage(message) {
    discardMessage(dealId, message._id);

    try {
      await sendMessage(dealId, thread.threadId, message.body);
    } catch (error) {
      setSendError(errorMessage(error));
    }
  }

  if (!thread) {
    return (
      <div className={`grid min-h-0 flex-1 place-items-center ${className}`}>
        {threadsLoading && !threadsLoaded ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <Spinner className="h-3.5 w-3.5 text-brand-500" />
            Loading conversation
          </div>
        ) : threadsError ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-rose-700">
              {errorMessage(threadsError)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={fetchThreads}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Conversation not found"
            description="A thread is created with every deal. Check that the deal is visible to your role."
          />
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="focus-ring rounded p-1 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`/deals/${thread.dealId}`}
            className="focus-ring block truncate text-sm font-medium text-ink-900 hover:text-brand-700"
          >
            {thread.title || `Deal ${thread.dealId.slice(-6)}`}
          </Link>
          <p className="text-[11px] text-slate-400">
            {thread.unreadCount > 0
              ? `${thread.unreadCount} unread`
              : 'Up to date'}
          </p>
        </div>
      </header>

      {!connected && (
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />
          Reconnecting — messages fall back to REST until the socket is back.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/60 px-3 py-3">
        {meta.loading && messages.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <Spinner className="h-3.5 w-3.5 text-brand-500" />
            Loading messages
          </div>
        )}

        {meta.error && (
          <div className="py-6 text-center">
            <p className="text-xs text-rose-700">{errorMessage(meta.error)}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() =>
                loadMessages(thread.dealId, thread.threadId, { force: true })
              }
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {meta.nextCursor && (
          <div className="pb-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              loading={meta.loadingOlder}
              onClick={() => loadOlder(thread.dealId, thread.threadId)}
            >
              Load earlier messages
            </Button>
          </div>
        )}

        {!meta.loading && !meta.error && messages.length === 0 && (
          <p className="py-10 text-center text-xs text-slate-500">
            No messages yet. Say hello.
          </p>
        )}

        <ul className="space-y-2">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped =
              Boolean(previous) &&
              String(previous.senderId) === String(message.senderId);

            return (
              <MessageBubble
                key={message._id}
                message={message}
                mine={String(message.senderId) === user?.id}
                grouped={grouped}
                onRetry={retryMessage}
              />
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-slate-200 px-3 py-2.5">
        {sendError && (
          <p className="mb-1.5 text-[11px] text-rose-600" role="alert">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Write a message…"
            aria-label="Message"
            disabled={sending}
            className="focus-ring max-h-32 min-h-10 flex-1 resize-y rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-300 placeholder:text-slate-400"
          />
          <Button
            type="submit"
            size="sm"
            loading={sending}
            disabled={!text.trim() || text.length > 2000}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
        {text.length > 0 && (
          <p className="mt-1 text-right text-[10px] text-slate-400">
            {text.length}/2000
          </p>
        )}
      </form>
    </div>
  );
}
