'use client';
 
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="h-screen w-screen flex items-center justify-center bg-gray-50 text-gray-900">
        <div className="text-center p-10">
          <h2 className="text-3xl font-bold mb-4">Critical Error</h2>
          <p className="mb-6 text-gray-600">The application encountered a critical error and cannot continue.</p>
          <button
            onClick={() => reset()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Restart Application
          </button>
        </div>
      </body>
    </html>
  );
}
