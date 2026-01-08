// SecureVault Chrome Extension - Popup Script
// Handles authentication, vault management, and password CRUD operations

// Firebase configuration - Using CDN approach for extension compatibility
// Firebase configuration - PLEASE REPLACE WITH YOUR ACTUAL CREDENTIALS
// You can find these in your Firebase Console -> Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyDwuleRG0MI7EETi5j0rgBjsNxrItKUjUA",
  authDomain: "passwordmanager-42b9a.firebaseapp.com",
  projectId: "passwordmanager-42b9a",
  storageBucket: "passwordmanager-42b9a.firebasestorage.app",
  messagingSenderId: "928283070192",
  appId: "1:928283070192:web:3948dbd69d0dabe229fc35",
  measurementId: "G-F06Z49WW1Z"

};

// ==================== CRYPTO MODULE ====================
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;

function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

async function deriveKey(masterPassword, salt) {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

// 1. UPDATE: Make key extractable (true) so we can store it in session
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-CBC', length: 256 },
    true, // Changed to TRUE to allow exporting
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    data: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

async function decrypt(encryptedData, ivBase64, key) {
  try {
    const encryptedBuffer = base64ToArrayBuffer(encryptedData);
    const iv = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encryptedBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    throw new Error('Decryption failed. Invalid master password or corrupted data.');
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function saltToBase64(salt) {
  return arrayBufferToBase64(salt.buffer);
}

function base64ToSalt(base64) {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

function generatePassword(options) {
  const { length, includeUppercase, includeLowercase, includeNumbers, includeSymbols } = options;

  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let charset = '';
  if (includeUppercase) charset += uppercase;
  if (includeLowercase) charset += lowercase;
  if (includeNumbers) charset += numbers;
  if (includeSymbols) charset += symbols;

  if (charset.length === 0) {
    charset = lowercase + numbers;
  }

  const password = Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map((x) => charset[x % charset.length])
    .join('');

  return password;
}

function calculatePasswordStrength(password) {
  let strength = 0;
  strength += Math.min(password.length * 2, 30);
  if (/[a-z]/.test(password)) strength += 15;
  if (/[A-Z]/.test(password)) strength += 15;
  if (/[0-9]/.test(password)) strength += 15;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 25;
  return Math.min(strength, 100);
}

// ==================== STATE MANAGEMENT ====================
let state = {
  isAuthenticated: false,
  user: null,
  encryptionKey: null,
  salt: null,
  passwords: [],
  settings: {
    autoSave: true,
    autoLockMinutes: 15
  }
};

// Firebase instances
let auth = null;
let db = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  await initializeFirebase();
  await loadSettings();
  await checkAuthState();
  setupEventListeners();
});

async function initializeFirebase() {
  // Wait for Firebase scripts to load
  const checkFirebase = () => {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (typeof firebase !== 'undefined') {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  };

  await checkFirebase();
  
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  
  auth = firebase.auth();
  db = firebase.firestore();
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  if (result.settings) {
    state.settings = { ...state.settings, ...result.settings };
  }
  
  // Apply settings to UI
  document.getElementById('autoSaveToggle').checked = state.settings.autoSave;
  document.getElementById('autoLockSelect').value = state.settings.autoLockMinutes.toString();
}

async function checkAuthState() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      state.user = user;
      
      // Check if we have cached encryption key
      const cached = await chrome.storage.session.get(['encryptionKeyJWK', 'salt']);
      if (cached.encryptionKeyJWK && cached.salt) {
        state.salt = base64ToSalt(cached.salt);
        
        // Restore key from JWK
        try {
          state.encryptionKey = await crypto.subtle.importKey(
            'jwk',
            cached.encryptionKeyJWK,
            { name: 'AES-CBC' },
            true,
            ['encrypt', 'decrypt']
          );
          
          state.isAuthenticated = true;
          await loadPasswords();
          await checkPendingCredentials(); // CHECK FOR PENDING PASSWORDS HERE
          showDashboardView();
        } catch (e) {
          console.error("Failed to restore key:", e);
          showLoginView();
        }
      } else {
        showLoginView();
      }
    } else {
      state.isAuthenticated = false;
      showLoginView();
    }
  });
}


async function checkPendingCredentials() {
  try {
    const result = await chrome.storage.session.get(['pendingCredentials']);
    if (result.pendingCredentials) {
      console.log("Found pending credentials, opening modal...");
      handleSaveFromContentScript(result.pendingCredentials);
      
      // Clear them so they don't show up again
      await chrome.storage.session.remove(['pendingCredentials']);
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    console.error("Error checking pending credentials:", e);
  }
}

// ==================== UI MANAGEMENT ====================
function showLoginView() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('dashboardView').classList.add('hidden');
}

