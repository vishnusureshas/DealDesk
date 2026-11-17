import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ChevronDown,
  Copy,
  ReceiptText,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import { invoicesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import {
  InvoiceStatusBadge,
  PushStateBadge,
} from '../components/domain/InvoiceBadges';
import {
  Badge,
  Button,
  EmptyState,
  LoadMore,
  Spinner,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { errorMessage } from '../lib/errors';
import { formatDateTime, shortId } from '../lib/format';
import { formatCents } from '../lib/money';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { toast } from '../stores/uiStore';

const OUTCOME_TONES = {
  push_succeeded: 'emerald',
  applied: 'emerald',
  reconciled: 'emerald',
  balance_repaired: 'emerald',
  push_attempt: 'amber',
  retry_scheduled: 'amber',
  push_failed_terminal: 'rose',
  bad_signature: 'rose',
  bad_payload: 'rose',
  duplicate_ignored: 'slate',
  stale_ignored: 'slate',
  orphan_parked: 'slate',
};

const OUTCOME_LABELS = {
  push_attempt: 'Push attempt',
  retry_scheduled: 'Retry scheduled',
  push_succeeded: 'Push succeeded',
  push_failed_terminal: 'Push failed (terminal)',
  bad_signature: 'Bad signature',
  bad_payload: 'Bad payload',
  duplicate_ignored: 'Duplicate ignored',
  stale_ignored: 'Stale ignored',
  orphan_parked: 'Orphan parked',
  applied: 'Applied',
  reconciled: 'Reconciled',
  balance_repaired: 'Balance repaired',
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const invoiceAsync = useAsync(() => invoicesApi.get(id), [id]);
  const logList = usePaginatedList(
    (cursor) => invoicesApi.log(id, { limit: 20, cursor }),
    [id],
  );

  const notifications = useNotificationStore((state) => state.items);
  const handledNotification = useRef('');

  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState('');
  const [expandedLog, setExpandedLog] = useState(null);
  const cancelDialogRef = useRef(null);

  useFocusTrap({
    active: confirmCancel,
    onClose: () => {
      if (!cancelling) setConfirmCancel(false);
    },
    containerRef: cancelDialogRef,
  });

  useDocumentTitle(
    invoiceAsync.data
      ? `Invoice ${shortId(invoiceAsync.data._id)}`
      : 'Invoice detail',
  );

  useEffect(() => {
    const match = notifications.find(
      (notification) =>
        notification.type === 'invoice:status_changed' &&
        String(notification.payload?.invoiceId) === id,
    );

    if (match && match._id !== handledNotification.current) {
      handledNotification.current = match._id;
      invoiceAsync.refresh();
      logList.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, id]);

  if (invoiceAsync.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Spinner className="h-4 w-4 text-brand-500" />
        Loading invoice
      </div>
    );
  }

  if (invoiceAsync.error) {
    const notFound =
      invoiceAsync.error instanceof ApiError &&
      invoiceAsync.error.status === 404;

    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />
        <h1 className="mt-3 text-base font-semibold text-ink-900">
          {notFound ? 'Invoice not found' : 'Could not load invoice'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {notFound
            ? 'It may be outside your branch or ownership scope.'
            : errorMessage(invoiceAsync.error)}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!notFound && (
            <Button
              variant="secondary"
              size="sm"
              onClick={invoiceAsync.refresh}
            >
              Try again
            </Button>
          )}
          <Link to="/invoices">
            <Button variant="ghost" size="sm">
              Back to invoices
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const invoice = invoiceAsync.data;
  const canRetry =
    hasPermission('invoice.issue') &&
    invoice.pushState === 'failed' &&
    invoice.status !== 'cancelled';
  const canCancel =
    hasPermission('invoice.cancel') &&
    invoice.status !== 'paid' &&
    invoice.status !== 'cancelled';

  function reportActionError(error) {
    setActionError(errorMessage(error));

    if (error instanceof ApiError && error.status === 409) {
      // The invoice changed underneath (paid, cancelled, or re-queued).
      invoiceAsync.refresh();
      logList.refresh();
    }
  }

  async function copyExternalId() {
    try {
      await navigator.clipboard.writeText(invoice.externalId);
      toast.success('External id copied.');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }

  async function retry() {
    setActionError('');
    setRetrying(true);

    try {
      await invoicesApi.retry(id);
      toast.success('Invoice re-queued for push.');
      invoiceAsync.refresh();
      logList.refresh();
    } catch (error) {
      reportActionError(error);
    } finally {
      setRetrying(false);
    }
  }

  async function cancel() {
    setActionError('');
    setCancelling(true);

    try {
      await invoicesApi.cancel(id);
      toast.success('Invoice cancelled.');
      setConfirmCancel(false);
      invoiceAsync.refresh();
      logList.refresh();
    } catch (error) {
      reportActionError(error);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        to="/invoices"
        className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to invoices
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="num text-2xl font-semibold text-ink-900">
            {formatCents(invoice.amount)}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <PushStateBadge pushState={invoice.pushState} />
            {invoice.externalId && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                {invoice.externalId}
                <button
                  type="button"
                  onClick={copyExternalId}
                  aria-label="Copy external id"
                  className="focus-ring rounded p-0.5 text-slate-400 hover:text-brand-700"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </span>
            )}
            <span className="font-mono text-[11px] text-slate-400">
              {invoice._id}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={retry}
            disabled={!canRetry}
            loading={retrying}
            title={
              canRetry
                ? 'Re-queue this invoice'
                : 'Retry is only available when the push failed and the invoice is not cancelled'
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry push
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmCancel(true)}
            disabled={!canCancel}
            title={
              canCancel
                ? 'Cancel this invoice'
                : 'Paid or already cancelled invoices cannot be cancelled'
            }
          >
            <Ban className="h-3.5 w-3.5" />
            Cancel invoice
          </Button>
        </div>
      </header>

      {actionError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {actionError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
              <ReceiptText className="h-4 w-4 text-brand-600" />
              Integration log
            </h2>
            <span className="text-[11px] text-slate-400">
              {logList.items.length} loaded
            </span>
          </header>

          {logList.loading && logList.items.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Spinner className="h-4 w-4 text-brand-500" />
              Loading log
            </div>
          )}

          {!logList.loading && logList.error && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-rose-700">
                {errorMessage(logList.error)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={logList.refresh}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          )}

          {!logList.loading && !logList.error && logList.items.length === 0 && (
            <EmptyState
              icon={ReceiptText}
              title="No log entries yet"
              description="The push worker writes here on every attempt; inbound webhooks appear as events arrive."
            />
          )}

          {logList.items.length > 0 && (
            <>
              <ol className="divide-y divide-slate-100">
                {logList.items.map((entry) => {
                  const expanded = expandedLog === entry._id;
                  const hasPayload = Boolean(entry.request || entry.response);

                  return (
                    <li key={entry._id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={OUTCOME_TONES[entry.outcome] ?? 'slate'}>
                          {OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
                        </Badge>
                        <span className="text-[11px] uppercase tracking-wide text-slate-400">
                          {entry.direction}
                        </span>
                        {entry.httpStatus !== null && (
                          <span className="num text-[11px] text-slate-500">
                            HTTP {entry.httpStatus}
                          </span>
                        )}
                        {entry.attempt !== null && (
                          <span className="num text-[11px] text-slate-500">
                            attempt {entry.attempt}
                          </span>
                        )}
                        {entry.durationMs !== null && (
                          <span className="num text-[11px] text-slate-500">
                            {entry.durationMs} ms
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-slate-400">
                          {formatDateTime(entry.at)}
                        </span>
                      </div>

                      {hasPayload && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLog(expanded ? null : entry._id)
                            }
                            aria-expanded={expanded}
                            className="focus-ring mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-700"
                          >
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${
                                expanded ? 'rotate-180' : ''
                              }`}
                            />
                            {expanded ? 'Hide payload' : 'Show payload'}
                          </button>

                          {expanded && (
                            <div className="mt-2 space-y-2">
                              {entry.request && (
                                <div>
                                  <p className="text-[11px] font-medium text-slate-500">
                                    Request
                                  </p>
                                  <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-slate-100">
                                    {JSON.stringify(entry.request, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.response && (
                                <div>
                                  <p className="text-[11px] font-medium text-slate-500">
                                    Response
                                  </p>
                                  <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-slate-100">
                                    {JSON.stringify(entry.response, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="border-t border-slate-100 px-4">
                <LoadMore
                  hasMore={Boolean(logList.nextCursor)}
                  loading={logList.loadingMore}
                  onLoadMore={logList.loadMore}
                  loadedCount={logList.items.length}
                />
              </div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-ink-900">Details</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">External id</dt>
                <dd className="flex min-w-0 items-center gap-1 font-mono text-slate-700">
                  <span className="truncate">{invoice.externalId ?? '—'}</span>
                  {invoice.externalId && (
                    <button
                      type="button"
                      onClick={copyExternalId}
                      aria-label="Copy external id"
                      className="focus-ring rounded p-0.5 text-slate-400 hover:text-brand-700"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Deal</dt>
                <dd>
                  <Link
                    to={`/deals/${invoice.dealId}`}
                    className="focus-ring font-mono text-brand-700 hover:text-brand-600"
                  >
                    {shortId(invoice.dealId)}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Customer</dt>
                <dd className="font-mono text-slate-700">
                  {shortId(invoice.customerId)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Owner</dt>
                <dd className="font-mono text-slate-700">
                  {shortId(invoice.ownerId)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Branch</dt>
                <dd className="font-mono text-slate-700">
                  {shortId(invoice.branchId)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Attempts</dt>
                <dd className="num text-slate-700">{invoice.pushAttempts}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Last synced</dt>
                <dd className="text-slate-700">
                  {invoice.lastSyncedAt
                    ? formatDateTime(invoice.lastSyncedAt)
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Next attempt</dt>
                <dd className="text-slate-700">
                  {invoice.nextAttemptAt
                    ? formatDateTime(invoice.nextAttemptAt)
                    : '—'}
                </dd>
              </div>
            </dl>

            {invoice.lastError && (
              <p className="mt-3 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] leading-relaxed text-rose-700 ring-1 ring-rose-200">
                {invoice.lastError}
              </p>
            )}
          </section>
        </aside>
      </div>

      {confirmCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center px-4">
          <button
            type="button"
            aria-label="Close cancel dialog"
            onClick={() => !cancelling && setConfirmCancel(false)}
            className="absolute inset-0 cursor-default bg-slate-900/30"
          />
          <div
            ref={cancelDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            tabIndex={-1}
            className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="cancel-title" className="text-sm font-semibold text-ink-900">
              Cancel this invoice?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              This stops further syncing and cannot be undone. Paid invoices
              cannot be cancelled.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-autofocus
                onClick={() => setConfirmCancel(false)}
                disabled={cancelling}
              >
                Keep invoice
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={cancelling}
                onClick={cancel}
              >
                Cancel invoice
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
