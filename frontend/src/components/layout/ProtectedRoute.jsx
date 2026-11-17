import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { FullPageSpinner } from '../ui';
import AppShell from './AppShell';

export default function ProtectedRoute({
  children,
  permission,
  permissions,
}) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const location = useLocation();

  const required = permissions ?? (permission ? [permission] : []);

  if (status === 'idle' || status === 'loading') {
    return <FullPageSpinner label="Restoring session" />;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (required.some((key) => !hasPermission(key))) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center">
          <div className="max-w-sm text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-500" />
            <h2 className="mt-3 text-lg font-semibold text-ink-900">
              You do not have access to this page
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Your role is missing the required permission. Contact an
              administrator if you think this is a mistake.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return children;
}
