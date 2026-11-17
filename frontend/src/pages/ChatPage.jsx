import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, RotateCw } from 'lucide-react';
import {
  Button,
  EmptyState,
  LoadMore,
  PageHeader,
  Spinner,
} from '../components/ui';
import ChatPanel from '../components/domain/ChatPanel';
import { errorMessage } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { useChatStore } from '../stores/chatStore';

export default function ChatPage() {
  const { dealId } = useParams();
  const navigate = useNavigate();

  const threads = useChatStore((state) => state.threads);
  const threadsLoading = useChatStore((state) => state.threadsLoading);
  const threadsLoaded = useChatStore((state) => state.threadsLoaded);
  const threadsLoadingMore = useChatStore(
    (state) => state.threadsLoadingMore,
  );
  const threadsNextCursor = useChatStore(
    (state) => state.threadsNextCursor,
  );
  const threadsError = useChatStore((state) => state.threadsError);
  const fetchThreads = useChatStore((state) => state.fetchThreads);
  const loadMoreThreads = useChatStore(
    (state) => state.loadMoreThreads,
  );
  const ensureThread = useChatStore((state) => state.ensureThread);

  const thread = threads.find((item) => String(item.dealId) === String(dealId));

  useEffect(() => {
    // Refresh the list whenever the chat screen is opened.
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (!dealId || !threadsLoaded || thread || threadsError) return;

    ensureThread(dealId);
  }, [dealId, threadsLoaded, thread, threadsError, ensureThread]);

  useEffect(() => {
    if (!dealId && threadsLoaded && threads.length > 0) {
      navigate(`/chat/${threads[0].dealId}`, { replace: true });
    }
  }, [dealId, threadsLoaded, threads, navigate]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat"
        description="One thread per deal. Messages are live when the socket is connected and fall back to REST when it is not."
      />

      <div className="grid h-[calc(100vh-14rem)] min-h-[26rem] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside
          className={`${
            dealId ? 'hidden md:flex' : 'flex'
          } min-h-0 flex-col border-r border-slate-200`}
        >
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Conversations
            </h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
              {threads.length}
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsLoading && !threadsLoaded && (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
                <Spinner className="h-3.5 w-3.5 text-brand-500" />
                Loading threads
              </div>
            )}

            {threadsError && (
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
            )}

            {!threadsLoading && !threadsError && threads.length === 0 && (
              <p className="px-3 py-8 text-center text-xs leading-relaxed text-slate-500">
                No conversations yet. A thread is created with every deal.
              </p>
            )}

            <ul>
              {threads.map((item) => {
                const active = String(item.dealId) === String(dealId);

                return (
                  <li key={item.threadId}>
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${item.dealId}`)}
                      className={`focus-ring flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left transition-all duration-150 ${
                        active
                          ? 'bg-brand-50/80 shadow-[inset_3px_0_0_0_#3b6cf6]'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink-900">
                          {item.title || `Deal ${item.dealId.slice(-6)}`}
                        </span>
                        {item.unreadCount > 0 && (
                          <span className="grid min-w-4 shrink-0 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-4 text-white">
                            {item.unreadCount > 9 ? '9+' : item.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="truncate">
                          {item.lastMessage?.preview ?? 'No messages yet'}
                        </span>
                        <span className="shrink-0 text-slate-400">
                          {relativeTime(item.lastMessageAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {threads.length > 0 && (
              <div className="border-t border-slate-100 px-2">
                <LoadMore
                  hasMore={Boolean(threadsNextCursor)}
                  loading={threadsLoadingMore}
                  onLoadMore={loadMoreThreads}
                  loadedCount={threads.length}
                />
              </div>
            )}
          </div>
        </aside>

        <section
          className={`${
            dealId ? 'flex' : 'hidden md:flex'
          } min-h-0 flex-col`}
        >
          {thread ? (
            <ChatPanel
              dealId={thread.dealId}
              onBack={() => navigate('/chat')}
            />
          ) : (
            <div className="grid flex-1 place-items-center">
              <EmptyState
                icon={MessageSquare}
                title={
                  threads.length === 0
                    ? 'No conversations yet'
                    : 'Select a conversation'
                }
                description={
                  threads.length === 0
                    ? 'That’s expected on a fresh seed — create a deal and its thread appears here.'
                    : 'Pick a deal on the left to read and send messages.'
                }
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