function showDashboardView() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  renderPasswordList();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">
      ${type === 'success' ? '✓' : type === 'error' ? '✕' : '!'}
    </span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Login form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  
  // Toggle password visibility
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = document.getElementById(e.currentTarget.dataset.target);
      target.type = target.type === 'password' ? 'text' : 'password';
    });
  });
  
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderPasswordList(e.target.value);
  });
  
  // Add password button
  document.getElementById('addPasswordBtn').addEventListener('click', () => {
    openPasswordModal();
  });
  
  // Password form
  document.getElementById('passwordForm').addEventListener('submit', handleSavePassword);
  
  // Generate password
  document.getElementById('generatePasswordBtn').addEventListener('click', () => {
    const password = generatePassword({
      length: 16,
      includeUppercase: true,
      includeLowercase: true,
      includeNumbers: true,
      includeSymbols: true
    });
    document.getElementById('sitePassword').value = password;
    document.getElementById('sitePassword').type = 'text';
    updatePasswordStrength(password);
  });
  
  // Password strength
  document.getElementById('sitePassword').addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
  });
  
  // Modal controls
  document.getElementById('closeModal').addEventListener('click', closePasswordModal);
  document.getElementById('cancelModal').addEventListener('click', closePasswordModal);
  document.querySelector('#passwordModal .modal-overlay').addEventListener('click', closePasswordModal);
  
  // Settings
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.querySelector('#settingsModal .modal-overlay').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  
  // Settings changes
  document.getElementById('autoSaveToggle').addEventListener('change', async (e) => {
    state.settings.autoSave = e.target.checked;
    await saveSettings();
  });
  
  document.getElementById('autoLockSelect').addEventListener('change', async (e) => {
    state.settings.autoLockMinutes = parseInt(e.target.value);
    await saveSettings();
  });
  
  // Lock button
  document.getElementById('lockBtn').addEventListener('click', lockVault);
  
  // Sign out
  document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_CREDENTIALS') {
      handleSaveFromContentScript(message.data);
    }
  });
}

async function saveSettings() {
  await chrome.storage.local.set({ settings: state.settings });
  // Notify background script
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: state.settings });
}

// ==================== AUTHENTICATION ====================
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const masterPassword = document.getElementById('masterPassword').value;
  const errorDiv = document.getElementById('loginError');
  
  try {
    errorDiv.classList.add('hidden');
    
    // Sign in with Firebase
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    state.user = userCredential.user;
    
    // Get or create salt
    const userDoc = await db.collection('users').doc(state.user.uid).get();
    
    if (userDoc.exists && userDoc.data().salt) {
      state.salt = base64ToSalt(userDoc.data().salt);
    } else {
      // Create new salt for new user
      state.salt = generateSalt();
      await db.collection('users').doc(state.user.uid).set({
        salt: saltToBase64(state.salt),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    
    // Derive encryption key
    state.encryptionKey = await deriveKey(masterPassword, state.salt);
    
    // Export key to store in session
    const keyJWK = await crypto.subtle.exportKey('jwk', state.encryptionKey);
    
    // Store salt and key in session storage
    await chrome.storage.session.set({
      salt: saltToBase64(state.salt),
      encryptionKeyJWK: keyJWK,
      userId: state.user.uid
    });
    
    state.isAuthenticated = true;
    
    // Load passwords
    await loadPasswords();
    await checkPendingCredentials();
    
    showDashboardView();
    showToast('Vault unlocked successfully!');
    
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = getErrorMessage(error);
    errorDiv.classList.remove('hidden');
  }
}

function getErrorMessage(error) {
  switch (error.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return error.message || 'An error occurred. Please try again.';
  }
}

async function handleSignOut() {
  await auth.signOut();
  state.isAuthenticated = false;
  state.user = null;
  state.encryptionKey = null;
  state.passwords = [];
  
  await chrome.storage.session.clear();
  
  document.getElementById('settingsModal').classList.add('hidden');
  showLoginView();
  showToast('Signed out successfully');
}

function lockVault() {
  state.encryptionKey = null;
  state.passwords = [];
  showLoginView();
  showToast('Vault locked', 'warning');
}

// ==================== PASSWORD MANAGEMENT ====================
async function loadPasswords() {
  try {
    const snapshot = await db.collection('users')
      .doc(state.user.uid)
      .collection('passwords')
      .get();
    
    state.passwords = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        const decryptedJson = await decrypt(
          data.encryptedData,
          data.iv,
          state.encryptionKey
        );
        const decrypted = JSON.parse(decryptedJson);
        
        state.passwords.push({
          id: doc.id,
          ...decrypted,
          tags: data.tags || [],
          createdAt: data.createdAt?.toMillis() || Date.now(),
          updatedAt: data.updatedAt?.toMillis() || Date.now()
        });
      } catch (err) {
        console.error('Failed to decrypt password entry:', err);
      }
    }
    
    renderPasswordList();
  } catch (error) {
    console.error('Error loading passwords:', error);
    showToast('Failed to load passwords', 'error');
  }
}

