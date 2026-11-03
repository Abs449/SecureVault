import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { initializeVault } from './vault';
import { friendlyAuthError } from './errors';

function requireFirebase() {
  if (!auth || !db) {
    throw new Error('Firebase is not configured. Check the NEXT_PUBLIC_FIREBASE_* variables in .env.local.');
  }
  return { auth, db };
}

/**
 * Create an account and initialize its encrypted vault.
 * The master password never leaves the device; only a salt and a key-check value are stored.
 */
export async function signUp(email: string, accountPassword: string, masterPassword: string): Promise<void> {
  const { auth, db } = requireFirebase();
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, accountPassword);
    await initializeVault(db, user.uid, masterPassword);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

/** Authenticate with the account password. Returns the signed-in user's uid. */
export async function signIn(email: string, accountPassword: string): Promise<string> {
  const { auth } = requireFirebase();
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, accountPassword);
    return user.uid;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function signOut(): Promise<void> {
  const { auth } = requireFirebase();
  await firebaseSignOut(auth);
}
