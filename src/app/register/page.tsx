'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signUp } from '@/lib/auth';
import { validateMasterPassword } from '@/lib/crypto';
import AuthShell from '@/components/AuthShell';
import { ErrorAlert, FullPageSpinner, PasswordInput, StrengthMeter } from '@/components/ui';
import { TriangleAlert } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { unlockVault } = useVault();

  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!authLoading && user && !submitting.current) router.replace('/dashboard');
  }, [user, authLoading, router]);

  const mismatch = confirmMasterPassword.length > 0 && confirmMasterPassword !== masterPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validateMasterPassword(masterPassword);
    if (!validation.valid) return setError(validation.error ?? 'Choose a stronger master password.');
    if (masterPassword !== confirmMasterPassword) return setError('Master passwords do not match.');
    if (masterPassword === accountPassword) {
      return setError('Use a master password that is different from your account password.');
    }
    if (!acknowledged) return setError('Confirm that you understand the master password cannot be recovered.');

    setLoading(true);
    submitting.current = true;
    try {
      await signUp(email, accountPassword, masterPassword);
      await unlockVault(masterPassword);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      submitting.current = false;
    }
  };

  if (authLoading) return <FullPageSpinner />;

  return (
    <AuthShell
      title="Create your vault"
      subtitle="You'll use two passwords: one to sign in, one to encrypt."
      aside={{ prompt: 'Already have an account?', href: '/', label: 'Sign in' }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="new-password"
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            required
            minLength={6}
          />
          <p className="field-hint">At least 6 characters. Used to sign in.</p>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <label htmlFor="masterPassword" className="field-label">Master password</label>
            <PasswordInput
              id="masterPassword"
              autoComplete="new-password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              required
            />
            {masterPassword ? (
              <StrengthMeter password={masterPassword} />
            ) : (
              <p className="field-hint">12+ characters, mixing upper and lower case, numbers and symbols.</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmMasterPassword" className="field-label">Confirm master password</label>
            <PasswordInput
              id="confirmMasterPassword"
              autoComplete="new-password"
              value={confirmMasterPassword}
              onChange={(e) => setConfirmMasterPassword(e.target.value)}
              aria-invalid={mismatch}
              required
            />
            {mismatch && <p className="field-hint text-danger">Doesn&apos;t match the master password.</p>}
          </div>
        </div>

        <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <input
            type="checkbox"
            className="checkbox mt-0.5 shrink-0"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span className="text-fg-muted">
            <span className="mb-0.5 flex items-center gap-1.5 font-medium text-fg">
              <TriangleAlert size={14} className="text-warning" aria-hidden />
              The master password can&apos;t be reset
            </span>
            We never receive it, so if you forget it your vault can&apos;t be decrypted by anyone.
          </span>
        </label>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              Creating vault…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </AuthShell>
  );
}
