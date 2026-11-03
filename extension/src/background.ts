// SecureVault background service worker.
// Owns: pending "save this login?" prompts per tab, auto-lock, and the context menu.
// It never touches Firebase or the vault contents; it only reads the session to know
// whether the vault is unlocked and which logins are already saved (as fingerprints).

import { generatePassword } from '../../src/lib/crypto';
import {
  BackgroundMessage,
  ContentMessage,
  LOCAL,
  PendingLogin,
  SESSION,
  getNeverSave,
  getSettings,
  loginFingerprint,
  normalizeHost,
} from './lib/shared';

const PENDING_TTL_MS = 2 * 60 * 1000;
const AUTO_LOCK_ALARM = 'auto-lock';
const MENU_GENERATE = 'generate-password';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_GENERATE,
    title: 'Generate password',
    contexts: ['editable'],
  });
});

// Alarms survive worker restarts, but re-creating keeps the period current after updates.
chrome.alarms.create(AUTO_LOCK_ALARM, { periodInMinutes: 1 });

// ---------------------------------------------------------------------------
// Pending logins (per tab)
// ---------------------------------------------------------------------------
type PendingMap = Record<string, PendingLogin>;

async function getPendingMap(): Promise<PendingMap> {
  const stored = await chrome.storage.session.get(SESSION.pending);
  const map = (stored[SESSION.pending] as PendingMap | undefined) ?? {};
  const now = Date.now();
  for (const [tabId, p] of Object.entries(map)) {
    if (now - p.capturedAt > PENDING_TTL_MS) delete map[tabId];
  }
  return map;
}

async function setPending(tabId: number, login: PendingLogin | null) {
  const map = await getPendingMap();
  if (login) map[tabId] = login;
  else delete map[tabId];
  await chrome.storage.session.set({ [SESSION.pending]: map });
}

async function isAlreadySaved(login: PendingLogin): Promise<boolean> {
  const stored = await chrome.storage.session.get(SESSION.knownLogins);
  const known = (stored[SESSION.knownLogins] as string[] | undefined) ?? [];
  if (known.length === 0) return false;
  return known.includes(await loginFingerprint(login.hostname, login.username, login.password));
}

async function shouldOffer(hostname: string): Promise<boolean> {
  const [settings, neverSave] = await Promise.all([getSettings(), getNeverSave()]);
  return settings.offerToSave && !neverSave.includes(normalizeHost(hostname));
}

async function handleMessage(message: BackgroundMessage, tabId: number | undefined): Promise<unknown> {
  switch (message.type) {
    case 'login-captured': {
      if (tabId === undefined) return { show: false };
      const login: PendingLogin = { ...message.login, capturedAt: Date.now() };
      if (!(await shouldOffer(login.hostname)) || (await isAlreadySaved(login))) return { show: false };
      await setPending(tabId, login);
      return { show: true };
    }

    case 'get-pending': {
      if (tabId === undefined) return null;
      const pending = (await getPendingMap())[tabId];
      if (!pending || !(await shouldOffer(pending.hostname))) return null;
      // Only the hostname and username go back to the page; the password stays here.
      return { hostname: pending.hostname, username: pending.username };
    }

    case 'save-pending': {
      if (tabId === undefined) return { opened: false };
      const pending = (await getPendingMap())[tabId];
      if (!pending) return { opened: false };
      await chrome.storage.session.set({ [SESSION.saveRequest]: pending });
      await setPending(tabId, null);
      try {
        await chrome.action.openPopup();
        return { opened: true };
      } catch {
        // openPopup can fail if the window isn't focused; fall back to a badge.
        await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
        await chrome.action.setBadgeText({ text: '1' });
        return { opened: false };
      }
    }

    case 'dismiss-pending':
      if (tabId !== undefined) await setPending(tabId, null);
      return { ok: true };

    case 'never-save': {
      const list = await getNeverSave();
      const host = normalizeHost(message.hostname);
      if (!list.includes(host)) await chrome.storage.local.set({ [LOCAL.neverSave]: [...list, host] });
      if (tabId !== undefined) await setPending(tabId, null);
      return { ok: true };
    }
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  // Only accept messages from our own extension (content scripts and pages).
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(message, sender.tab?.id)
    .then(sendResponse)
    .catch((err) => {
      console.error('SecureVault background error:', err);
      sendResponse(null);
    });
  return true; // async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setPending(tabId, null).catch(() => {});
});

// ---------------------------------------------------------------------------
// Auto-lock
// ---------------------------------------------------------------------------
async function lockIfIdle() {
  const stored = await chrome.storage.session.get([SESSION.key, SESSION.lastActivity]);
  if (!stored[SESSION.key]) return;
  const { autoLockMinutes } = await getSettings();
  const last = (stored[SESSION.lastActivity] as number | undefined) ?? 0;
  if (Date.now() - last > autoLockMinutes * 60 * 1000) {
    await chrome.storage.session.remove([SESSION.key, SESSION.knownLogins, SESSION.saveRequest]);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) lockIfIdle().catch(console.error);
});

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_GENERATE || tab?.id === undefined) return;
  const password = generatePassword({
    length: 20,
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true,
  });
  const message: ContentMessage = { type: 'insert-password', password };
  chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 }).catch(() => {});
});
