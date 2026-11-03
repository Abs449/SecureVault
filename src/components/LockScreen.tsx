'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signOut } from '@/lib/auth';
import { ErrorAlert, PasswordInput } from './ui';
import { LogoMark } from './Logo';

export default function LockScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { unlockVault } = useVault();

  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await unlockVault(masterPassword);
    } catch (err) {
      setError((err as Error).message);
      setMasterPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut().catch((err) => console.error('Failed to sign out:', err));
    router.replace('/');
  };

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pt-[18vh]">
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Your vault is locked</h1>
          {user?.email && <p className="mt-1 text-sm text-fg-muted">{user.email}</p>}
        </div>

        <form onSubmit={handleUnlock} className="mt-8 space-y-4">
          <div>
            <label htmlFor="masterPassword" className="field-label">Master password</label>
            <PasswordInput
              id="masterPassword"
              autoComplete="off"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && <ErrorAlert>{error}</ErrorAlert>}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                Unlocking…
              </>
            ) : (
              'Unlock'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button onClick={handleSignOut} className="text-fg-muted hover:text-fg">
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}
