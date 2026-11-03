'use client';

// Rendered outside the root layout, so it can't rely on globals.css — styles are inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: '#f6f7f9',
          color: '#0f172a',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            background: '#fff',
            border: '1px solid #e3e6eb',
            borderRadius: 12,
            padding: 32,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Critical error</h2>
          <p style={{ color: '#5b6577', fontSize: 14, margin: '8px 0 24px' }}>
            SecureVault ran into a problem it couldn&apos;t recover from. Your vault data is safe.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#1d4ed8',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              height: 40,
              padding: '0 18px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Restart application
          </button>
        </div>
      </body>
    </html>
  );
}
