'use client';

import { useEffect, useState } from 'react';

export function SystemCheck() {
  const [isSecure, setIsSecure] = useState(true);
  const [hasCrypto, setHasCrypto] = useState(true);
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    // 1. Check for Secure Context (HTTPS or localhost)
    const secureCoordinates = window.isSecureContext;
    setIsSecure(secureCoordinates);

    // 2. Check for Web Crypto API
    const cryptoAvailable = !!(window.crypto && window.crypto.subtle);
    setHasCrypto(cryptoAvailable);

    setIsChecked(true);
  }, []);

  if (!isChecked) return null;

  if (isSecure && hasCrypto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95 p-4 text-white">
      <div className="max-w-md rounded-lg bg-red-900 p-6 shadow-2xl border border-red-700">
        <h2 className="mb-4 text-2xl font-bold flex items-center">
          <svg className="w-8 h-8 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Security Requirements Not Met
        </h2>
        
        <div className="space-y-4">
          {!isSecure && (
            <div className="bg-red-800/50 p-3 rounded">
              <h3 className="font-semibold text-red-200">⚠️ Insecure Connection</h3>
              <p className="text-sm text-red-100">
                This application requires a secure context (HTTPS) to perform cryptographic operations. 
                Please ensure you are accessing this site via <strong>https://</strong>.
              </p>
            </div>
          )}

          {!hasCrypto && (
            <div className="bg-red-800/50 p-3 rounded">
              <h3 className="font-semibold text-red-200">⚠️ Web Crypto API Missing</h3>
              <p className="text-sm text-red-100">
                Your browser does not support the Web Crypto API required for encryption.
                Please upgrade to a modern browser (Chrome, Firefox, Safari, Edge).
              </p>
            </div>
          )}
        </div>

        <button 
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded bg-red-700 px-4 py-2 hover:bg-red-600 transition-colors"
        >
          Check Again
        </button>
      </div>
    </div>
  );
}
