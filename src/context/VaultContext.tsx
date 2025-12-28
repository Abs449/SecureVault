'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { deriveKey, encrypt, decrypt, base64ToSalt } from '@/lib/crypto';
import * as vaultApi from '@/lib/vault';
import { DecryptedPasswordEntry, PasswordEntry } from '@/lib/types';

interface VaultContextType {
  isUnlocked: boolean;
  entries: DecryptedPasswordEntry[];
  loading: boolean;
  error: string | null;
  unlockVault: (masterPassword: string, salt: string) => Promise<void>;
  lockVault: () => void;
  addEntry: (entry: Omit<DecryptedPasswordEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEntry: (id: string, updates: Partial<DecryptedPasswordEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<DecryptedPasswordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  // Auto-lock mechanism
  const lockVault = useCallback(() => {
    setIsUnlocked(false);
    setEncryptionKey(null);
    setEntries([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;

    const checkTimeout = setInterval(() => {
      if (Date.now() - lastActivity > AUTO_LOCK_TIMEOUT) {
        lockVault();
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkTimeout);
  }, [isUnlocked, lastActivity, lockVault]);

  // Update last activity on user interaction
  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const unlockVault = async (masterPassword: string, salt: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!user) throw new Error('User not authenticated');

      // 1. Derive the key from master password and salt
      const saltBuffer = base64ToSalt(salt);
      const key = await deriveKey(masterPassword, saltBuffer);
      setEncryptionKey(key);

      // 2. Fetch encrypted entries from Firestore
      const encryptedEntries = await vaultApi.getPasswordEntries(user.uid);

      // 3. Decrypt entries
      const decryptedEntries = await Promise.all(
        encryptedEntries.map(async (entry) => {
          const decryptedData = await decrypt(entry.encryptedData, entry.iv, key);
          const parsedData = JSON.parse(decryptedData);
          return {
            ...parsedData,
            id: entry.id,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          } as DecryptedPasswordEntry;
        })
      );

      setEntries(decryptedEntries);
      setIsUnlocked(true);
    } catch (err: any) {
      console.error('Vault unlock error:', err);
      setError('Invalid master password or decryption failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async (entry: Omit<DecryptedPasswordEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!isUnlocked || !encryptionKey || !user) throw new Error('Vault is locked');

    try {
      setLoading(true);
      const serializedData = JSON.stringify(entry);
      const { data: encryptedData, iv } = await encrypt(serializedData, encryptionKey);
      
      const newEntryId = await vaultApi.addPasswordEntry(user.uid, {
        encryptedData,
        iv,
        tags: entry.tags || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const fullEntry: DecryptedPasswordEntry = {
        ...entry,
        id: newEntryId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setEntries((prev) => [fullEntry, ...prev]);
    } catch (err) {
      console.error('Add entry error:', err);
      setError('Failed to add password entry');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateEntry = async (id: string, updates: Partial<DecryptedPasswordEntry>) => {
    if (!isUnlocked || !encryptionKey || !user) throw new Error('Vault is locked');

    try {
      setLoading(true);
      const existingEntry = entries.find((e) => e.id === id);
      if (!existingEntry) throw new Error('Entry not found');

      const updatedFullEntry = { ...existingEntry, ...updates };
      const serializedData = JSON.stringify({
        title: updatedFullEntry.title,
        username: updatedFullEntry.username,
        password: updatedFullEntry.password,
        url: updatedFullEntry.url,
        notes: updatedFullEntry.notes
      });
      const { data: encryptedData, iv } = await encrypt(serializedData, encryptionKey);

      await vaultApi.updatePasswordEntry(user.uid, id, {
        encryptedData,
        iv,
        tags: updatedFullEntry.tags || [],
        updatedAt: Date.now(),
      });

      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...updatedFullEntry, updatedAt: Date.now() } : e))
      );
    } catch (err) {
      console.error('Update entry error:', err);
      setError('Failed to update password entry');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!isUnlocked || !user) throw new Error('Vault is locked');

    try {
      setLoading(true);
      await vaultApi.deletePasswordEntry(user.uid, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Delete entry error:', err);
      setError('Failed to delete password entry');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <VaultContext.Provider
      value={{
        isUnlocked,
        entries,
        loading,
        error,
        unlockVault,
        lockVault,
        addEntry,
        updateEntry,
        deleteEntry,
      }}
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
