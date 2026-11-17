import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckSquare,
  RotateCw,
  X,
  XCircle,
} from 'lucide-react';
import { approvalsApi, dealsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  LoadMore,
  PageHeader,
  Spinner,
  Textarea,
} from '../components/ui';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { errorMessage } from '../lib/errors';
import { formatDateTime, idTimestamp, shortId } from '../lib/format';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/uiStore';

const STATUS_META = {
  pending: { tone: 'amber', label: 'Pending' },
  approved: { tone: 'emerald', label: 'Approved' },
  auto_approved: { tone: 'emerald', label: 'Auto-approved' },
  rejected: { tone: 'rose', label: 'Rejected' },
};

const HISTORY_ACTIONS = {
  requested: 'Requested',
  approve: 'Approved',
  reject: 'Rejected',
  auto_approved: 'Auto-approved',
};

function Chain({ request }) {
  const rejected = request.status === 'rejected';

  return (
    <ol className="space-y-2">
      {[...(request.chain ?? [])]
        .sort((a, b) => a.step - b.step)
        .map((step) => {
          const isCurrent =
            request.status === 'pending' && step.step === request.currentStep;
          const isDone =
            request.status === 'approved' ||
            request.status === 'auto_approved' ||
            step.step < request.currentStep;
          const isSkipped = rejected && step.step > request.currentStep;

          return (
            <li key={step.step} className="flex items-center gap-2.5">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-1 ${
                  isCurrent
                    ? 'bg-amber-50 text-amber-700 ring-amber-300'
                    : isDone
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : isSkipped
                        ? 'bg-slate-50 text-slate-400 ring-slate-200'
                        : 'bg-white text-slate-500 ring-slate-200'
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : step.step}
              </span>
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700">{step.roleKey}</p>
                <p className="text-[11px] text-slate-400">
                  {isCurrent
                    ? 'Waiting for this role'
                    : isDone
                      ? 'Approved'
                      : isSkipped
                        ? 'Skipped after rejection'
                        : 'Not reached yet'}
                </p>
              </div>
            </li>
          );
        })}
    </ol>
  );
}

