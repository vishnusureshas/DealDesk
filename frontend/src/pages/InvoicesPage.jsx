import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ReceiptText, RotateCw } from 'lucide-react';
import { dealsApi, invoicesApi } from '../api/endpoints';
import {
  InvoiceStatusBadge,
  PushStateBadge,
} from '../components/domain/InvoiceBadges';
import {
  Button,
  EmptyState,
  LoadMore,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { errorMessage } from '../lib/errors';
import { formatDateTime, shortId } from '../lib/format';
import { formatCents } from '../lib/money';

const STATUS_OPTIONS = [
  'pending',
  'sent',
  'viewed',
  'paid',
  'failed',
  'cancelled',
];

const PUSH_OPTIONS = ['queued', 'in_flight', 'succeeded', 'failed'];

export default function InvoicesPage() {
  const [status, setStatus] = useState('');
  const [pushState, setPushState] = useState('');
  const [dealTitles, setDealTitles] = useState({});
  const navigate = useNavigate();

  const { items, nextCursor, loading, loadingMore, error, refresh, loadMore } =
    usePaginatedList(
      (cursor) =>
        invoicesApi.list({
          limit: 20,
          cursor,
          status: status || undefined,
          pushState: pushState || undefined,
        }),
      [status, pushState],
    );

  useEffect(() => {
    const missing = [
      ...new Set(items.map((item) => String(item.dealId))),
    ].filter((id) => !(id in dealTitles));

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

      setDealTitles((current) => {
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Invoice status from BillPort and the outbound push state are independent."
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Status
          <Select
            className="mt-1 w-40"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by invoice status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-xs font-medium text-slate-600">
          Push state
          <Select
            className="mt-1 w-40"
            value={pushState}
            onChange={(event) => setPushState(event.target.value)}
            aria-label="Filter by push state"
          >
            <option value="">All push states</option>
            {PUSH_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>

        {(status || pushState) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatus('');
              setPushState('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner className="h-4 w-4 text-brand-500" />
            Loading invoices
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
            icon={ReceiptText}
            title={status || pushState ? 'No invoices in this filter' : 'No invoices yet'}
            description={
              status || pushState
                ? 'Clear the filters or pick another combination.'
                : 'Convert a won deal to create the first invoice.'
            }
          />
        )}

        {items.length > 0 && (
          <>
            <div className="overflow-x-auto">
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Deal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Push</th>
                  <th className="px-4 py-2.5 text-right font-medium">Attempts</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((invoice) => (
                  <tr
                    key={invoice._id}
                    onClick={() => navigate(`/invoices/${invoice._id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/invoices/${invoice._id}`}
                        className="focus-ring font-mono text-xs font-medium text-brand-700 hover:text-brand-600"
                      >
                        {shortId(invoice._id)}
                      </Link>
                      {invoice.externalId && (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">
                          {invoice.externalId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/deals/${invoice.dealId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="focus-ring block font-mono text-xs text-slate-600 hover:text-brand-700"
                      >
                        {dealTitles[String(invoice.dealId)] ??
                          `Deal ${shortId(invoice.dealId)}`}
                      </Link>
                      <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
                        {shortId(invoice.dealId)}
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-right font-medium text-slate-800">
                      {formatCents(invoice.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PushStateBadge pushState={invoice.pushState} />
                    </td>
                    <td className="num px-4 py-3 text-right text-slate-600">
                      {invoice.pushAttempts}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {invoice.lastSyncedAt
                        ? formatDateTime(invoice.lastSyncedAt)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <ul className="divide-y divide-slate-100 sm:hidden">
              {items.map((invoice) => (
                <li key={invoice._id}>
                  <Link to={`/invoices/${invoice._id}`} className="block px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="num text-base font-semibold text-ink-900">
                        {formatCents(invoice.amount)}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <PushStateBadge pushState={invoice.pushState} />
                      <span className="font-mono text-[11px] text-slate-400">
                        {shortId(invoice._id)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
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
    </div>
  );
}
