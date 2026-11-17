import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { adminApi, catalogApi, dealsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import ChatPanel from '../components/domain/ChatPanel';
import DealStatusBadge from '../components/domain/DealStatusBadge';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { findBandForPct } from '../lib/approvalBands';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime, idTimestamp, shortId } from '../lib/format';
import { formatCents } from '../lib/money';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/uiStore';

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const REQUEST_LABELS = {
  pending: { tone: 'amber', label: 'Awaiting approval' },
  approved: { tone: 'emerald', label: 'Approved' },
  auto_approved: { tone: 'emerald', label: 'Auto-approved' },
  rejected: { tone: 'rose', label: 'Rejected' },
};

function ApprovalChain({ request }) {
  const steps = [...(request.chain ?? [])].sort((a, b) => a.step - b.step);
  const rejected = request.status === 'rejected';

  if (steps.length === 0) return null;

  return (
    <ol className="space-y-2">
      {steps.map((step) => {
        const isCurrent = request.status === 'pending' && step.step === request.currentStep;
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
                  ? 'Current step'
                  : isDone
                    ? 'Approved'
                    : isSkipped
                      ? 'Skipped'
                      : 'Waiting'}
              </p>
            </div>
            {isCurrent && <Badge tone="amber">Waiting</Badge>}
          </li>
        );
      })}
    </ol>
  );
}

