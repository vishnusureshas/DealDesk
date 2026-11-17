import { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare,
  Handshake,
  MessageSquare,
  ReceiptText,
  Settings,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const NAV_ITEMS = [
  { to: '/deals', label: 'Deals', permission: 'deal.view', icon: Handshake },
  {
    to: '/approvals',
    label: 'Approvals',
    permission: 'discount.approve',
    icon: CheckSquare,
  },
  {
    to: '/invoices',
    label: 'Invoices',
    permission: 'deal.view',
    icon: ReceiptText,
  },
  {
    to: '/chat',
    label: 'Chat',
    permissions: ['chat.send', 'deal.view'],
    icon: MessageSquare,
  },
  { to: '/admin', label: 'Admin', permission: 'admin.manage', icon: Settings },
];

export default function Sidebar() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const user = useAuthStore((state) => state.user);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  const drawerRef = useRef(null);

  useFocusTrap({
    active: sidebarOpen,
    onClose: closeSidebar,
    containerRef: drawerRef,
  });

  const items = NAV_ITEMS.filter((item) =>
    (item.permissions ?? [item.permission]).every((permission) =>
      hasPermission(permission),
    ),
  );

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 cursor-default bg-slate-900/40 md:hidden"
        />
      )}

      <aside
        ref={drawerRef}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ink-900 px-3 py-5 text-slate-300 transition-transform duration-150 md:z-0 md:translate-x-0 md:visible ${
          sidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              DD
            </span>
            <span className="text-sm font-semibold tracking-wide text-white">
              DealDesk
            </span>
          </span>
          <button
            type="button"
            data-autofocus
            onClick={closeSidebar}
            aria-label="Close navigation"
            className="focus-ring rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-6 space-y-1" aria-label="Primary">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-2 text-[11px] leading-relaxed text-slate-500">
          Signed in as
          <div className="mt-0.5 truncate text-slate-300">{user?.email}</div>
        </div>
      </aside>
    </>
  );
}
