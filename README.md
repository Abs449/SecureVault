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

The Chrome extension and Next.js app rely on a Firebase configuration that must
never be committed to the repository. A small build‑time script generates the
needed `extension/config.js` from environment variables.

1. Copy `env.example` to `.env.local` and fill in your own Firebase project
   values. Rotate or restrict your API key in the Firebase console if it was
   previously leaked.
2. Ensure `dotenv` is installed (`npm install` will pull it in since it's a
   dev dependency). It’s used by `scripts/generate-extension-config.js`.
3. Run `npm run build`; the `prebuild` step invokes the script and writes
   `extension/config.js` from your `.env.local` file. The file is gitignored.
4. Do not commit `.env.local` or `extension/config.js` – they contain secrets.

> After rebuilding, the extension loads `window.firebaseConfig` from the
> generated file. Any exposed key becomes harmless if rotated/restricted.

## 🎨 Features

- ✅ Secure password storage with client-side encryption
- ✅ Password generator with customizable options
- ✅ Search and filter passwords
- ✅ Tags for organization
- ✅ Copy to clipboard
- ✅ Show/hide password toggle
- ✅ Auto-lock after inactivity
- ✅ Password strength indicator
- ✅ Responsive design with glassmorphism UI

## 🧪 Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Custom CSS with Tailwind
- **Authentication**: Firebase Auth
- **Database**: Cloud Firestore
- **Encryption**: Web Crypto API (AES-256-CBC, PBKDF2)

## ⚠️ Important Warnings

1. **Backup Your Master Password**: Store it in a secure location. If lost, all data is unrecoverable.
2. **Production Deployment**: Use HTTPS and configure proper Firebase security rules.
3. **Regular Backups**: Consider exporting your passwords periodically.
4. **Browser Compatibility**: Requires modern browsers that support Web Crypto API.

