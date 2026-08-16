import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { RegisterPage } from './pages/register/RegisterPage';
import { startOfflineRuntime } from './offline';

function Guard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function CashierApp() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    startOfflineRuntime();
  }, []);

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
        element={isAuthenticated ? <Navigate to="/register" replace /> : <LoginPage />}
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
        path="*"
        element={<Navigate to={isAuthenticated ? '/register' : '/login'} replace />}
      />
    </Routes>
  );
}
