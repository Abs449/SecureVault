// End-to-end test against the real Firebase project in .env.local.
// Creates a throwaway account, exercises the vault through src/lib/vault.ts (the same code
// the web app and extension use), checks the security rules, then deletes everything it made.
//
//   npm run test:backend

import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import * as vault from '../src/lib/vault';

declare const __FIREBASE_CONFIG__: Record<string, string>;

let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const rejects = async (fn: () => Promise<unknown>) => fn().then(() => false, () => true);

const app = initializeApp(__FIREBASE_CONFIG__);
const auth = getAuth(app);
const db = getFirestore(app);

const email = `sv-e2e-${Date.now()}@example.com`;
const accountPassword = 'Acct-pass-123';
const master = 'Master-Pass-2026!';

async function run() {
  const uid = (await createUserWithEmailAndPassword(auth, email, accountPassword)).user.uid;
  check(Boolean(uid), 'create account');

  try {
    await vault.initializeVault(db, uid, master);
    check(true, 'store crypto config (salt + verifier)');

    let session = await vault.unlockVault(db, uid, master);
    check(session.entries.length === 0, 'unlock new vault');
    check(
      await rejects(() => vault.unlockVault(db, uid, 'Wrong-Pass-999!')),
      'wrong master password is rejected'
    );

    const entry = await vault.addEntry(db, uid, session.key, {
      title: 'GitHub',
      username: 'octo',
      password: 's3cret!',
      url: 'https://github.com',
      notes: 'note',
      tags: ['work'],
    });
    check(Boolean(entry.id), 'add entry');
    await vault.updateEntry(db, uid, session.key, entry.id, { ...entry, password: 'changed!' });
    check(true, 'update entry');

    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, accountPassword);
    session = await vault.unlockVault(db, uid, master, { extractableKey: true });
    check(session.entries[0]?.password === 'changed!', 'entry decrypts after signing in again');

    const stored = JSON.stringify((await getDocs(collection(db, 'users', uid, 'passwords'))).docs[0].data());
    check(!stored.includes('changed!') && !stored.includes('octo'), 'Firestore only holds ciphertext');

    // Security rules
    check(
      await rejects(() => updateDoc(doc(db, 'users', uid, 'config', 'crypto'), { salt: 'AAAAAAAAAAAAAAAAAAAAAA==' })),
      'rules: salt cannot be overwritten'
    );
    check(
      await rejects(() => setDoc(doc(db, 'users', uid, 'passwords', 'bad'), { password: 'plaintext' })),
      'rules: malformed entry is rejected'
    );
    check(
      await rejects(() => getDocs(collection(db, 'users', 'someone-else', 'passwords'))),
      "rules: another user's vault is unreadable"
    );

    await vault.deleteEntry(db, uid, entry.id);
    check((await vault.loadEntries(db, uid, session.key)).entries.length === 0, 'delete entry');
  } finally {
    for (const d of (await getDocs(collection(db, 'users', uid, 'passwords'))).docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, 'users', uid, 'config', 'crypto'));
    if (auth.currentUser) await deleteUser(auth.currentUser);
    console.log('cleanup: test account and data deleted');
  }
}

run()
  .catch((err) => {
    failures++;
    console.error('FAIL  unexpected error:', err?.code ?? '', err?.message ?? err);
  })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
  });
