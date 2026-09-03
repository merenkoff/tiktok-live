// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

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
import { StockHubPage } from './pages/admin/stock/StockHubPage';
import { StockActionPage } from './pages/admin/stock/StockActionPage';
import { StockInventoryPage } from './pages/admin/stock/StockInventoryPage';
import { StockHistoryPage } from './pages/admin/stock/StockHistoryPage';
import { StockMovementPage } from './pages/admin/stock/StockMovementPage';
import { StockDocumentDetailPage } from './pages/admin/stock/StockDocumentDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { RegisterPage } from './pages/register/RegisterPage';
import { CashierSalesPage } from './pages/sales/CashierSalesPage';

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
        path="/sales"
        element={
          <Guard>
            <CashierSalesPage />
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
        <Route path="stock" element={<StockHubPage />} />
        <Route path="stock/receipt" element={<StockActionPage type="receipt" />} />
        <Route path="stock/writeoff" element={<StockActionPage type="writeoff" />} />
        <Route path="stock/adjust" element={<StockActionPage type="adjustment" />} />
        <Route path="stock/inventory" element={<StockInventoryPage />} />
        <Route path="stock/inventory/:id" element={<StockInventoryPage />} />
        <Route path="stock/history" element={<StockHistoryPage />} />
        <Route path="stock/movement" element={<StockMovementPage />} />
        <Route path="stock/documents/:id" element={<StockDocumentDetailPage />} />
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
