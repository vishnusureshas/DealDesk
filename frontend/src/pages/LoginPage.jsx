import { useState } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ApiError } from '../api/client';
import { errorMessage } from '../lib/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, Field, Input, Toaster } from '../components/ui';

const FEATURES = [
  { icon: ShieldCheck, title: 'Role-scoped', detail: 'permissions' },
  { icon: MessageSquare, title: 'Live', detail: 'approvals + chat' },
  { icon: ReceiptText, title: 'BillPort', detail: 'invoice sync' },
];

function IconInput({ icon: Icon, action, ...props }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input className="pl-9 pr-10" {...props} />
      {action}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login = useAuthStore((state) => state.login);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useDocumentTitle('Sign in');

  const from = location.state?.from || '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(
        loginError instanceof ApiError && loginError.status === 401
          ? loginError.message || 'Invalid email or password.'
          : errorMessage(loginError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] lg:h-[100dvh] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-8 xl:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-700/20 blur-3xl"
        />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-lg shadow-brand-500/25">
              DD
            </span>
            <span className="text-base font-semibold tracking-wide text-white">
              DealDesk
            </span>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Sales operations
          </span>
        </div>

        <div className="relative my-8 max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300/20 bg-brand-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
            One workspace
          </span>
          <h1 className="mt-4 text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl">
            Deals, discounts and invoices in one place.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Approvals move through your configured chain, invoices sync to
            BillPort, and every event lands in the audit log.
          </p>

          <div className="mt-7 max-w-md rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  Deal #DD-2481
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  Acme renewal — Q4
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-300 ring-1 ring-amber-400/30">
                Pending approval
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-slate-500">Deal value</p>
                <p className="mt-0.5 text-xl font-semibold tracking-tight text-white">
                  $12,480.00
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Discount</p>
                <p className="mt-0.5 text-sm font-medium text-brand-300">
                  30% requested
                </p>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-brand-500" />
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
                  <Check className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    Submitted
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Sales exec · 09:12
                  </p>
                </div>
                <span className="text-[10px] font-medium text-emerald-300">
                  Done
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/15 ring-1 ring-brand-500/40">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white">
                    Discount approval
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Manager → Finance
                  </p>
                </div>
                <span className="text-[10px] font-medium text-brand-300">
                  In review
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ring-white/15">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-400">Invoice</p>
                  <p className="text-[10px] text-slate-600">
                    Queued for BillPort
                  </p>
                </div>
                <span className="text-[10px] font-medium text-slate-600">
                  Next
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-5">
            {FEATURES.map(({ icon: Icon, title, detail }) => (
              <div key={title}>
                <Icon className="h-4 w-4 text-brand-300" />
                <p className="mt-2 text-xs font-medium text-slate-200">
                  {title}
                </p>
                <p className="text-[10px] text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-600">
            Internal sales operations workspace
          </p>
        </div>
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-canvas px-4 py-5 sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-slate-200/60 blur-3xl"
        />

        <div className="relative w-full max-w-[26rem]">
          <div className="mb-5 flex items-center justify-between sm:mb-7 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-xs font-bold text-white shadow-md shadow-brand-500/20">
                DD
              </span>
              <span className="text-sm font-semibold tracking-wide text-ink-900">
                DealDesk
              </span>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
              Internal
            </span>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/80 sm:p-7">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure sign in
            </div>
            <h2 className="mt-2.5 text-[1.65rem] font-semibold tracking-tight text-ink-900">
              Welcome back
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Sign in to manage deals, approvals and invoices.
            </p>

            {searchParams.get('expired') && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Your session expired. Sign in again to continue.
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
              <Field label="Work email" htmlFor="email">
                <IconInput
                  icon={Mail}
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@dealdesk.test"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>

              <Field label="Password" htmlFor="password">
                <IconInput
                  icon={LockKeyhole}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  required
                  action={
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />
              </Field>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700 ring-1 ring-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="group w-full"
                loading={submitting}
                disabled={!email || !password}
              >
                {submitting ? (
                  'Signing in'
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-[10px] text-slate-400">
            Protected by role-based access · Contact your admin
          </p>
        </div>
      </section>

      <Toaster />
    </div>
  );
}
