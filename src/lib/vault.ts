// Vault data operations - all data stored is encrypted

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { PasswordEntry } from './types';

/**
 * Get all password entries for a user
 * @param userId - User's Firebase UID
 * @returns Array of encrypted password entries
 */
export async function getPasswordEntries(userId: string): Promise<PasswordEntry[]> {
  try {
    const entriesRef = collection(db, 'users', userId, 'passwords');
    const snapshot = await getDocs(entriesRef);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        encryptedData: data.encryptedData,
        iv: data.iv,
        tags: data.tags || [],
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
      };
    });
  } catch (error) {
    console.error('Error fetching password entries:', error);
    throw new Error('Failed to fetch password entries');
  }
}

/**
 * Add a new password entry
 * @param userId - User's Firebase UID
 * @param entry - Encrypted password entry (without id)
 */
export async function addPasswordEntry(
  userId: string,
  entry: Omit<PasswordEntry, 'id'>
): Promise<string> {
  try {
    const entriesRef = collection(db, 'users', userId, 'passwords');
    const docRef = await addDoc(entriesRef, {
      encryptedData: entry.encryptedData,
      iv: entry.iv,
      tags: entry.tags,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding password entry:', error);
    throw new Error('Failed to add password entry');
  }
}

/**
 * Update an existing password entry
 * @param userId - User's Firebase UID
 * @param entryId - Entry document ID
 * @param entry - Updated encrypted data
 */
export async function updatePasswordEntry(
  userId: string,
  entryId: string,
  entry: Omit<PasswordEntry, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const entryRef = doc(db, 'users', userId, 'passwords', entryId);
    await updateDoc(entryRef, {
      encryptedData: entry.encryptedData,
      iv: entry.iv,
      tags: entry.tags,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating password entry:', error);
    throw new Error('Failed to update password entry');
  }
}

/**
 * Delete a password entry
 * @param userId - User's Firebase UID
 * @param entryId - Entry document ID
 */
export async function deletePasswordEntry(userId: string, entryId: string): Promise<void> {
  try {
    const entryRef = doc(db, 'users', userId, 'passwords', entryId);
    await deleteDoc(entryRef);
  } catch (error) {
    console.error('Error deleting password entry:', error);
    throw new Error('Failed to delete password entry');
  }
}
