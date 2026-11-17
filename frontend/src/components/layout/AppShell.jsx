import { LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { Button, Toaster } from '../ui';
import { initials } from '../../lib/format';
import Sidebar from './Sidebar';
import NotificationBell from '../domain/NotificationBell';

export default function AppShell({ children }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const openSidebar = useUiStore((state) => state.openSidebar);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={openSidebar}
              aria-label="Open navigation"
              className="focus-ring -ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-xs font-bold text-white">
              DD
            </span>
            <span className="text-sm font-semibold text-ink-900">DealDesk</span>
          </div>
          <div className="hidden text-xs text-slate-500 md:block">
            DealDesk workspace
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium text-slate-700">
                {user?.email}
              </span>
              <span className="block text-slate-500">{user?.role?.key}</span>
            </span>
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
            >
              {initials(user?.email)}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  );
}
