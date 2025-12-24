# SecureVault - Zero-Knowledge Password Manager

A secure password manager built with Next.js, TypeScript, and Firebase, featuring client-side AES-256-CBC encryption and a zero-knowledge architecture.

## 🔒 Security Features

- **Client-Side Encryption**: All encryption/decryption happens in the browser using Web Crypto API
- **AES-256-CBC**: Industry-standard encryption algorithm
- **PBKDF2 Key Derivation**: 100,000 iterations with SHA-256
- **Zero-Knowledge Architecture**: Your master password never leaves your device
- **Auto-Lock**: Vault automatically locks after 15 minutes of inactivity
- **No Password Recovery**: By design - if you forget your master password, data is permanently lost

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Firebase project with Authentication and Firestore enabled

### Setup Instructions

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Firebase**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or use an existing one
   - Enable **Authentication** → **Email/Password** sign-in method
   - Enable **Firestore Database** in production mode
   - Copy your project configuration

3. **Set up environment variables**:
   - Copy `env.example` to `.env.local`:
     ```bash
     cp env.example .env.local
     ```
   - Fill in your Firebase credentials in `.env.local`:
     ```
     NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
     ```

4. **Deploy Firestore security rules**:
   - Go to Firebase Console → Firestore Database → Rules
   - Copy the rules from `firestore.rules` and publish them

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open your browser**:
   - Navigate to [http://localhost:3000](http://localhost:3000)
   - Create an account and start using your password manager!

## 📁 Project Structure

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx           # Login page
│   ├── register/          # Registration page
│   └── dashboard/         # Main vault dashboard
├── components/            # React components
│   ├── AddPasswordModal.tsx
│   ├── LockScreen.tsx
│   ├── PasswordCard.tsx
│   └── PasswordGenerator.tsx
├── context/               # React contexts
│   ├── AuthContext.tsx   # Firebase auth state
│   └── VaultContext.tsx  # Vault management & encryption
└── lib/                   # Core libraries
    ├── crypto.ts         # Encryption utilities
    ├── firebase.ts       # Firebase configuration
    ├── auth.ts           # Authentication service
    ├── vault.ts          # Firestore operations
    └── types.ts          # TypeScript definitions
```

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

## 📝 Firestore Data Structure

```
users/{userId}/
  ├── config/
  │   └── crypto/
  │       └── salt: string (base64)
  └── passwords/{passwordId}/
      ├── encryptedData: string (encrypted JSON)
      ├── iv: string (initialization vector)
      ├── tags: string[]
      ├── createdAt: timestamp
      └── updatedAt: timestamp
```

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

## 📄 License

This project is provided as-is for educational and personal use.

## 🤝 Contributing

Contributions welcome! Please ensure all security features are maintained.

---

**Built with ❤️ and 🔒 for privacy-conscious users**
