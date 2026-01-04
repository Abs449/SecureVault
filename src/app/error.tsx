'use client'; // Error components must be Client Components

import { useEffect } from 'react';

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
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="rounded-lg bg-red-50 p-8 shadow-xl dark:bg-gray-900 border border-red-100 dark:border-red-900">
        <h2 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-500">
          Something went wrong!
        </h2>
        <p className="mb-6 text-gray-600 dark:text-gray-300 max-w-md">
          {error.message || "An unexpected error occurred while processing your request."}
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 transition-colors dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          >
            Reload Page
          </button>
          <button
            onClick={
              // Attempt to recover by trying to re-render the segment
              () => reset()
            }
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && (
           <pre className="mt-8 overflow-auto text-left text-xs bg-black text-green-400 p-4 rounded max-w-lg mx-auto">
             {error.stack}
           </pre>
        )}
      </div>
    </div>
  );
}
