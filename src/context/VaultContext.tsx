'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { deriveKey, encrypt, decrypt, base64ToSalt } from '@/lib/crypto';
import {
  getPasswordEntries,
  addPasswordEntry,
  updatePasswordEntry as updatePasswordEntryInDB,
  deletePasswordEntry as deletePasswordEntryFromDB,
} from '@/lib/vault';
import { PasswordEntry, DecryptedPasswordEntry, PasswordData } from '@/lib/types';

interface VaultContextType {
  isUnlocked: boolean;
  entries: DecryptedPasswordEntry[];
  loading: boolean;
  unlockVault: (masterPassword: string, salt: string) => Promise<void>;
  lockVault: () => void;
  addEntry: (data: PasswordData, tags: string[]) => Promise<void>;
  updateEntry: (id: string, data: PasswordData, tags: string[]) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  refreshEntries: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function VaultProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [entries, setEntries] = useState<DecryptedPasswordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  
  const autoLockTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset auto-lock timer on activity
  const resetAutoLockTimer = useCallback(() => {
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
    }

    autoLockTimerRef.current = setTimeout(() => {
      lockVault();
    }, AUTO_LOCK_TIMEOUT);
  }, []);

  // Unlock vault with master password
  const unlockVault = useCallback(
    async (masterPassword: string, salt: string) => {
      setLoading(true);
      try {
        // Derive encryption key from master password
        const saltArray = base64ToSalt(salt);
        const key = await deriveKey(masterPassword, saltArray);
        setEncryptionKey(key);

        // Fetch and decrypt all entries
        if (user) {
          const encryptedEntries = await getPasswordEntries(user.uid);
          const decrypted = await Promise.all(
            encryptedEntries.map(async (entry) => {
              try {
                const decryptedData = await decrypt(entry.encryptedData, entry.iv, key);
                const data: PasswordData = JSON.parse(decryptedData);
                return {
                  id: entry.id,
                  ...data,
                  tags: entry.tags,
                  createdAt: entry.createdAt,
                  updatedAt: entry.updatedAt,
                };
              } catch (error) {
                console.error('Failed to decrypt entry:', entry.id, error);
                // Return a placeholder for failed decryption
                return {
                  id: entry.id,
                  title: '[Decryption Failed]',
                  username: '',
                  password: '',
                  url: '',
                  notes: '',
                  tags: entry.tags,
                  createdAt: entry.createdAt,
                  updatedAt: entry.updatedAt,
                };
              }
            })
          );

          setEntries(decrypted);
          setIsUnlocked(true);
          resetAutoLockTimer();
        }
      } catch (error) {
        console.error('Failed to unlock vault:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [user, resetAutoLockTimer]
  );

  // Lock vault
  const lockVault = useCallback(() => {
    setEncryptionKey(null);
    setEntries([]);
    setIsUnlocked(false);
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
    }
  }, []);

  // Add new entry
  const addEntry = useCallback(
    async (data: PasswordData, tags: string[]) => {
      if (!encryptionKey || !user) throw new Error('Vault is locked');

      resetAutoLockTimer();
      setLoading(true);

      try {
        // Encrypt the data
        const dataJson = JSON.stringify(data);
        const { data: encryptedData, iv } = await encrypt(dataJson, encryptionKey);

        // Store in Firestore
        const entryId = await addPasswordEntry(user.uid, {
          encryptedData,
          iv,
          tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Add to local state
        const newEntry: DecryptedPasswordEntry = {
          id: entryId,
          ...data,
          tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        setEntries((prev) => [...prev, newEntry]);
      } catch (error) {
        console.error('Failed to add entry:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [encryptionKey, user, resetAutoLockTimer]
  );

  // Update entry
  const updateEntry = useCallback(
    async (id: string, data: PasswordData, tags: string[]) => {
      if (!encryptionKey || !user) throw new Error('Vault is locked');

      resetAutoLockTimer();
      setLoading(true);

      try {
        // Encrypt the updated data
        const dataJson = JSON.stringify(data);
        const { data: encryptedData, iv } = await encrypt(dataJson, encryptionKey);

        // Update in Firestore
        await updatePasswordEntryInDB(user.uid, id, {
          encryptedData,
          iv,
          tags,
          updatedAt: Date.now(),
        });

        // Update local state
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? { ...entry, ...data, tags, updatedAt: Date.now() }
              : entry
          )
        );
      } catch (error) {
        console.error('Failed to update entry:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [encryptionKey, user, resetAutoLockTimer]
  );

  // Delete entry
  const deleteEntry = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      resetAutoLockTimer();
      setLoading(true);

      try {
        await deletePasswordEntryFromDB(user.uid, id);
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
      } catch (error) {
        console.error('Failed to delete entry:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [user, resetAutoLockTimer]
  );

  // Refresh entries from Firestore
  const refreshEntries = useCallback(async () => {
    if (!encryptionKey || !user) return;

    resetAutoLockTimer();
    setLoading(true);

    try {
      const encryptedEntries = await getPasswordEntries(user.uid);
      const decrypted = await Promise.all(
        encryptedEntries.map(async (entry) => {
          try {
            const decryptedData = await decrypt(entry.encryptedData, entry.iv, encryptionKey);
            const data: PasswordData = JSON.parse(decryptedData);
            return {
              id: entry.id,
              ...data,
              tags: entry.tags,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            };
          } catch (error) {
            console.error('Failed to decrypt entry:', entry.id);
            return {
              id: entry.id,
              title: '[Decryption Failed]',
              username: '',
              password: '',
              url: '',
              notes: '',
              tags: entry.tags,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            };
          }
        })
      );

      setEntries(decrypted);
    } catch (error) {
      console.error('Failed to refresh entries:', error);
    } finally {
      setLoading(false);
    }
  }, [encryptionKey, user, resetAutoLockTimer]);

  // Lock vault when user signs out
  useEffect(() => {
    if (!user) {
      lockVault();
    }
  }, [user, lockVault]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
    };
  }, []);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked,
        entries,
        loading,
        unlockVault,
        lockVault,
        addEntry,
        updateEntry,
        deleteEntry,
        refreshEntries,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