async function renderPasswordList(searchQuery = '') {
  const container = document.getElementById('passwordList');
  const query = searchQuery.toLowerCase();
  
  // Get current tab URL to check for matches
  let currentDomain = '';
  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    if (tabs[0]?.url) {
      currentDomain = new URL(tabs[0].url).hostname.replace('www.', '');
    }
  } catch (e) { console.error('Error getting tab URL:', e); }

  const filteredPasswords = state.passwords.filter(p => 
    p.title.toLowerCase().includes(query) ||
    p.username.toLowerCase().includes(query) ||
    p.url?.toLowerCase().includes(query) ||
    p.tags?.some(t => t.toLowerCase().includes(query))
  );
  
  if (filteredPasswords.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h3>${searchQuery ? 'No matches found' : 'No passwords saved'}</h3>
        <p>${searchQuery ? 'Try a different search term' : 'Click the + button to add your first password'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredPasswords.map(password => {
    // Check if this password matches current site
    let isMatch = false;
    if (currentDomain && password.url) {
      try {
        const passwordDomain = new URL(password.url).hostname.replace('www.', '');
        isMatch = currentDomain.includes(passwordDomain) || passwordDomain.includes(currentDomain);
      } catch (e) {}
    }

    return `
    <div class="password-item" data-id="${password.id}">
      <div class="password-icon">${getInitials(password.title)}</div>
      <div class="password-info">
        <div class="password-title">${escapeHtml(password.title)}</div>
        <div class="password-username">${escapeHtml(password.username)}</div>
      </div>
      <div class="password-actions">
        ${isMatch ? `
        <button class="password-action-btn fill-btn" data-id="${password.id}" title="Auto-fill">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6"></path>
            <path d="M10 14L21 3"></path>
            <path d="M18.81 4l-6.3 6.3"></path>
            <path d="M21 3v6"></path>
          </svg>
        </button>
        ` : ''}
        <button class="password-action-btn copy-btn" data-password="${escapeHtml(password.password)}" title="Copy Password">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="password-action-btn edit-btn" data-id="${password.id}" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="password-action-btn delete delete-btn" data-id="${password.id}" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `}).join('');
  
  // Add event listeners
  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.password);
      showToast('Password copied to clipboard!');
    });
  });

  container.querySelectorAll('.fill-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const password = state.passwords.find(p => p.id === btn.dataset.id);
      if (password) {
        handleAutofill(password);
      }
    });
  });
  
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const password = state.passwords.find(p => p.id === btn.dataset.id);
      if (password) openPasswordModal(password);
    });
  });
  
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this password?')) {
        await deletePassword(btn.dataset.id);
      }
    });
  });
  
  container.querySelectorAll('.password-item').forEach(item => {
    item.addEventListener('click', () => {
      const password = state.passwords.find(p => p.id === item.dataset.id);
      if (password) openPasswordModal(password);
    });
  });
}

function getInitials(title) {
  return title.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== PASSWORD MODAL ====================
function openPasswordModal(editPassword = null) {
  const modal = document.getElementById('passwordModal');
  const form = document.getElementById('passwordForm');
  const title = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitBtnText');
  
  form.reset();
  document.getElementById('strengthBar').className = 'strength-bar';
  document.getElementById('strengthLabel').textContent = 'Enter password';
  document.getElementById('strengthLabel').className = 'strength-label';
  
  if (editPassword) {
    title.textContent = 'Edit Password';
    submitBtn.textContent = 'Update Password';
    document.getElementById('editingId').value = editPassword.id;
    document.getElementById('siteTitle').value = editPassword.title;
    document.getElementById('siteUrl').value = editPassword.url || '';
    document.getElementById('siteUsername').value = editPassword.username;
    document.getElementById('sitePassword').value = editPassword.password;
    document.getElementById('siteTags').value = (editPassword.tags || []).join(', ');
    document.getElementById('siteNotes').value = editPassword.notes || '';
    updatePasswordStrength(editPassword.password);
  } else {
    title.textContent = 'Add New Password';
    submitBtn.textContent = 'Save Password';
    document.getElementById('editingId').value = '';
    
    // Try to get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url);
          document.getElementById('siteUrl').value = tabs[0].url;
          document.getElementById('siteTitle').value = url.hostname.replace('www.', '');
        } catch (e) {}
      }
    });
  }
  
  modal.classList.remove('hidden');
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.add('hidden');
}

