import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ChatPage from './pages/ChatPage';
import DealDetailPage from './pages/DealDetailPage';
import DealsPage from './pages/DealsPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import InvoicesPage from './pages/InvoicesPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuthStore } from './stores/authStore';
import { connectSocket } from './realtime/socket';

function SessionBootstrapper() {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return null;
}

function SocketConnector() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (userId) connectSocket();
  }, [userId]);

  return null;
}

function UnauthorizedWatcher() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    function handleUnauthorized() {
      logout();
      navigate('/login?expired=1', { replace: true });
    }

    window.addEventListener('dealdesk:unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('dealdesk:unauthorized', handleUnauthorized);
    };
  }, [logout, navigate]);

  return null;
}

function ShellRoute({ permission, permissions, children }) {
  return (
    <ProtectedRoute permission={permission} permissions={permissions}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionBootstrapper />
      <SocketConnector />
      <UnauthorizedWatcher />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Navigate to="/deals" replace />} />
        <Route
          path="/deals"
          element={
            <ShellRoute permission="deal.view">
              <DealsPage />
            </ShellRoute>
          }
        />
        <Route
          path="/deals/new"
          element={
            <ShellRoute permissions={['deal.view', 'deal.edit']}>
              <DealsPage />
            </ShellRoute>
          }
        />
        <Route
          path="/deals/:id"
          element={
            <ShellRoute permission="deal.view">
              <DealDetailPage />
            </ShellRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ShellRoute permission="discount.approve">
              <ApprovalsPage />
            </ShellRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ShellRoute permission="deal.view">
              <InvoicesPage />
            </ShellRoute>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <ShellRoute permission="deal.view">
              <InvoiceDetailPage />
            </ShellRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ShellRoute permissions={['chat.send', 'deal.view']}>
              <ChatPage />
            </ShellRoute>
          }
        />
        <Route
          path="/chat/:dealId"
          element={
            <ShellRoute permissions={['chat.send', 'deal.view']}>
              <ChatPage />
            </ShellRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ShellRoute permission="admin.manage">
              <AdminPage />
            </ShellRoute>
          }
        />

        <Route
          path="*"
          element={
            <ShellRoute>
              <NotFoundPage />
            </ShellRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
