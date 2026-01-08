// SecureVault Chrome Extension - Content Script
// Detects password entries on websites and prompts users to save them

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__secureVaultInjected) return;
  window.__secureVaultInjected = true;

  // Configuration
  const CONFIG = {
    debounceMs: 500,
    minPasswordLength: 4,
    popupDisplayDuration: 15000,
    animationDuration: 300
  };

  // State
  let currentPopup = null;
  let debounceTimer = null;
  let popupTimeout = null; // Track the timeout so we can clear it
  let lastDetectedCredentials = null;
  let isEnabled = true;

// ... (skip down to showSavePopup)

  function showSavePopup(credentials) {
    // Remove existing popup
    if (currentPopup) {
      removePopup();
    }
    
    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'securevault-save-popup';
    popup.innerHTML = `
      <div class="sv-popup-content">
        <div class="sv-popup-header">
          <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="SecureVault" class="sv-logo">
          <div class="sv-popup-title">
            <h3>SecureVault</h3>
            <span>Save this password?</span>
          </div>
          <button class="sv-close-btn" id="sv-close">×</button>
        </div>
        <div class="sv-popup-body">
          <div class="sv-credential-info">
            <div class="sv-field">
              <span class="sv-label">Website</span>
              <span class="sv-value">${escapeHtml(credentials.hostname)}</span>
            </div>
            <div class="sv-field">
              <span class="sv-label">Username</span>
              <span class="sv-value">${escapeHtml(credentials.username || 'Not detected')}</span>
            </div>
          </div>
        </div>
        <div class="sv-popup-actions">
          <button class="sv-btn sv-btn-secondary" id="sv-never">Never for this site</button>
          <button class="sv-btn sv-btn-primary" id="sv-save">Save Password</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;
    
    // Animate in
    requestAnimationFrame(() => {
      popup.classList.add('sv-visible');
    });
    
    // Event listeners
    popup.querySelector('#sv-close').addEventListener('click', removePopup);
    popup.querySelector('#sv-never').addEventListener('click', () => {
      addToBlacklist(credentials.hostname);
      removePopup();
    });
    popup.querySelector('#sv-save').addEventListener('click', () => {
      saveCredentials(credentials);
      removePopup();
    });

    // PAUSE ON HOVER
    const content = popup.querySelector('.sv-popup-content');
    content.addEventListener('mouseenter', () => {
      if (popupTimeout) {
        clearTimeout(popupTimeout);
        popupTimeout = null;
      }
    });
    
    content.addEventListener('mouseleave', () => {
      startAutoCloseTimer(popup);
    });
    
    // Start the timer
    startAutoCloseTimer(popup);
  }

  function startAutoCloseTimer(popup) {
    if (popupTimeout) clearTimeout(popupTimeout);
    
    popupTimeout = setTimeout(() => {
      if (currentPopup === popup) {
        removePopup();
      }
    }, CONFIG.popupDisplayDuration);
  }

  function removePopup() {
    if (currentPopup) {
      currentPopup.classList.remove('sv-visible');
      setTimeout(() => {
        currentPopup?.remove();
        currentPopup = null;
      }, CONFIG.animationDuration);
    }
  }

  async function saveCredentials(credentials) {
    // Send to popup/background for processing
    chrome.runtime.sendMessage({
      type: 'SAVE_CREDENTIALS',
      data: credentials
    });
    
    // Show success notification
    showNotification('Credentials sent to SecureVault. Open the extension to save.');
  }

  async function addToBlacklist(hostname) {
    try {
      const result = await chrome.storage.local.get(['blacklist']);
      const blacklist = result.blacklist || [];
      if (!blacklist.includes(hostname)) {
        blacklist.push(hostname);
        await chrome.storage.local.set({ blacklist });
      }
      showNotification('This site will not show save prompts.');
    } catch (e) {
      console.error('SecureVault: Failed to update blacklist', e);
    }
  }

  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'sv-notification';
    notification.innerHTML = `
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="SecureVault" class="sv-notif-icon">
      <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
      notification.classList.add('sv-visible');
    });
    
    setTimeout(() => {
      notification.classList.remove('sv-visible');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function handlePasswordBlur(e) {
    if (!isEnabled) return;
    
    const field = e.target;
    // Only proceed if password field has content
    if (!field.value) return;

    const form = field.closest('form') || document.body;
    
    // Slight delay to ensure other fields (like username) are populated/detectable
    setTimeout(() => {
      const credentials = extractCredentials(form);
      if (credentials && isValidCredentials(credentials)) {
        lastDetectedCredentials = credentials;
        // Show popup immediately on blur if we have a valid password
        // Check if we already have a popup open for these credentials to avoid spam
        if (!currentPopup) {
           showSavePopup(credentials);
        }
      }
    }, 200);
  }

  function extractCredentials(container) {
    // If container is a form/body, find password field
    const passwordField = container.querySelector ? container.querySelector('input[type="password"]') : null;
    return extractCredentialsFromField(passwordField); 
  }

  function extractCredentialsFromField(passwordField) {
    if (!passwordField || !passwordField.value) return null;
    
    const form = passwordField.closest('form') || document.body;

    // Find username/email field
    let usernameField = null;
    
    // Try common selectors
    const selectors = [
      'input[type="email"]',
      'input[name*="user"]',
      'input[name*="email"]',
      'input[name*="login"]',
      'input[id*="user"]',
      'input[id*="email"]',
      'input[id*="login"]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[type="text"]'
    ];
    
    for (const selector of selectors) {
      // Search within the same form context
      const field = form.querySelector(selector);
      if (field && field !== passwordField && field.value) {
        usernameField = field;
        break;
      }
    }
    
    // Fallback: find any text input before password field
    if (!usernameField) {
      // Get all inputs in the form/context
      const allDisplayInputs = Array.from(form.querySelectorAll('input'));
      // Filter out hidden inputs if needed, or just work by index
      const passwordIndex = allDisplayInputs.indexOf(passwordField);
      
      for (let i = passwordIndex - 1; i >= 0; i--) {
        const input = allDisplayInputs[i];
        if (input.type === 'text' || input.type === 'email') {
          if (input.value) {
            usernameField = input;
            break;
          }
        }
      }
    }
    
    return {
      username: usernameField?.value || '',
      password: passwordField.value,
      url: window.location.href,
      hostname: window.location.hostname
    };
  }
  // ==================== AUTO-FILL ====================
  function fillCredentials(data) {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      const passwordField = form.querySelector('input[type="password"]');
      if (!passwordField) return;
      
      // Find and fill username field
      const usernameSelectors = [
        'input[type="email"]',
        'input[name*="user"]',
        'input[name*="email"]',
        'input[type="text"]'
      ];
      
      for (const selector of usernameSelectors) {
        const field = form.querySelector(selector);
        if (field && field !== passwordField) {
          field.value = data.username;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }
      }
      
      // Fill password
      passwordField.value = data.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // ==================== UTILITIES ====================
  function debounce(func, wait) {
    return function(...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== START ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
