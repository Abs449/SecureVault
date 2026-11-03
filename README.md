# SecureVault - Zero-Knowledge Password Manager

A secure password manager built with Next.js, TypeScript, and Firebase, featuring client-side AES-256-CBC encryption and a zero-knowledge architecture.

## 🔒 Security Features

- **Client-Side Encryption**: All encryption/decryption happens in the browser using Web Crypto API
- **AES-256-CBC**: Industry-standard encryption algorithm
- **PBKDF2 Key Derivation**: 100,000 iterations with SHA-256
- **Zero-Knowledge Architecture**: Your master password never leaves your device
- **Auto-Lock**: Vault automatically locks after 15 minutes of inactivity
- **No Password Recovery**: By design - if you forget your master password, data is permanently

## 🔐 How It Works

### Two-Password System

1. **Account Password**: Used for Firebase Authentication (stored in Firebase)
2. **Master Password**: Used for encryption/decryption (NEVER sent to server)

### Encryption Flow

1. User creates account with account password (Firebase Auth)
2. A random salt is generated and stored in Firestore
3. Master password + salt → PBKDF2 (100K iterations) → Encryption key
4. Data is encrypted with AES-256-CBC before being sent to Firestore
5. Firestore only stores encrypted blobs + initialization vectors

### Decryption Flow

1. User signs in with account password (Firebase Auth)
2. Salt is retrieved from Firestore
3. User enters master password
4. Master password + salt → PBKDF2 → Encryption key (derived client-side)
5. Encrypted data is fetched and decrypted in the browser

## 🛡️ Security Considerations

- **Master Password Requirements**: Minimum 12 characters with 3+ character types
- **Auto-Lock**: Vault locks after 15 minutes of inactivity
- **No Recovery**: Zero-knowledge means no password recovery - choose wisely!
- **HTTPS Required**: Use HTTPS in production to prevent MITM attacks
- **No Data in Storage**: Encryption key stays in memory only, never in localStorage

---

### 🔧 Local Setup & Secrets

1. Create `.env.local` with your Firebase web config (`NEXT_PUBLIC_FIREBASE_API_KEY`,
   `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`).
   These values are not secrets (they ship to every browser), but keep the file out of git
   and restrict the API key in Google Cloud Console → Credentials.
2. In the Firebase console, enable **Authentication → Email/Password** and create a
   **Firestore** database.
3. `npm install`, then `npm run dev`. This also builds the extension, so the download
   on `/extension` works locally.

### 🛡️ Backend

- `npm run deploy:rules` deploys [firestore.rules](firestore.rules). Run
  `npx firebase-tools login` first. The rules restrict each user to their own data,
  validate document shapes, and stop the encryption salt from being overwritten.
- `npm run test:rules` runs the backend checks against the Firebase emulators with
  `firestore.rules` loaded. Run it before `deploy:rules`. It needs Java 11+, but no login and
  no production data.
- `npm run test:backend` runs an end-to-end check against the project in `.env.local`. It
  creates a throwaway account, exercises sign-up, unlock, add/edit/delete and the security
  rules, then deletes everything it created.

### 🧩 Chrome extension

The extension works like a full password manager on every site:

- **Fills logins.** Focus a sign-in field and pick from the logins saved for that site, or press
  `Ctrl+Shift+L` (`⌘+Shift+L` on Mac).
- **Suggests strong passwords.** Sign-up and change-password fields get a generated 20-character
  password that fills both the password and confirmation fields.
- **Saves and updates.** After you sign in or sign up, it offers to save the login, or to update it
  if the password changed.
- **Works in embedded sign-in forms.** Login forms inside iframes get the same menu, matched to the
  frame's own site, and their save prompt is shown on the main page.
- **Stays safe.** Logins are only offered on the site they belong to, and passwords are released to a
  page only when you choose to fill them. Menus and prompts sit in closed shadow roots the page
  can't read, and the vault auto-locks.

How it's built: the background service worker (`extension/src/background.ts`) is the vault engine.
It is the only part that talks to Firebase or holds the key, and it uses the same
`src/lib/vault.ts` and `src/lib/crypto.ts` as the web app (Firestore Lite in the worker). The popup,
the welcome page and the content script are clients of it.

| Command | What it does |
| --- | --- |
| `npm run build:extension` | Builds `dist/extension` (load unpacked), `dist/securevault-<version>-webstore.zip` (Chrome Web Store upload) and the download served on `/extension`. |
| `npm run dev:extension` | Rebuilds on change. Click reload on the extension card afterwards. |
| `npm run test:extension` | Installs the built extension in Chrome and tests sign-in, fill, password suggestion, save/update prompts, cross-site iframes and isolation (25 checks) against your Firebase project, using a throwaway account. |
| `npm run icons` | Regenerates icons and the store promo tile from `assets/`. |

To install locally: `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/extension`.
The `extension/` folder holds source only.

### 🏪 Publishing to the Chrome Web Store

Everything the store asks for is in [store/LISTING.md](store/LISTING.md): listing text,
permission justifications, data-use disclosures, screenshots, the promo tile and the upload zip.
The privacy policy is served by the web app at `/privacy`. Once the listing is live, set
`NEXT_PUBLIC_WEBSTORE_URL` and the `/extension` page shows **Add to Chrome**.

## 🎨 Features

- ✅ Secure password storage with client-side encryption
- ✅ Password generator with customizable options
- ✅ Search and filter passwords
- ✅ Tags for organization
- ✅ Copy to clipboard
- ✅ Show/hide password toggle
- ✅ Auto-lock after inactivity
- ✅ Password strength indicator
- ✅ Light and dark themes that follow the system setting
- ✅ Chrome extension: inline autofill, strong-password suggestions, save/update prompts, keyboard shortcut

## 🧪 Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, Lucide icons, IBM Plex
- **Authentication**: Firebase Auth
- **Database**: Cloud Firestore
- **Encryption**: Web Crypto API (AES-256-CBC, PBKDF2)

## ⚠️ Important Warnings

1. **Backup Your Master Password**: Store it in a secure location. If lost, all data is unrecoverable.
2. **Production Deployment**: Use HTTPS and configure proper Firebase security rules.
3. **Regular Backups**: Consider exporting your passwords periodically.
4. **Browser Compatibility**: Requires modern browsers that support Web Crypto API.

