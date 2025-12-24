'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signIn } from '@/lib/auth';

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
      if (!user?.email) {
        throw new Error('No user found');
      }

      // Get salt (we need to sign in again to get the salt)
      // In a production app, you might cache the salt
      const salt = await signIn(user.email, ''); // This will fail but we catch it
    } catch (err: any) {
      // For unlocking, we actually need to retrieve the salt differently
      // Let's implement a simpler approach using localStorage temporarily
      
      try {
        // Get the user's salt from Firestore directly
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        if (!user) throw new Error('Not authenticated');
        
        const configDoc = await getDoc(doc(db, 'users', user.uid, 'config', 'crypto'));
        if (!configDoc.exists()) {
          throw new Error('Configuration not found');
        }
        
        const config = configDoc.data();
        await unlockVault(masterPassword, config.salt);
      } catch (unlockError: any) {
        setError(unlockError.message || 'Invalid master password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-in">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-3xl font-bold mb-2">Vault Locked</h1>
          <p className="text-text-secondary">
            Enter your master password to unlock
          </p>
        </div>

        <div className="glass p-8">
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label htmlFor="masterPassword">Master Password</label>
              <input
                id="masterPassword"
                type="password"
                className="input"
                placeholder="Enter your master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
                autoFocus
              />
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
                  Unlocking...
                </>
              ) : (
                '🔓 Unlock Vault'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-text-secondary">
              Auto-locked after 15 minutes of inactivity
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
