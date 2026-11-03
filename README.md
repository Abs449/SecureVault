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

1. Copy `env.example` to `.env.local` and fill in your Firebase project values
   (`NEXT_PUBLIC_FIREBASE_*`). Never commit `.env.local`.
2. `npm install`
3. Web app: `npm run dev` (or `npm run build` for the static export in `out/`).

### 🧩 Chrome extension

The extension shares its vault and crypto code with the web app (`src/lib/vault.ts`,
`src/lib/crypto.ts`), so both read and write the same encrypted data.

1. `npm run build:extension` bundles everything into `dist/extension`. The Firebase
   values from `.env.local` are compiled in, so there's no separate config file.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and choose `dist/extension`.
3. While developing, `npm run dev:extension` rebuilds on change. Press the reload
   button on the extension card to pick up changes.

Create your account in the web app first, then sign in to the extension with
the same email, account password and master password.

The extension icons come from `assets/logo.svg`. Run `npm run icons` after changing the logo.

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
- ✅ Chrome extension: fill logins, save new ones, generate passwords from the context menu

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

