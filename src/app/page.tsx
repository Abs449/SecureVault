'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signIn } from '@/lib/auth';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { unlockVault } = useVault();

  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Sign in and get user's salt
      const salt = await signIn(email, accountPassword);

      // Unlock vault with master password
      await unlockVault(masterPassword, salt);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-in">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-3">
            <span className="gradient-text">SecureVault</span>
          </h1>
          <p className="text-text-secondary text-lg">Zero-Knowledge Password Manager</p>
        </div>

        <div className="glass p-8">
          <h2 className="text-2xl font-semibold mb-6 ml-[10px] mt-[20px]">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="accountPassword">Account Password</label>
              <input
                id="accountPassword"
                type="password"
                className="input"
                placeholder="Your account password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                required
              />
              <p className="text-xs text-text-secondary mt-1">
                Used for authentication only
              </p>
            </div>

            <div>
              <label htmlFor="masterPassword">Master Password</label>
              <input
                id="masterPassword"
                type="password"
                className="input"
                placeholder="Your master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
              />
              <p className="text-xs text-text-secondary mt-1">
                Used to decrypt your passwords
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-text-secondary">
              Don't have an account?{' '}
              <Link href="/register" className="text-accent-primary hover:text-accent-secondary">
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 glass text-center text-xs text-text-secondary">
          <p className="mb-2">🔒 Client-Side Encryption • Zero-Knowledge Architecture</p>
          <p>Your master password never leaves your device</p>
        </div>
      </div>
    </main>
  );
}
