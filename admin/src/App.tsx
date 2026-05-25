// admin/src/App.tsx — unchanged logic, updated class names removed

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<SessionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/session"  element={<SessionPage />} />
      </Routes>
    </BrowserRouter>
  );
}
