export const CURRENCY = 'USD';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
});

export function formatCents(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return formatter.format(Number(value) / 100);
}

export function toCents(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.includes('-')) return null;
  const normalized = raw.replace(/[^0-9.]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToInput(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

// Mirrors backend computeTotal: round exactly once.
export function expectedTotal(subtotal, pct) {
  return Math.round((subtotal * (100 - pct)) / 100);
}
