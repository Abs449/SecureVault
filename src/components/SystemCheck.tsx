'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export function SystemCheck() {
  const [problems, setProblems] = useState<{ title: string; body: string }[]>([]);

  useEffect(() => {
    const found = [];
    if (!window.isSecureContext) {
      found.push({
        title: 'Insecure connection',
        body: 'Encryption requires a secure context. Open this site over https://.',
      });
    }
    if (!window.crypto?.subtle) {
      found.push({
        title: 'Web Crypto unavailable',
        body: 'This browser does not support the Web Crypto API. Use a current version of Chrome, Firefox, Safari or Edge.',
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- environment check runs once on mount
    setProblems(found);
  }, []);

  if (problems.length === 0) return null;

  return (
    <div className="modal-overlay z-2000">
      <div className="modal-content max-w-md p-6" role="alertdialog" aria-labelledby="syscheck-title">
        <div className="flex items-center gap-3">
          <ShieldAlert size={22} className="text-danger" aria-hidden />
          <h2 id="syscheck-title" className="font-semibold">SecureVault can&apos;t run here</h2>
        </div>
        <ul className="mt-4 space-y-3">
          {problems.map((p) => (
            <li key={p.title} className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-sm font-medium">{p.title}</p>
              <p className="mt-0.5 text-sm text-fg-muted">{p.body}</p>
            </li>
          ))}
        </ul>
        <button onClick={() => window.location.reload()} className="btn btn-primary mt-5 w-full">
          Check again
        </button>
      </div>
    </div>
  );
}
