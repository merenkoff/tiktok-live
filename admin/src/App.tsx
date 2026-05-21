// admin/src/App.tsx

import { useEffect } from 'react';
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
    <>
      {path === '/settings' && <SettingsPage />}
      {path === '/session' && <SessionPage />}
      {path === '/' && <SessionPage />}
    </>
  );
}