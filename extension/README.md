# SecureVault Chrome Extension

A Chrome extension companion for the SecureVault Zero-Knowledge Password Manager. Automatically detects and saves passwords with client-side AES-256-CBC encryption.

## 🔒 Features

- **Auto-Detect Passwords**: Automatically detects password entries on any website
- **Save Prompt Popup**: Shows a beautiful popup to save credentials when a password is entered
- **Zero-Knowledge Security**: All encryption happens client-side - your master password never leaves your device
- **AES-256-CBC Encryption**: Industry-standard encryption for your sensitive data
- **PBKDF2 Key Derivation**: 100,000 iterations with SHA-256
- **Auto-Lock**: Vault automatically locks after inactivity
- **Context Menu**: Right-click to generate secure passwords

## 🚀 Installation

### From Source (Developer Mode)

1. Configure Firebase credentials:
   - Open `popup.js`
   - Replace the `firebaseConfig` object with your Firebase project credentials:
     ```javascript
     const firebaseConfig = {
       apiKey: "YOUR_FIREBASE_API_KEY",
       authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT_ID.appspot.com",
       messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
       appId: "YOUR_APP_ID"
     };
     ```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked"
   - Select the `crimson-skylab` folder
   - The extension should now appear in your extensions list

3. Add your extension ID to Firebase:
   - After loading, note the extension ID shown in `chrome://extensions/`
   - Go to Firebase Console → Authentication → Settings → Authorized domains
   - Add `chrome-extension://YOUR_EXTENSION_ID`

## 📁 Project Structure

```
crimson-skylab/
├── manifest.json          # Chrome extension manifest
├── popup.html             # Extension popup UI
├── popup.css              # Popup styles (glassmorphism design)
├── popup.js               # Popup logic & Firebase integration
├── content.js             # Content script for password detection
├── content.css            # Styles for save popup on websites
├── background.js          # Service worker for background tasks
├── icons/
│   ├── icon16.png         # 16x16 icon
│   ├── icon48.png         # 48x48 icon
│   └── icon128.png        # 128x128 icon
└── lib/
    ├── firebase-app.js    # Firebase App SDK
    ├── firebase-auth.js   # Firebase Auth SDK
    └── firebase-firestore.js # Firebase Firestore SDK
```

## 🔧 How It Works

### Password Detection
1. Content script monitors all password fields on websites
2. When a form is submitted or password field loses focus, credentials are captured
3. A popup appears asking if you want to save the credentials

### Encryption Flow
1. Sign in with your account password (Firebase Auth)
2. Enter your master password (never sent to server)
3. Master password + salt → PBKDF2 (100K iterations) → Encryption key
4. Passwords are encrypted with AES-256-CBC before storage

### Storage
- Encrypted data is stored in Firebase Firestore
- Only you can decrypt your passwords with your master password
- The extension uses the same database as the main SecureVault website

## 🎨 Design

The extension features a premium dark glassmorphism design:
- Deep navy/purple gradients
- Blur effects and subtle shadows
- Smooth animations
- Consistent with the main SecureVault website

## ⚠️ Security Notes

1. **Master Password**: Never stored, only used in memory for encryption
2. **Two-Password System**: Account password (Firebase Auth) + Master password (encryption)
3. **Auto-Lock**: Vault locks after 15 minutes of inactivity (configurable)
4. **No Recovery**: If you forget your master password, data cannot be recovered

## 🔗 Related

- Main SecureVault Website: Located in `../SecureVault/`
- Firebase Console: https://console.firebase.google.com/

## 📄 License

MIT License - See main project repository for details.
