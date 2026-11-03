'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { auth, db } from '@/lib/firebase';
import * as vault from '@/lib/vault';
import { DecryptedPasswordEntry } from '@/lib/types';

type EntryInput = vault.EntryInput;

interface VaultContextType {
  isUnlocked: boolean;
  entries: DecryptedPasswordEntry[];
  /** Entries that exist but could not be decrypted with this key. */
  unreadable: number;
  loading: boolean;
  unlockVault: (masterPassword: string) => Promise<void>;
  lockVault: () => void;
  addEntry: (entry: EntryInput) => Promise<void>;
  updateEntry: (id: string, entry: EntryInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

const AUTO_LOCK_MS = 15 * 60 * 1000;

function requireSession(key: CryptoKey | null) {
  const uid = auth?.currentUser?.uid;
  if (!db || !uid || !key) throw new Error('Your vault is locked.');
  return { db, uid, key };
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<DecryptedPasswordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadable, setUnreadable] = useState(0);
  const lastActivity = useRef(0);
  const unlockedFor = useRef<string | null>(null);

  const isUnlocked = encryptionKey !== null;

  const lockVault = useCallback(() => {
    setEncryptionKey(null);
    setEntries([]);
    setUnreadable(0);
    unlockedFor.current = null;
  }, []);

  // Lock whenever the signed-in account changes (including sign-out).
  useEffect(() => {
    if (unlockedFor.current && unlockedFor.current !== user?.uid) lockVault();
  }, [user, lockVault]);

  // Auto-lock after inactivity. Activity is tracked in a ref so mouse movement doesn't re-render.
  useEffect(() => {
    if (!isUnlocked) return;
    const touch = () => (lastActivity.current = Date.now());
    touch();
    const events = ['pointerdown', 'keydown', 'mousemove', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > AUTO_LOCK_MS) lockVault();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, [isUnlocked, lockVault]);

  const unlockVault = async (masterPassword: string) => {
    // Read the user from Firebase directly: right after sign-in, React state may not have caught up.
    const uid = auth?.currentUser?.uid;
    if (!db || !uid) throw new Error('You are not signed in.');
    setLoading(true);
    try {
      const result = await vault.unlockVault(db, uid, masterPassword);
      setEntries(result.entries);
      setUnreadable(result.unreadable);
      setEncryptionKey(result.key);
      unlockedFor.current = uid;
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async (input: EntryInput) => {
    const s = requireSession(encryptionKey);
    const created = await vault.addEntry(s.db, s.uid, s.key, input);
    setEntries((prev) => [created, ...prev]);
  };

  const updateEntry = async (id: string, input: EntryInput) => {
    const s = requireSession(encryptionKey);
    await vault.updateEntry(s.db, s.uid, s.key, id, input);
    setEntries((prev) =>
      [...prev.map((e) => (e.id === id ? { ...e, ...input, updatedAt: Date.now() } : e))].sort(
        (a, b) => b.updatedAt - a.updatedAt
      )
    );
  };

  const deleteEntry = async (id: string) => {
    const s = requireSession(encryptionKey);
    await vault.deleteEntry(s.db, s.uid, id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <VaultContext.Provider
      value={{ isUnlocked, entries, unreadable, loading, unlockVault, lockVault, addEntry, updateEntry, deleteEntry }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
