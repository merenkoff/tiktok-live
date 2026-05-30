// admin/src/components/Header.tsx — Premium Horizontal Navigation

import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuth';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          maxWidth: '100%',
          margin: '0 auto',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '68px',
          gap: '32px',
        }}
      >
        {/* ── LOGO & BRAND (Left) ── */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            const logo = e.currentTarget.querySelector('[data-logo]') as HTMLElement;
            if (logo) logo.style.transform = 'scale(1.05) rotate(-2deg)';
          }}
          onMouseLeave={(e) => {
            const logo = e.currentTarget.querySelector('[data-logo]') as HTMLElement;
            if (logo) logo.style.transform = 'scale(1) rotate(0deg)';
          }}
        >
          {/* Icon */}
          <div
            data-logo
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent) 0%, #00d9a3 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 800,
              color: '#0a0c0f',
              boxShadow: '0 0 20px rgba(0,229,160,0.4)',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            🎬
          </div>

          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}
            >
              LiveShop
            </div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
              }}
            >
              Admin
            </div>
          </div>
        </button>

        {/* ── NAVIGATION (Center) ── */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <NavItem
            label="🎬 Live Session"
            isActive={isActive('/')}
            onClick={() => navigate('/')}
          />
          <NavItem
            label="⚙️ Settings"
            isActive={isActive('/settings')}
            onClick={() => navigate('/settings')}
          />
        </nav>

        {/* ── ACTIONS (Right) ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '1px',
              height: '24px',
              background: 'var(--border-subtle)',
            }}
          />
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--red)';
              e.currentTarget.style.background = 'rgba(240,77,77,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── Navigation Item ── */
function NavItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        border: 'none',
        fontSize: '13px',
        fontWeight: isActive ? 700 : 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderRadius: 'var(--radius-md)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {label}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '20px',
            height: '2px',
            background: 'var(--accent)',
            borderRadius: '1px',
            animation: 'slideIn 0.3s ease',
          }}
        />
      )}
    </button>
  );
}
