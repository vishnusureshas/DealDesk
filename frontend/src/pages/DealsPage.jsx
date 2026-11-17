import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Handshake, Plus, RotateCw } from 'lucide-react';
import { dealsApi } from '../api/endpoints';
import DealCreateForm from '../components/domain/DealCreateForm';
import DealStatusBadge from '../components/domain/DealStatusBadge';
import {
  Button,
  EmptyState,
  LoadMore,
  Modal,
  PageHeader,
  Spinner,
  Tabs,
} from '../components/ui';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { errorMessage } from '../lib/errors';
import { formatDate, idTimestamp } from '../lib/format';
import { formatCents } from '../lib/money';
import { useAuthStore } from '../stores/authStore';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'won', label: 'Won' },
];

export default function DealsPage() {
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canCreate = useAuthStore((state) => state.hasPermission('deal.edit'));
  const creating = pathname === '/deals/new';

  function closeCreate() {
    navigate('/deals', { replace: true });
  }

  const { items, nextCursor, loading, loadingMore, error, refresh, loadMore } =
    usePaginatedList(
      (cursor) =>
        dealsApi.list({ limit: 20, cursor, status: status || undefined }),
      [status],
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deals"
        description={`${items.length} loaded · Every deal you can see under your role's scope.`}
        actions={
          canCreate && (
            <Link to="/deals/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New deal
              </Button>
            </Link>
          )
        }
      />

      <Tabs items={STATUS_TABS} value={status} onChange={setStatus} label="Deal status" />

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner className="h-4 w-4 text-brand-500" />
            Loading deals
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
            icon={Handshake}
            title={status ? 'No deals in this view' : 'No deals yet'}
            description={
              status
                ? 'Try another status filter or clear it to see everything.'
                : canCreate
                  ? 'Create the first deal to start the discount and invoice flow.'
                  : 'Deals created by your team will appear here.'
            }
            action={
              canCreate && (
                <Link to="/deals/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    New deal
                  </Button>
                </Link>
              )
            }
          />
        )}

        {items.length > 0 && (
          <>
            <div className="overflow-x-auto">
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Discount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((deal) => (
                  <tr
                    key={deal._id}
                    onClick={() => navigate(`/deals/${deal._id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="max-w-[22rem] px-4 py-3">
                      <Link
                        to={`/deals/${deal._id}`}
                        className="focus-ring block truncate font-medium text-ink-900 hover:text-brand-700"
                      >
                        {deal.title}
                      </Link>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">
                        {deal._id}
                      </span>
                      {deal.status === 'open' && deal.rejectionReason && (
                        <span className="mt-0.5 block truncate text-[11px] text-rose-600">
                          Rejected: {deal.rejectionReason}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DealStatusBadge status={deal.status} />
                    </td>
                    <td className="num px-4 py-3 text-right text-slate-700">
                      {deal.discountPct > 0 ? `${deal.discountPct}%` : '—'}
                    </td>
                    <td className="num px-4 py-3 text-right text-slate-700">
                      {deal.status === 'won' ? formatCents(deal.total) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {formatDate(idTimestamp(deal._id))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <ul className="divide-y divide-slate-100 sm:hidden">
              {items.map((deal) => (
                <li key={deal._id}>
                  <Link to={`/deals/${deal._id}`} className="block px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink-900">{deal.title}</span>
                      <DealStatusBadge status={deal.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {deal.discountPct > 0 ? `${deal.discountPct}% discount` : 'No discount'}
                      </span>
                      <span className="num font-medium text-slate-700">
                        {deal.status === 'won' ? formatCents(deal.total) : '—'}
                      </span>
                    </div>
                    {deal.status === 'open' && deal.rejectionReason && (
                      <p className="mt-1 truncate text-[11px] text-rose-600">
                        Rejected: {deal.rejectionReason}
                      </p>
                    )}
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

      <Modal
        open={creating}
        onClose={closeCreate}
        title="New deal"
        description="The server snapshots product prices. A discount is requested after the deal is created."
        className="max-w-3xl"
      >
        {creating && (
          <DealCreateForm
            onCancel={closeCreate}
            onCreated={(deal) =>
              navigate(`/deals/${deal._id}`, { replace: true })
            }
          />
        )}
      </Modal>
    </div>
  );
}
