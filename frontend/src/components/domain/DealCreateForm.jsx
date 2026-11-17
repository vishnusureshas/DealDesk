import { useMemo, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { catalogApi, dealsApi } from '../../api/endpoints';
import {
  Button,
  Field,
  Input,
  SearchableSelect,
  Select,
  Spinner,
} from '../ui';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { toast } from '../../stores/uiStore';

const emptyRow = () => ({
  key:
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productId: '',
  qty: '1',
});

export default function DealCreateForm({ onCancel, onCreated }) {
  const customers = useAsync(() => catalogApi.customers({ limit: 100 }), []);
  const products = useAsync(() => catalogApi.products({ limit: 100 }), []);

  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const productList = products.data?.items ?? [];
  const customerList = customers.data?.items ?? [];

  const productsById = useMemo(
    () => new Map(productList.map((product) => [product._id, product])),
    [productList],
  );

  const subtotal = rows.reduce((sum, row) => {
    const product = productsById.get(row.productId);
    const qty = Number(row.qty);
    if (!product || !Number.isInteger(qty) || qty < 1) return sum;
    return sum + qty * product.price;
  }, 0);

  function updateRow(key, patch) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(key) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!title.trim()) nextErrors.title = 'A deal title is required.';
    if (!customerId) nextErrors.customerId = 'Choose a customer.';

    const lines = [];

    for (const row of rows) {
      if (!row.productId) {
        nextErrors.items = 'Choose a product on every line.';
        break;
      }

      const qty = Number(row.qty);

      if (!Number.isInteger(qty) || qty < 1) {
        nextErrors.items = 'Quantities must be whole numbers of at least 1.';
        break;
      }

      const existing = lines.find((line) => line.productId === row.productId);

      if (existing) existing.qty += qty;
      else lines.push({ productId: row.productId, qty });
    }

    if (rows.length === 0) nextErrors.items = 'Add at least one line item.';

    setErrors(nextErrors);
    setSubmitError('');

    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);

    try {
      const deal = await dealsApi.create({
        title: title.trim(),
        customerId,
        items: lines,
      });
      toast.success('Deal created.');
      onCreated?.(deal);
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const catalogsLoading = customers.loading || products.loading;
  const catalogsError = customers.error || products.error;

  if (catalogsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Spinner className="h-4 w-4 text-brand-500" />
        Loading customers and products
      </div>
    );
  }

  if (catalogsError) {
    return (
      <div className="py-8 text-center">
        <AlertCircle className="mx-auto h-7 w-7 text-rose-500" />
        <h3 className="mt-3 text-base font-semibold text-ink-900">
          Catalogs unavailable
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {errorMessage(catalogsError)} Check that the API exposes
          <code className="mx-1 rounded bg-slate-100 px-1 text-xs">
            GET /customers
          </code>
          and
          <code className="mx-1 rounded bg-slate-100 px-1 text-xs">
            GET /products
          </code>
          .
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              customers.refresh();
              products.refresh();
            }}
          >
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="new-deal-title" error={errors.title}>
          <Input
            id="new-deal-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Acme renewal — Q4"
            invalid={Boolean(errors.title)}
            disabled={submitting}
            data-autofocus
          />
        </Field>

        <Field
          label="Customer"
          htmlFor="new-deal-customer"
          error={errors.customerId}
        >
          <SearchableSelect
            id="new-deal-customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            options={customerList.map((customer) => ({
              value: customer._id,
              label: customer.name,
            }))}
            placeholder="Select a customer"
            searchPlaceholder="Search customers"
            invalid={Boolean(errors.customerId)}
            disabled={submitting}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-canvas p-3 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink-900">Line items</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={addRow}
            disabled={submitting}
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row, index) => {
            const product = productsById.get(row.productId);
            const qty = Number(row.qty);
            const lineTotal =
              product && Number.isInteger(qty) && qty > 0
                ? product.price * qty
                : 0;

            return (
              <div
                key={row.key}
                className="grid items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_6rem_7rem_2.25rem]"
              >
                <Field
                  label={`Product ${index + 1}`}
                  htmlFor={`new-product-${row.key}`}
                >
                  <Select
                    id={`new-product-${row.key}`}
                    value={row.productId}
                    onChange={(event) =>
                      updateRow(row.key, { productId: event.target.value })
                    }
                    disabled={submitting}
                  >
                    <option value="">Select a product</option>
                    {productList.map((option) => (
                      <option key={option._id} value={option._id}>
                        {option.name} · {option.sku} · {formatCents(option.price)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Qty" htmlFor={`new-qty-${row.key}`}>
                  <Input
                    id={`new-qty-${row.key}`}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(event) =>
                      updateRow(row.key, { qty: event.target.value })
                    }
                    disabled={submitting}
                  />
                </Field>

                <div>
                  <span className="block text-xs font-medium text-slate-600">
                    Line total
                  </span>
                  <span className="num mt-2 block h-10 text-right text-sm leading-10 text-slate-800">
                    {formatCents(lineTotal)}
                  </span>
                </div>

                <div className="flex justify-end sm:pt-6">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1 || submitting}
                    aria-label="Remove line"
                    className="focus-ring rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {errors.items && (
          <p className="mt-2 text-xs text-rose-600" role="alert">
            {errors.items}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-500">
            Estimated subtotal — server recalculates from current prices.
          </span>
          <span className="num text-base font-semibold text-ink-900">
            {formatCents(subtotal)}
          </span>
        </div>
      </div>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {submitError}
        </p>
      )}

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
        The discount is requested through an approval request on the deal page.
        The total stays at 0 until the deal is won.
      </p>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={submitting}>
          Create deal
        </Button>
      </div>
    </form>
  );
}
