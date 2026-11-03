'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signIn, signOut } from '@/lib/auth';
import AuthShell from '@/components/AuthShell';
import { ErrorAlert, FullPageSpinner, PasswordInput } from '@/components/ui';

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { unlockVault } = useVault();

  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // While the form is submitting, this page handles navigation itself.
  const submitting = useRef(false);

  // Already signed in (e.g. returning visitor): go to the vault, which shows the lock screen.
  useEffect(() => {
    if (!authLoading && user && !submitting.current) router.replace('/dashboard');
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    submitting.current = true;

    try {
      await signIn(email, accountPassword);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      submitting.current = false;
      return;
    }

    try {
      await unlockVault(masterPassword);
      router.replace('/dashboard');
    } catch (err) {
      // Account password was right but the master password wasn't: sign back out so the
      // form state and auth state stay consistent.
      await signOut().catch(() => {});
      setMasterPassword('');
      setError((err as Error).message);
      setLoading(false);
      submitting.current = false;
    }
  };

  if (authLoading) return <FullPageSpinner />;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Unlock your vault to continue."
      aside={{ prompt: 'New to SecureVault?', href: '/register', label: 'Create account' }}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="accountPassword" className="field-label">Account password</label>
          <PasswordInput
            id="accountPassword"
            autoComplete="current-password"
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            required
          />
        </div>

        <div className="border-t border-border pt-4">
          <label htmlFor="masterPassword" className="field-label">Master password</label>
          <PasswordInput
            id="masterPassword"
            autoComplete="off"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            required
          />
          <p className="field-hint">Decrypts your vault on this device.</p>
        </div>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              Unlocking…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </AuthShell>
  );
}
