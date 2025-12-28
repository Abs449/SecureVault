import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { generateSalt, saltToBase64 } from './crypto';
import { CryptoConfig } from './types';

/**
 * Sign up a new user with email, account password, and master password.
 * @param email - User's email
 * @param accountPassword - Password for Firebase Auth
 * @param masterPassword - Password for client-side encryption (not sent to Firebase Auth)
 */
export async function signUp(email: string, accountPassword: string, masterPassword: string): Promise<void> {
  try {
    // 1. Create user in Firebase Auth using the account password
    const userCredential = await createUserWithEmailAndPassword(auth, email, accountPassword);
    const userId = userCredential.user.uid;

    // 2. Generate a random salt for this user
    const saltBuffer = generateSalt();
    const salt = saltToBase64(saltBuffer);

    // 3. Store the salt and crypto configuration in Firestore
    // This salt is needed to derive the same key from the master password later.
    const config: CryptoConfig = {
      salt
    };

    await setDoc(doc(db, 'users', userId, 'config', 'crypto'), config);

    // Create base collection for passwords
    // Firestore creates collections implicitly when the first document is added.
  } catch (error: any) {
    console.error('Sign up error:', error);
    throw new Error(error.message || 'Failed to sign up');
  }
}

/**
 * Sign in an existing user and retrieve their salt.
 * @param email - User's email
 * @param accountPassword - Password for Firebase Auth
 * @returns The user's unique salt for key derivation
 */
export async function signIn(email: string, accountPassword: string): Promise<string> {
  try {
    // 1. Sign in with Firebase Auth using the account password
    const userCredential = await signInWithEmailAndPassword(auth, email, accountPassword);
    const userId = userCredential.user.uid;

    // 2. Retrieve the user's salt from Firestore
    const configDoc = await getDoc(doc(db, 'users', userId, 'config', 'crypto'));

    if (!configDoc.exists()) {
      throw new Error('User configuration not found. Potential data corruption.');
    }

    const config = configDoc.data() as CryptoConfig;
    return config.salt;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw new Error(error.message || 'Failed to sign out');
  }
}
