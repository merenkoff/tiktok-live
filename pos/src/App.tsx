import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { DashboardPage } from './pages/admin/DashboardPage';
import { ProductsPage } from './pages/admin/ProductsPage';
import { SalesPage } from './pages/admin/SalesPage';
import { StaffPage } from './pages/admin/StaffPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { RegisterPage } from './pages/register/RegisterPage';

function Guard({
  children,
  ownerOnly = false,
}: {
  children: React.ReactNode;
  ownerOnly?: boolean;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (ownerOnly && role !== 'owner') return <Navigate to="/register" replace />;
  return <>{children}</>;
}

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role());

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-sq-secondary">
        Завантаження…
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={role === 'owner' ? '/admin' : '/register'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/register"
        element={
          <Guard>
            <RegisterPage />
          </Guard>
        }
      />
      <Route
        path="/customers"
        element={
          <Guard>
            <CustomersPage cashierShell />
          </Guard>
        }
      />
      <Route
        path="/admin"
        element={
          <Guard ownerOnly>
            <AdminLayout />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            to={isAuthenticated ? (role === 'owner' ? '/admin' : '/register') : '/login'}
            replace
          />
        }
      />
    </Routes>
  );
}
