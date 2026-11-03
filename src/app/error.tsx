'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an analytics service
    console.error('Runtime Application Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md p-8 text-center">
        <CircleAlert size={28} className="mx-auto text-danger" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-fg-muted">
          {error.message || 'An unexpected error occurred while processing your request.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="btn btn-secondary">
            Reload page
          </button>
          <button onClick={() => reset()} className="btn btn-primary">
            Try again
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && error.stack && (
          <pre className="mt-6 max-h-60 overflow-auto rounded-lg bg-surface-muted p-4 text-left font-mono text-xs text-fg-muted">
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
