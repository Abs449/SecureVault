'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signUp } from '@/lib/auth';
import { validateMasterPassword, calculatePasswordStrength } from '@/lib/crypto';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  // Calculate password strength
  useEffect(() => {
    if (masterPassword) {
      setPasswordStrength(calculatePasswordStrength(masterPassword));
    } else {
      setPasswordStrength(0);
    }
  }, [masterPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate master password
    const validation = validateMasterPassword(masterPassword);
    if (!validation.valid) {
      setError(validation.error || 'Invalid master password');
      return;
    }

    // Check if master passwords match
    if (masterPassword !== confirmMasterPassword) {
      setError('Master passwords do not match');
      return;
    }

    // Show warning if not acknowledged
    if (!showWarning) {
      setShowWarning(true);
      return;
    }

    setLoading(true);

    try {
      await signUp(email, accountPassword, masterPassword);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
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

  const getStrengthLabel = () => {
    if (passwordStrength < 40) return { text: 'Weak', class: 'strength-weak' };
    if (passwordStrength < 70) return { text: 'Medium', class: 'strength-medium' };
    return { text: 'Strong', class: 'strength-strong' };
  };

  const strength = getStrengthLabel();

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-in">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-3">
            <span className="gradient-text">SecureVault</span>
          </h1>
          <p className="text-text-secondary text-lg">Create Your Account</p>
        </div>

        <div className="glass p-8">
          <h2 className="text-2xl font-semibold mb-6">Sign Up</h2>

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
                placeholder="Choose an account password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-text-secondary mt-1">
                For authentication only (min 6 characters)
              </p>
            </div>

            <div>
              <label htmlFor="masterPassword">Master Password</label>
              <input
                id="masterPassword"
                type="password"
                className="input"
                placeholder="Choose a strong master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
              />
              {masterPassword && (
                <div className="mt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-text-secondary">Strength:</span>
                    <span className={`text-xs font-medium ${
                      strength.class === 'strength-weak' ? 'text-red-400' :
                      strength.class === 'strength-medium' ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {strength.text}
                    </span>
                  </div>
                  <div className="strength-bar-container h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`strength-bar ${strength.class}`} />
                  </div>
                </div>
              )}
              <p className="text-xs text-text-secondary mt-2">
                Min 12 characters, with uppercase, lowercase, numbers, and symbols
              </p>
            </div>

            <div>
              <label htmlFor="confirmMasterPassword">Confirm Master Password</label>
              <input
                id="confirmMasterPassword"
                type="password"
                className="input"
                placeholder="Re-enter master password"
                value={confirmMasterPassword}
                onChange={(e) => setConfirmMasterPassword(e.target.value)}
                required
              />
            </div>

            {showWarning && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <h3 className="text-amber-400 font-semibold mb-2">⚠️ Important Warning</h3>
                <p className="text-sm text-text-secondary mb-3">
                  Your master password cannot be recovered if forgotten. All your data will be
                  permanently lost. Make sure you remember it or store it securely.
                </p>
                <label className="flex items-center text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    required
                  />
                  <span>I understand and accept this risk</span>
                </label>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" />
                  Creating Account...
                </>
              ) : showWarning ? (
                'Create Account'
              ) : (
                'Continue'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-text-secondary">
              Already have an account?{' '}
              <Link href="/" className="text-accent-primary hover:text-accent-secondary">
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 glass text-center text-xs text-text-secondary">
          <p className="mb-2">🔒 Zero-Knowledge Architecture</p>
          <p>Your data is encrypted locally before being stored</p>
        </div>
      </div>
    </main>
  );
}