export default function ApprovalsPage() {
  const user = useAuthStore((state) => state.user);

  const { items, nextCursor, loading, loadingMore, error, refresh, loadMore } =
    usePaginatedList((cursor) => approvalsApi.pending({ limit: 20, cursor }), []);

  const [titles, setTitles] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [decisionError, setDecisionError] = useState('');
  const drawerRef = useRef(null);

  useFocusTrap({
    active: Boolean(selectedId),
    onClose: () => {
      if (!deciding) closeDetail();
    },
    containerRef: drawerRef,
  });

  useEffect(() => {
    const missing = [...new Set(items.map((item) => String(item.dealId)))].filter(
      (id) => !(id in titles),
    );

    if (missing.length === 0) return undefined;

    let cancelled = false;

    Promise.all(
      missing.map((id) =>
        dealsApi
          .get(id)
          .then((deal) => ({ id, title: deal.title }))
          .catch(() => ({ id, title: `Deal ${shortId(id)}` })),
      ),
    ).then((rows) => {
      if (cancelled) return;
      setTitles((current) => {
        const next = { ...current };
        rows.forEach((row) => {
          next[row.id] = row.title;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function openRequest(id) {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setRemarks('');
    setDecisionError('');
    setDetailLoading(true);

    try {
      setDetail(await approvalsApi.get(id));
    } catch (loadError) {
      setDetailError(loadError);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDecisionError('');
  }

  async function decide(action) {
    if (action === 'reject' && !remarks.trim()) {
      setDecisionError('Add a reason before rejecting.');
      return;
    }

    setDeciding(action);
    setDecisionError('');

    try {
      const result = await approvalsApi.decide(selectedId, {
        action,
        remarks: remarks.trim() || undefined,
      });

      if (action === 'reject') {
        toast.success('Request rejected — the deal reopened.');
      } else if (result.deal?.status === 'won') {
        toast.success('Approved — the deal is won.');
      } else {
        toast.success(
          `Approved — moved to ${result.request?.currentRole ?? 'the next step'}.`,
        );
      }

      closeDetail();
      refresh();
    } catch (decideError) {
      if (decideError instanceof ApiError && decideError.status === 409) {
        toast.error('Someone else already decided this step.');
        refresh();
        openRequest(selectedId);
      } else {
        setDecisionError(errorMessage(decideError));
      }
    } finally {
      setDeciding(null);
    }
  }

  const request = detail?.request;
  const history = detail?.history ?? [];
  const isSelfRequest = request
    ? String(request.requestedBy) === user?.id
    : false;
  const statusMeta = request ? STATUS_META[request.status] : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description="Discount requests waiting for your role, with the chain snapshot and full history."
      />

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner className="h-4 w-4 text-brand-500" />
            Loading approvals
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-rose-700">{errorMessage(error)}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
              <RotateCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={CheckSquare}
            title="Nothing waiting for you"
            description="Requests appear here when they reach your role in the chain."
          />
        )}

        {items.length > 0 && (
          <>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const dealId = String(item.dealId);

                return (
                  <li key={item._id}>
                    <button
                      type="button"
                      onClick={() => openRequest(item._id)}
                      className="focus-ring flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-xs font-semibold text-amber-700">
                        {item.pct}%
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {titles[dealId] ?? 'Loading deal…'}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Requested by {shortId(item.requestedBy)} · step{' '}
                          {item.currentStep} of {item.chain.length} ·{' '}
                          {item.currentRole}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {formatDateTime(idTimestamp(item._id))}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-slate-100 px-4">
              <LoadMore
                hasMore={Boolean(nextCursor)}
                loading={loadingMore}
                onLoadMore={loadMore}
                loadedCount={items.length}
              />
            </div>
          </>
        )}
      </section>

      {selectedId && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close approval details"
            onClick={closeDetail}
            className="absolute inset-0 cursor-default bg-slate-900/30"
          />

          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Approval request"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-900">
                Approval request
              </h2>
              <button
                type="button"
                data-autofocus
                onClick={closeDetail}
                className="focus-ring rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="Close"
                disabled={Boolean(deciding)}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailLoading && (
                <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
                  <Spinner className="h-4 w-4 text-brand-500" />
                  Loading request
                </div>
              )}

              {!detailLoading && detailError && (
                <div className="py-8 text-center">
                  <p className="text-sm text-rose-700">
                    {errorMessage(detailError)}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => openRequest(selectedId)}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Try again
                  </Button>
                </div>
              )}

              {request && (
                <div className="space-y-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl font-semibold text-ink-900">
                        {request.pct}%
                      </span>
                      {statusMeta && (
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested by{' '}
                      <span className="font-mono">{shortId(request.requestedBy)}</span>{' '}
                      · {formatDateTime(idTimestamp(request._id))}
                    </p>
                    <Link
                      to={`/deals/${request.dealId}`}
                      onClick={closeDetail}
                      className="focus-ring mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Open the deal
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Chain
                    </h3>
                    <div className="mt-2">
                      <Chain request={request} />
                    </div>
                  </div>

                  {request.rejectionReason && (
                    <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {request.rejectionReason}
                    </p>
                  )}

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      History
                    </h3>
                    <ol className="mt-2 space-y-2">
                      {history.map((entry) => (
                        <li
                          key={entry._id}
                          className="rounded-lg bg-canvas px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-700">
                              {HISTORY_ACTIONS[entry.action] ?? entry.action}
                              {entry.approverRole
                                ? ` · ${entry.approverRole}`
                                : ''}
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {formatDateTime(entry.timestamp)}
                            </span>
                          </div>
                          {entry.remarks && (
                            <p className="mt-1 text-slate-600">{entry.remarks}</p>
                          )}
                        </li>
                      ))}
                      {history.length === 0 && (
                        <li className="text-xs text-slate-500">
                          No history entries yet.
                        </li>
                      )}
                    </ol>
                  </div>

                  {request.status === 'pending' && !isSelfRequest && (
                    <div className="border-t border-slate-200 pt-4">
                      <Field
                        label="Remarks"
                        htmlFor="remarks"
                        hint="Required when rejecting; shared in the request history."
                      >
                        <Textarea
                          id="remarks"
                          value={remarks}
                          onChange={(event) => setRemarks(event.target.value)}
                          disabled={Boolean(deciding)}
                          placeholder="Optional note for the requester…"
                        />
                      </Field>

                      {decisionError && (
                        <p className="mt-2 text-xs text-rose-600" role="alert">
                          {decisionError}
                        </p>
                      )}

                      <div className="mt-3 flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          loading={deciding === 'approve'}
                          disabled={Boolean(deciding)}
                          onClick={() => decide('approve')}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          className="flex-1"
                          variant="danger"
                          size="sm"
                          loading={deciding === 'reject'}
                          disabled={Boolean(deciding)}
                          onClick={() => decide('reject')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {request.status === 'pending' && isSelfRequest && (
                    <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
                      You requested this discount; another approver must decide
                      it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
