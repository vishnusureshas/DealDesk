import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Receipt,
  X,
} from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { relativeTime } from '../../lib/format';

function describe(notification) {
  const payload = notification.payload ?? {};

  if (notification.type === 'approval:requested') {
    return payload.pct !== undefined && payload.pct !== null
      ? `Discount of ${payload.pct}% needs your approval`
      : 'A discount request needs your approval';
  }

  if (notification.type === 'approval:decided') {
    return payload.action === 'reject'
      ? 'Your discount request was rejected'
      : 'Your discount request was approved';
  }

  if (notification.type === 'invoice:status_changed') {
    return `Invoice moved from ${payload.from ?? 'pending'} to ${payload.to ?? 'updated'}`;
  }

  return 'New notification';
}

function targetFor(notification) {
  const payload = notification.payload ?? {};

  if (notification.type === 'approval:requested') return '/approvals';
  if (notification.type === 'approval:decided' && payload.dealId) {
    return `/deals/${payload.dealId}`;
  }
  if (notification.type === 'invoice:status_changed' && payload.invoiceId) {
    return `/invoices/${payload.invoiceId}`;
  }
  return null;
}

function IconFor({ type }) {
  if (type === 'invoice:status_changed') {
    return <Receipt className="h-4 w-4 text-brand-600" />;
  }
  if (type === 'approval:decided') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  return <ClipboardCheck className="h-4 w-4 text-amber-600" />;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const items = useNotificationStore((state) => state.items);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const loading = useNotificationStore((state) => state.loading);
  const loaded = useNotificationStore((state) => state.loaded);
  const nextCursor = useNotificationStore((state) => state.nextCursor);
  const loadingMore = useNotificationStore((state) => state.loadingMore);
  const fetchFirstPage = useNotificationStore((state) => state.fetchFirstPage);
  const fetchMore = useNotificationStore((state) => state.fetchMore);
  const markRead = useNotificationStore((state) => state.markRead);

  useEffect(() => {
    // Load on login so the unread badge is accurate before the panel is opened
    // (the socket connect handler also refreshes after a reconnect).
    if (!useNotificationStore.getState().loaded) fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && !loaded) fetchFirstPage();
  }, [open, loaded, fetchFirstPage]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleItem(notification) {
    markRead(notification._id);
    const target = targetFor(notification);

    if (target) {
      setOpen(false);
      navigate(target);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        className="focus-ring relative grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-slate-900/10"
          />
          <section className="fixed inset-x-3 top-14 z-50 max-h-[70vh] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
            <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notifications
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[calc(70vh-6rem)] overflow-y-auto">
              {loading && items.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-500">
                  Loading notifications…
                </p>
              )}

              {!loading && items.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-slate-500">
                  You’re all caught up.
                </p>
              )}

              <ul className="divide-y divide-slate-100">
                {items.map((notification) => (
                  <li key={notification._id}>
                    <button
                      type="button"
                      onClick={() => handleItem(notification)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                        notification.readAt ? 'opacity-70' : ''
                      }`}
                    >
                      <span className="mt-0.5">
                        <IconFor type={notification.type} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-xs leading-snug text-slate-700">
                          {describe(notification)}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {relativeTime(notification.createdAt)}
                        </span>
                      </span>
                      {!notification.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {nextCursor && (
                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    onClick={() => fetchMore()}
                    disabled={loadingMore}
                    className="focus-ring w-full rounded-md py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:text-slate-400"
                  >
                    {loadingMore ? 'Loading…' : 'Load older notifications'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
