// admin/src/components/Header.tsx

import { useAuthStore } from '../hooks/useAuth';

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎬</div>
          <div>
            <h1 className="text-2xl font-bold">TikTok LIVE</h1>
            <p className="text-blue-100 text-sm">Automation Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {user && (
            <div className="text-right">
              <p className="text-sm font-medium">@{user.tiktok_username}</p>
              <p className="text-blue-100 text-xs">{user.subscription_level}</p>
            </div>
          )}

          <nav className="flex gap-4">
            <a
              href="/settings"
              className="px-4 py-2 hover:bg-white/20 rounded-lg transition"
            >
              ⚙️ Settings
            </a>
            <a
              href="/session"
              className="px-4 py-2 hover:bg-white/20 rounded-lg transition"
            >
              🎬 Session
            </a>
            <button
              onClick={handleLogout}
              className="px-4 py-2 hover:bg-white/20 rounded-lg transition"
            >
              🚪 Logout
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}