export default function DealDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const dealAsync = useAsync(() => dealsApi.get(id), [id]);
  const requestsAsync = useAsync(() => dealsApi.discountRequests(id), [id]);
  const customersAsync = useAsync(() => catalogApi.customers({ limit: 100 }), []);
  const productsAsync = useAsync(() => catalogApi.products({ limit: 100 }), []);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCustomerId, setDraftCustomerId] = useState('');
  const [draftRows, setDraftRows] = useState([]);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pct, setPct] = useState('30');
  const [discountError, setDiscountError] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [convertError, setConvertError] = useState('');
  const [converting, setConverting] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);

  const canViewConfig = hasPermission('admin.manage');
  const configAsync = useAsync(
    () =>
      canViewConfig
        ? adminApi.getConfig()
        : Promise.resolve({ items: [] }),
    [canViewConfig],
  );
  const approvalBands = configAsync.data?.items ?? [];
  const numericPct =
    String(pct).trim() === '' ? null : Number(pct);
  const previewBand =
    numericPct !== null && Number.isFinite(numericPct) && numericPct > 0
      ? findBandForPct(approvalBands, numericPct)
      : null;

  const deal = dealAsync.data;
  const latestRequest = requestsAsync.data?.items?.[0] ?? null;

  const products = productsAsync.data?.items ?? [];
  const customers = customersAsync.data?.items ?? [];

  const productsById = useMemo(
    () => new Map(products.map((product) => [product._id, product])),
    [products],
  );
  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer._id, customer])),
    [customers],
  );

  useDocumentTitle(dealAsync.data?.title ?? 'Deal detail');

  if (dealAsync.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Spinner className="h-4 w-4 text-brand-500" />
        Loading deal
      </div>
    );
  }

  if (dealAsync.error) {
    const notFound =
      dealAsync.error instanceof ApiError && dealAsync.error.status === 404;

    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />
        <h1 className="mt-3 text-base font-semibold text-ink-900">
          {notFound ? 'Deal not found' : 'Could not load deal'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {notFound
            ? 'It may be outside your branch or ownership scope.'
            : errorMessage(dealAsync.error)}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!notFound && (
            <Button variant="secondary" size="sm" onClick={dealAsync.refresh}>
              Try again
            </Button>
          )}
          <Link to="/deals">
            <Button variant="ghost" size="sm">
              Back to deals
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = String(deal.ownerId) === user?.id;
  const pending = deal.status === 'pending_approval';
  const canEdit =
    hasPermission('deal.edit') && deal.status === 'open' && !pending;
  const canRequest =
    hasPermission('deal.edit') && deal.status === 'open' && isOwner;
  const canConvert =
    hasPermission('invoice.issue') && deal.status === 'won';
  const customerName =
    customersById.get(String(deal.customerId))?.name ?? shortId(deal.customerId);
  const requestMeta = latestRequest ? REQUEST_LABELS[latestRequest.status] : null;

  function isConflict(error) {
    return error instanceof ApiError && error.status === 409;
  }

  function startEdit() {
    setDraftTitle(deal.title);
    setDraftCustomerId(String(deal.customerId));
    setDraftRows(
      deal.items.map((item) => ({
        key: newKey(),
        productId: String(item.productId),
        qty: String(item.qty),
      })),
    );
    setEditError('');
    setEditing(true);
  }

  function updateDraftRow(key, patch) {
    setDraftRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function closeEdit() {
    if (!saving) setEditing(false);
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditError('');

    if (!draftTitle.trim()) {
      setEditError('A deal title is required.');
      return;
    }

    const items = [];

    for (const row of draftRows) {
      if (!row.productId) {
        setEditError('Choose a product on every line.');
        return;
      }

      const qty = Number(row.qty);

      if (!Number.isInteger(qty) || qty < 1) {
        setEditError('Quantities must be whole numbers of at least 1.');
        return;
      }

      const existing = items.find((item) => item.productId === row.productId);

      if (existing) existing.qty += qty;
      else items.push({ productId: row.productId, qty });
    }

    if (items.length === 0) {
      setEditError('Add at least one line item.');
      return;
    }

    setSaving(true);

    try {
      await dealsApi.update(deal._id, {
        title: draftTitle.trim(),
        customerId: draftCustomerId,
        items,
      });
      setEditing(false);
      dealAsync.refresh();
      toast.success('Deal updated.');
    } catch (error) {
      if (isConflict(error)) {
        // The deal changed underneath the form (status or pending request).
        setEditing(false);
        dealAsync.refresh();
        requestsAsync.refresh();
        toast.error(errorMessage(error));
      } else {
        setEditError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function requestDiscount(event) {
    event.preventDefault();
    setDiscountError('');

    const numericPct = Number(pct);

    if (!Number.isFinite(numericPct) || numericPct < 0 || numericPct > 100) {
      setDiscountError('Enter a discount between 0 and 100.');
      return;
    }

    setRequesting(true);

    try {
      const request = await dealsApi.requestDiscount(deal._id, numericPct);
      dealAsync.refresh();
      requestsAsync.refresh();
      setDiscountOpen(false);

      if (request.status === 'auto_approved') {
        toast.success(`Deal won automatically at ${numericPct}%.`);
      } else {
        toast.success(`Request sent to ${request.currentRole}.`);
      }
    } catch (error) {
      if (isConflict(error)) {
        dealAsync.refresh();
        requestsAsync.refresh();
        toast.error(errorMessage(error));
      }
      setDiscountError(errorMessage(error));
    } finally {
      setRequesting(false);
    }
  }

  async function convertDeal() {
    setConvertError('');
    setConverting(true);

    try {
      const { invoice } = await dealsApi.convert(deal._id);
      setInvoiceId(invoice._id);
      dealAsync.refresh();
      toast.success('Invoice queued for BillPort.');
    } catch (error) {
      if (isConflict(error)) {
        dealAsync.refresh();
        toast.error(errorMessage(error));
      }
      setConvertError(errorMessage(error));
    } finally {
      setConverting(false);
    }
  }

  const draftSubtotal = draftRows.reduce((sum, row) => {
    const product = productsById.get(row.productId);
    const qty = Number(row.qty);
    if (!product || !Number.isInteger(qty) || qty < 1) return sum;
    return sum + product.price * qty;
  }, 0);

  return (
    <div className="space-y-4">
      <Link
        to="/deals"
        className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to deals
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-ink-900">
              {deal.title}
            </h1>
            <DealStatusBadge status={deal.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {customerName} · created {formatDate(idTimestamp(deal._id))}
          </p>
        </div>

        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            disabled={productsAsync.loading || customersAsync.loading}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit deal
          </Button>
        )}
      </header>

      {deal.status === 'open' && deal.rejectionReason && (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Last discount request was rejected: {deal.rejectionReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-900">Items</h2>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {deal.items.map((item) => {
                    const product = productsById.get(String(item.productId));

                    return (
                      <tr key={String(item.productId)} className="transition-colors duration-150 hover:bg-brand-50/60">
                        <td className="px-4 py-2.5">
                          <span className="block font-medium text-slate-700">
                            {product?.name ?? shortId(item.productId)}
                          </span>
                          <span className="block font-mono text-[11px] text-slate-400">
                            {product?.sku ?? item.productId}
                          </span>
                        </td>
                        <td className="num px-4 py-2.5 text-right text-slate-700">
                          {item.qty}
                        </td>
                        <td className="num px-4 py-2.5 text-right text-slate-700">
                          {formatCents(item.price)}
                        </td>
                        <td className="num px-4 py-2.5 text-right font-medium text-slate-800">
                          {formatCents(item.qty * item.price)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            {editing && (
              <Modal
                open={editing}
                onClose={closeEdit}
                title="Edit deal"
                description="Update the deal title, customer, or line items."
                className="max-w-3xl"
              >
              <form onSubmit={saveEdit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" htmlFor="edit-title">
                    <Input
                      id="edit-title"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      disabled={saving}
                      data-autofocus
                    />
                  </Field>
                  <Field label="Customer" htmlFor="edit-customer">
                    <Select
                      id="edit-customer"
                      value={draftCustomerId}
                      onChange={(event) => setDraftCustomerId(event.target.value)}
                      disabled={saving}
                    >
                      <option value="">Select a customer</option>
                      {customers.map((customer) => (
                        <option key={customer._id} value={customer._id}>
                          {customer.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="space-y-2">
                  {draftRows.map((row, index) => {
                    const product = productsById.get(row.productId);
                    const qty = Number(row.qty);
                    const lineTotal = product && qty > 0 ? product.price * qty : 0;

                    return (
                      <div
                        key={row.key}
                        className="grid items-end gap-2 rounded-lg bg-canvas p-2.5 sm:grid-cols-[1fr_5rem_6rem_2rem]"
                      >
                        <Field label={`Product ${index + 1}`} htmlFor={`edit-product-${row.key}`}>
                          <Select
                            id={`edit-product-${row.key}`}
                            value={row.productId}
                            onChange={(event) =>
                              updateDraftRow(row.key, { productId: event.target.value })
                            }
                            disabled={saving}
                          >
                            <option value="">Select a product</option>
                            {products.map((option) => (
                              <option key={option._id} value={option._id}>
                                {option.name} · {option.sku}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Qty" htmlFor={`edit-qty-${row.key}`}>
                          <Input
                            id={`edit-qty-${row.key}`}
                            type="number"
                            min="1"
                            step="1"
                            value={row.qty}
                            onChange={(event) =>
                              updateDraftRow(row.key, { qty: event.target.value })
                            }
                            disabled={saving}
                          />
                        </Field>
                        <div>
                          <span className="block text-xs font-medium text-slate-600">
                            Line total
                          </span>
                          <span className="num block py-2.5 text-right text-sm text-slate-800">
                            {formatCents(lineTotal)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRows((current) =>
                              current.filter((candidate) => candidate.key !== row.key),
                            )
                          }
                          disabled={draftRows.length === 1 || saving}
                          aria-label="Remove line"
                          className="focus-ring mb-1 rounded-md p-2 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDraftRows((current) => [
                        ...current,
                        { key: newKey(), productId: '', qty: '1' },
                      ])
                    }
                    disabled={saving}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add line
                  </Button>
                  <span className="num text-sm font-semibold text-ink-900">
                    {formatCents(draftSubtotal)}
                  </span>
                </div>

                {editError && (
                  <p className="text-xs text-rose-600" role="alert">
                    {editError}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeEdit}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={saving}>
                    <Check className="h-3.5 w-3.5" />
                    Save changes
                  </Button>
                </div>
              </form>
              </Modal>
            )}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-ink-900">Discount</h2>

            {latestRequest ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-700">
                    {latestRequest.pct}% requested
                  </span>
                  {requestMeta && (
                    <Badge tone={requestMeta.tone}>{requestMeta.label}</Badge>
                  )}
                  <span className="text-[11px] text-slate-400">
                    {formatDateTime(idTimestamp(latestRequest._id))}
                  </span>
                </div>

                <ApprovalChain request={latestRequest} />

                {latestRequest.rejectionReason && (
                  <p className="text-xs text-rose-600">
                    {latestRequest.rejectionReason}
                  </p>
                )}
              </div>
            ) : deal.status === 'won' ? (
              <p className="mt-2 text-xs text-slate-500">
                This deal was won without a discount request.
              </p>
            ) : null}

            {canRequest && !pending && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    setDiscountError('');
                    setDiscountOpen(true);
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Request discount
                </Button>
                <p className="mt-2 text-[11px] text-slate-500">
                  The chain is snapshotted on each request. 0% or an empty band
                  wins immediately.
                </p>
              </div>
            )}

            <Modal
              open={discountOpen}
              onClose={() => {
                if (!requesting) setDiscountOpen(false);
              }}
              title="Request discount"
              description="The approval chain comes from the current config and is snapshotted on this request."
              className="max-w-lg"
            >
              <form onSubmit={requestDiscount} className="space-y-4">
                <Field label="Discount %" htmlFor="pct">
                  <div className="relative w-36">
                    <Input
                      id="pct"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={pct}
                      onChange={(event) => setPct(event.target.value)}
                      className="pr-8"
                      disabled={requesting}
                      data-autofocus
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      %
                    </span>
                  </div>
                </Field>

                <div className="rounded-lg bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  {!canViewConfig
                    ? 'Chain assigned by approval config.'
                    : numericPct === 0
                      ? 'Auto-approved — no approver needed at 0%.'
                      : numericPct === null ||
                          !Number.isFinite(numericPct) ||
                          numericPct < 0 ||
                          numericPct > 100
                        ? 'Enter a percentage between 0 and 100.'
                        : previewBand
                          ? previewBand.chain.length === 0
                            ? `Band ${previewBand.minPct}–${previewBand.maxPct}% has an empty chain, so this request auto-approves.`
                            : `Chain for ${previewBand.minPct}–${previewBand.maxPct}%: ${previewBand.chain.join(' → ')}.`
                          : 'No approval band matches this percentage.'}
                </div>

                {discountError && (
                  <p
                    role="alert"
                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200"
                  >
                    {discountError}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDiscountOpen(false)}
                    disabled={requesting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={requesting}>
                    <Send className="h-3.5 w-3.5" />
                    Request discount
                  </Button>
                </div>
              </form>
            </Modal>

            {!canRequest && deal.status === 'open' && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Only the deal owner can request a discount.
              </p>
            )}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
              <MessageSquare className="h-4 w-4 text-brand-600" />
              Deal chat
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Every deal has a thread for its owner and manager.
            </p>
            {hasPermission('chat.send') ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={chatOpen}
                    onClick={() => setChatOpen((value) => !value)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {chatOpen ? 'Hide conversation' : 'Open conversation'}
                  </Button>
                  <Link
                    to={`/chat/${deal._id}`}
                    className="focus-ring text-[11px] font-medium text-brand-700 hover:text-brand-600"
                  >
                    Open full chat
                  </Link>
                </div>
                {chatOpen && (
                  <div className="mt-3 h-[26rem] overflow-hidden rounded-lg ring-1 ring-slate-200">
                    <ChatPanel dealId={String(deal._id)} />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                Chat is unavailable for your role.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-ink-900">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="num text-slate-800">{formatCents(deal.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Discount</dt>
                <dd className="num text-slate-800">
                  {deal.discountPct > 0 ? `${deal.discountPct}%` : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                <dt className="text-slate-500">Total</dt>
                <dd className="num font-semibold text-ink-900">
                  {deal.status === 'won' ? formatCents(deal.total) : 'Pending approval'}
                </dd>
              </div>
            </dl>

            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Owner</dt>
                <dd className="font-mono text-slate-600">{shortId(deal.ownerId)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Branch</dt>
                <dd className="font-mono text-slate-600">{shortId(deal.branchId)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-600">{formatDate(idTimestamp(deal._id))}</dd>
              </div>
              {deal.convertedAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Converted</dt>
                  <dd className="text-slate-600">{formatDateTime(deal.convertedAt)}</dd>
                </div>
              )}
            </dl>
          </section>

          {deal.status === 'won' && (
            <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                <FileText className="h-4 w-4 text-brand-600" />
                Invoice
              </h2>

              {invoiceId ? (
                <Link
                  to={`/invoices/${invoiceId}`}
                  className="focus-ring mt-3 block rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                >
                  Invoice queued — open invoice
                </Link>
              ) : deal.convertedAt ? (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Converted on {formatDateTime(deal.convertedAt)}. The invoice
                    is already queued for BillPort.
                  </p>
                  <Link
                    to="/invoices"
                    className="focus-ring mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-600"
                  >
                    View invoices
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Conversion creates the sale and queues the invoice for
                    BillPort. Repeating it returns the same invoice.
                  </p>
                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    loading={converting}
                    disabled={!canConvert}
                    onClick={convertDeal}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Convert to invoice
                  </Button>
                  {!canConvert && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Your role cannot issue invoices.
                    </p>
                  )}
                  {convertError && (
                    <p className="mt-2 text-xs text-rose-600" role="alert">
                      {convertError}
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
