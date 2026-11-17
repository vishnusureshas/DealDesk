import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const VARIANTS = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Input({ className = '', invalid = false, ...props }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`focus-ring h-10 w-full rounded-lg bg-white px-3 text-sm text-slate-800 ring-1 placeholder:text-slate-400 disabled:bg-slate-50 ${
        invalid ? 'ring-rose-400' : 'ring-slate-300'
      } ${className}`}
      {...props}
    />
  );
}

export function Field({ label, htmlFor, error, hint, children }) {
  const describedBy = htmlFor
    ? error
      ? `${htmlFor}-error`
      : hint
        ? `${htmlFor}-hint`
        : undefined
    : undefined;

  const content = Children.map(children, (child) => {
    if (!describedBy || !isValidElement(child)) return child;

    return cloneElement(child, {
      'aria-describedby': describedBy,
      ...(error ? { 'aria-invalid': true } : {}),
    });
  });

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-600"
      >
        {label}
      </label>
      {content}
      {error ? (
        <p id={describedBy} className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <Spinner className="h-5 w-5 text-brand-500" />
        {label}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className = 'max-w-2xl',
}) {
  const panelRef = useRef(null);
  const titleId = useId();

  useFocusTrap({ active: open, onClose, containerRef: panelRef });

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl ${className}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink-900">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="focus-ring -mr-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TOAST_STYLES = {
  info: 'bg-white text-slate-700 ring-slate-200',
  success: 'bg-white text-emerald-700 ring-emerald-200',
  error: 'bg-white text-rose-700 ring-rose-200',
};

const TOAST_ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.kind] ?? Info;

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm shadow-lg ring-1 ${TOAST_STYLES[toast.kind] ?? TOAST_STYLES.info}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="focus-ring rounded text-slate-400 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE_TONES[tone] ?? BADGE_TONES.slate} ${className}`}
    >
      {children}
    </span>
  );
}

export function Select({ className = '', invalid = false, children, ...props }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`focus-ring h-10 w-full rounded-lg bg-white px-2.5 text-sm text-slate-800 ring-1 disabled:bg-slate-50 ${
        invalid ? 'ring-rose-400' : 'ring-slate-300'
      } ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  searchPlaceholder = 'Search',
  disabled = false,
  invalid = false,
  className = '',
  ...props
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  let visible = normalized
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalized),
      )
    : options;
  const selected = options.find((option) => option.value === value);

  if (selected && !visible.some((option) => option.value === value)) {
    visible = [selected, ...visible];
  }

  return (
    <div className="space-y-1.5">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        disabled={disabled}
      />
      <Select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        invalid={invalid}
        className={className}
        {...props}
      >
        <option value="">{placeholder}</option>
        {visible.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {normalized && visible.length <= (selected ? 1 : 0) && (
        <p className="text-[11px] text-slate-500">No matching options.</p>
      )}
    </div>
  );
}

export function Textarea({ className = '', invalid = false, ...props }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`focus-ring min-h-20 w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 placeholder:text-slate-400 disabled:bg-slate-50 ${
        invalid ? 'ring-rose-400' : 'ring-slate-300'
      } ${className}`}
      {...props}
    />
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  useDocumentTitle(title);

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse rounded-md bg-slate-200/80 ${className}`}
    />
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      {Icon && <Icon className="h-7 w-7 text-slate-300" />}
      <h3 className="mt-3 text-sm font-medium text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs({ items, value, onChange, label = 'Filters' }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200"
    >
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            key={item.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={`focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-brand-500 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onLoadMore, loadedCount }) {
  if (!hasMore) {
    return loadedCount > 0 ? (
      <p className="py-2 text-center text-[11px] text-slate-400">
        All {loadedCount} loaded
      </p>
    ) : null;
  }

  return (
    <div className="py-2 text-center">
      <Button variant="secondary" size="sm" loading={loading} onClick={onLoadMore}>
        Load more
      </Button>
    </div>
  );
}
