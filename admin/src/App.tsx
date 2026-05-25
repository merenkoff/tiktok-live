// admin/src/App.tsx

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route /*, Link, Navigate, useNavigate, useLocation*/ } from 'react-router-dom';
import { useAuthStore } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { SessionPage } from './pages/SessionPage';

export function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadUser = useAuthStore((state) => state.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Get current page from URL
  const path = window.location.pathname;

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
    <div className="app">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SessionPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/session" element={<SessionPage />} />
        </Routes>
      </main>
    </div>
    </BrowserRouter>
  );
}