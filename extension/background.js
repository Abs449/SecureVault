// SecureVault Chrome Extension - Background Service Worker
// Handles background tasks, message passing, and alarms

// ==================== STATE ====================
let autoLockTimeout = 15 * 60 * 1000; // 15 minutes default
let lastActivityTime = Date.now();

// ==================== INITIALIZATION ====================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('SecureVault Extension installed/updated:', details.reason);
  
  // Initialize storage
  chrome.storage.local.get(['settings', 'blacklist'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          autoSave: true,
          autoLockMinutes: 15
        }
      });
    }
    if (!result.blacklist) {
      chrome.storage.local.set({ blacklist: [] });
    }
  });
  
  // Set up alarm for auto-lock check
  chrome.alarms.create('autoLockCheck', { periodInMinutes: 1 });
});

// ==================== MESSAGE HANDLING ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  switch (message.type) {
    case 'SAVE_CREDENTIALS':
      handleSaveCredentials(message.data, sender.tab);
      break;
      
    case 'SETTINGS_UPDATED':
      handleSettingsUpdate(message.settings);
      break;
      
    case 'USER_ACTIVITY':
      lastActivityTime = Date.now();
      break;
      
    case 'CHECK_AUTH_STATUS':
      checkAuthStatus().then(sendResponse);
      return true; // Keep channel open for async response
      
    case 'GET_CREDENTIALS_FOR_SITE':
      getCredentialsForSite(message.url).then(sendResponse);
      return true;
  }
});

// ==================== CREDENTIAL HANDLING ====================
async function handleSaveCredentials(credentials, tab) {
  console.log('Processing credentials for:', credentials.hostname);
  
  // Check if site is blacklisted
  const result = await chrome.storage.local.get(['blacklist']);
  const blacklist = result.blacklist || [];
  
  if (blacklist.includes(credentials.hostname)) {
    console.log('Site is blacklisted, ignoring');
    return;
  }
  
  // Store temporarily for popup to retrieve
  await chrome.storage.session.set({
    pendingCredentials: {
      ...credentials,
      timestamp: Date.now()
    }
  });
  
  // Open the popup (this will trigger the save flow)
  // Note: We can't programmatically open popup, so we show a notification
  try {
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } catch (e) {
    console.log('Badge update failed:', e);
  }
}

async function getCredentialsForSite(url) {
  try {
    const hostname = new URL(url).hostname;
    const result = await chrome.storage.session.get(['cachedPasswords']);
    
    if (result.cachedPasswords) {
      const matching = result.cachedPasswords.filter(p => 
        p.url && p.url.includes(hostname)
      );
      return { success: true, passwords: matching };
    }
    
    return { success: false, passwords: [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==================== SETTINGS ====================
function handleSettingsUpdate(settings) {
  if (settings.autoLockMinutes) {
    autoLockTimeout = settings.autoLockMinutes * 60 * 1000;
  }
}

// ==================== AUTO-LOCK ====================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoLockCheck') {
    checkAutoLock();
  }
});

async function checkAutoLock() {
  const elapsed = Date.now() - lastActivityTime;
  
  if (elapsed > autoLockTimeout) {
    // Clear session data to lock the vault
    await chrome.storage.session.clear();
    
    // Notify any open popups
    chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => {
      // Popup might not be open
    });
    
    chrome.action.setBadgeText({ text: '' });
    console.log('Vault auto-locked due to inactivity');
  }
}

// ==================== TAB EVENTS ====================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Reset badge when navigating
    chrome.action.getBadgeText({}, (text) => {
      if (text) {
        // Keep badge if there are pending credentials
      }
    });
  }
});

// Clear pending credentials badge when popup is opened
chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

// ==================== AUTH STATUS ====================
async function checkAuthStatus() {
  try {
    const result = await chrome.storage.session.get(['userId', 'salt']);
    return {
      isAuthenticated: !!(result.userId && result.salt),
      userId: result.userId
    };
  } catch (e) {
    return { isAuthenticated: false };
  }
}

// ==================== CONTEXT MENU ====================
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for password generation
  chrome.contextMenus.create({
    id: 'generatePassword',
    title: 'Generate Secure Password',
    contexts: ['editable']
  });
  
  chrome.contextMenus.create({
    id: 'openVault',
    title: 'Open SecureVault',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'generatePassword') {
    // Generate and insert password
    const password = generateSecurePassword();
    
    chrome.tabs.sendMessage(tab.id, {
      type: 'INSERT_GENERATED_PASSWORD',
      password: password
    });
  } else if (info.menuItemId === 'openVault') {
    chrome.action.openPopup();
  }
});

function generateSecurePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, x => charset[x % charset.length]).join('');
}

console.log('SecureVault background service worker initialized');
