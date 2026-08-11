// admin/src/components/LoadingSpinner.tsx

export function LoadingSpinner() {
  return (
    <div
      data-testid="loading-spinner"
      style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-base)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-default)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin-slow 0.7s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Завантаження...</p>
      </div>
    </div>
  );
}