function updatePasswordStrength(password) {
  const strength = calculatePasswordStrength(password);
  const bar = document.getElementById('strengthBar');
  const label = document.getElementById('strengthLabel');
  
  bar.className = 'strength-bar';
  label.className = 'strength-label';
  
  if (password.length === 0) {
    label.textContent = 'Enter password';
  } else if (strength < 40) {
    bar.classList.add('weak');
    label.classList.add('weak');
    label.textContent = 'Weak';
  } else if (strength < 70) {
    bar.classList.add('medium');
    label.classList.add('medium');
    label.textContent = 'Medium';
  } else {
    bar.classList.add('strong');
    label.classList.add('strong');
    label.textContent = 'Strong';
  }
}

async function handleSavePassword(e) {
  e.preventDefault();
  
  if (!state.encryptionKey) {
    alert("Encryption key missing. Please lock and unlock your vault.");
    return;
  }

  const editingId = document.getElementById('editingId').value;
  const passwordData = {
    title: document.getElementById('siteTitle').value,
    url: document.getElementById('siteUrl').value,
    username: document.getElementById('siteUsername').value,
    password: document.getElementById('sitePassword').value,
    notes: document.getElementById('siteNotes').value
  };
  const tags = document.getElementById('siteTags').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t);
  
  try {
    // Encrypt the password data
    const jsonData = JSON.stringify(passwordData);
    const encrypted = await encrypt(jsonData, state.encryptionKey);
    
    const entryData = {
      encryptedData: encrypted.data,
      iv: encrypted.iv,
      tags: tags,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (editingId) {
      // Update existing
      await db.collection('users')
        .doc(state.user.uid)
        .collection('passwords')
        .doc(editingId)
        .update(entryData);
      
      // Update local state
      const index = state.passwords.findIndex(p => p.id === editingId);
      if (index !== -1) {
        state.passwords[index] = {
          ...state.passwords[index],
          ...passwordData,
          tags,
          updatedAt: Date.now()
        };
      }
      
      showToast('Password updated successfully!');
    } else {
      // Add new
      entryData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const docRef = await db.collection('users')
        .doc(state.user.uid)
        .collection('passwords')
        .add(entryData);
      
      // Add to local state
      state.passwords.push({
        id: docRef.id,
        ...passwordData,
        tags,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      showToast('Password saved successfully!');
    }
    
    closePasswordModal();
    renderPasswordList();
    
  } catch (error) {
    console.error('Error saving password:', error);
    alert(`Failed to save: ${error.message}`); // Show detailed error
  }
}

async function deletePassword(id) {
  try {
    await db.collection('users')
      .doc(state.user.uid)
      .collection('passwords')
      .doc(id)
      .delete();
    
    state.passwords = state.passwords.filter(p => p.id !== id);
    renderPasswordList();
    showToast('Password deleted');
    
  } catch (error) {
    console.error('Error deleting password:', error);
    showToast('Failed to delete password', 'error');
  }
}

// ==================== CONTENT SCRIPT INTEGRATION ====================
async function handleAutofill(passwordEntry) {
  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    if (tabs.length === 0) return;
    
    await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'FILL_CREDENTIALS',
      data: {
        username: passwordEntry.username,
        password: passwordEntry.password
      }
    });
    
    showToast('Credentials filled!');
    // Optional: close popup after filling
    // window.close();
  } catch (error) {
    console.error('Autofill error:', error);
    showToast('Failed to autofill. Refresh the page.', 'error');
  }
}

async function handleSaveFromContentScript(data) {
  if (!state.isAuthenticated || !state.encryptionKey) {
    showToast('Please unlock your vault first', 'warning');
    return;
  }
  
  // Pre-fill the modal with data from content script
  openPasswordModal();
  document.getElementById('siteUrl').value = data.url || '';
  document.getElementById('siteUsername').value = data.username || '';
  document.getElementById('sitePassword').value = data.password || '';
  
  try {
    const url = new URL(data.url);
    document.getElementById('siteTitle').value = url.hostname.replace('www.', '');
  } catch (e) {
    document.getElementById('siteTitle').value = 'Website';
  }
  
  if (data.password) {
    updatePasswordStrength(data.password);
  }
}
