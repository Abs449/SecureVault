// Vault data operations shared by the web app and the browser extension.
// Everything written to Firestore is encrypted client-side; Firestore only sees ciphertext,
// the IV, the salt, and (unencrypted) tags.
//
// Layout:
//   users/{uid}/config/crypto      -> { salt, verifier }
//   users/{uid}/passwords/{id}     -> { encryptedData, iv, tags, createdAt, updatedAt }

import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  base64ToSalt,
  checkVerifier,
  createVerifier,
  decrypt,
  deriveKey,
  encrypt,
  generateSalt,
  saltToBase64,
} from './crypto';
import { CryptoConfig, DecryptedPasswordEntry, PasswordData } from './types';

export type EntryInput = PasswordData & { tags: string[] };

export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super('Incorrect master password.');
    this.name = 'IncorrectMasterPasswordError';
  }
}

const configRef = (db: Firestore, uid: string) => doc(db, 'users', uid, 'config', 'crypto');
const entriesRef = (db: Firestore, uid: string) => collection(db, 'users', uid, 'passwords');

const toMillis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : Date.now());

/** Only the secret fields go into the ciphertext. */
function serialize(entry: EntryInput): string {
  const { title, username, password, url, notes } = entry;
  return JSON.stringify({ title, username, password, url, notes } satisfies PasswordData);
}

export async function getCryptoConfig(db: Firestore, uid: string): Promise<CryptoConfig | null> {
  const snap = await getDoc(configRef(db, uid));
  return snap.exists() ? (snap.data() as CryptoConfig) : null;
}

/** Create the crypto config for a brand-new account. */
export async function initializeVault(db: Firestore, uid: string, masterPassword: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(masterPassword, salt);
  const config: CryptoConfig = { salt: saltToBase64(salt), verifier: await createVerifier(key) };
  await setDoc(configRef(db, uid), config);
}

/**
 * Derive the vault key and decrypt every entry.
 * Throws IncorrectMasterPasswordError if the master password is wrong.
 */
export async function unlockVault(
  db: Firestore,
  uid: string,
  masterPassword: string,
  options: { extractableKey?: boolean } = {}
): Promise<{ key: CryptoKey; entries: DecryptedPasswordEntry[]; unreadable: number }> {
  const config = await getCryptoConfig(db, uid);
  if (!config?.salt) {
    throw new Error('Vault configuration not found for this account. Sign up through the SecureVault web app first.');
  }

  const key = await deriveKey(masterPassword, base64ToSalt(config.salt), options.extractableKey);

  if (config.verifier && !(await checkVerifier(config.verifier, key))) {
    throw new IncorrectMasterPasswordError();
  }

  const { entries, unreadable } = await loadEntries(db, uid, key);

  if (!config.verifier) {
    // Accounts created before verifiers existed: if nothing decrypts, the password is wrong.
    if (unreadable > 0 && entries.length === 0) throw new IncorrectMasterPasswordError();
    // Otherwise the password is proven correct (or the vault is empty): store a verifier.
    await setDoc(configRef(db, uid), { verifier: await createVerifier(key) }, { merge: true });
  }

  return { key, entries, unreadable };
}

/**
 * Decrypt all entries. Entries that fail to decrypt (e.g. written with a different key by an
 * older build of the extension) are skipped and counted rather than failing the whole vault.
 */
export async function loadEntries(
  db: Firestore,
  uid: string,
  key: CryptoKey
): Promise<{ entries: DecryptedPasswordEntry[]; unreadable: number }> {
  const snapshot = await getDocs(entriesRef(db, uid));
  const results = await Promise.all(
    snapshot.docs.map(async (d): Promise<DecryptedPasswordEntry | null> => {
      const data = d.data();
      try {
        const plain = JSON.parse(await decrypt(data.encryptedData, data.iv, key)) as Partial<PasswordData>;
        return {
          id: d.id,
          title: plain.title ?? '',
          username: plain.username ?? '',
          password: plain.password ?? '',
          url: plain.url ?? '',
          notes: plain.notes ?? '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
        };
      } catch {
        return null;
      }
    })
  );
  const entries = results.filter((e): e is DecryptedPasswordEntry => e !== null);
  if (entries.length < results.length) {
    console.warn(`SecureVault: ${results.length - entries.length} entr(ies) could not be decrypted and were skipped.`);
  }
  return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt), unreadable: results.length - entries.length };
}

export async function addEntry(
  db: Firestore,
  uid: string,
  key: CryptoKey,
  input: EntryInput
): Promise<DecryptedPasswordEntry> {
  const { data, iv } = await encrypt(serialize(input), key);
  const ref = await addDoc(entriesRef(db, uid), {
    encryptedData: data,
    iv,
    tags: input.tags,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const now = Date.now();
  return { ...input, id: ref.id, createdAt: now, updatedAt: now };
}

export async function updateEntry(
  db: Firestore,
  uid: string,
  key: CryptoKey,
  id: string,
  input: EntryInput
): Promise<void> {
  const { data, iv } = await encrypt(serialize(input), key);
  await updateDoc(doc(entriesRef(db, uid), id), {
    encryptedData: data,
    iv,
    tags: input.tags,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEntry(db: Firestore, uid: string, id: string): Promise<void> {
  await deleteDoc(doc(entriesRef(db, uid), id));
}
