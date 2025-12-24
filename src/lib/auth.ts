// Authentication service layer

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { generateSalt, saltToBase64 } from './crypto';
import { CryptoConfig } from './types';

/**
 * Sign up a new user
 * @param email - User's email for Firebase Auth
 * @param accountPassword - Password for Firebase Auth (NOT the master password)
 * @param masterPassword - Master password for encryption (stored as salt only)
 */
export async function signUp(
  email: string,
  accountPassword: string,
  masterPassword: string
): Promise<void> {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, accountPassword);
    const userId = userCredential.user.uid;

    // Generate and store salt for this user
    const salt = generateSalt();
    const config: CryptoConfig = {
      salt: saltToBase64(salt),
    };

    // Store salt in Firestore (used for key derivation)
    await setDoc(doc(db, 'users', userId, 'config', 'crypto'), config);

    console.log('User registered successfully');
  } catch (error: any) {
    console.error('Sign up error:', error);
    throw new Error(error.message || 'Failed to sign up');
  }
}

/**
 * Sign in an existing user
 * @param email - User's email
 * @param accountPassword - Password for Firebase Auth
 * @returns The user's salt (for deriving encryption key)
 */
export async function signIn(email: string, accountPassword: string): Promise<string> {
  try {
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, accountPassword);
    const userId = userCredential.user.uid;

    // Retrieve the user's salt
    const configDoc = await getDoc(doc(db, 'users', userId, 'config', 'crypto'));

    if (!configDoc.exists()) {
      throw new Error('User configuration not found');
    }

    const config = configDoc.data() as CryptoConfig;
    return config.salt;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw new Error('Failed to sign out');
  }
}

/**
 * Get current authenticated user
 */
export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}
