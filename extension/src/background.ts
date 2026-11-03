// SecureVault background service worker: the extension's vault engine.
//
// It is the only part of the extension that talks to Firebase or holds the vault key.
// The popup, welcome page and content scripts all go through the message API below.
// Content scripts only ever learn about logins for the site they are running on, and only
// receive a password when they ask to fill it into that same site.

import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth/web-extension';
// Resolved to firebase/firestore/lite by the build: the full SDK doesn't run in service workers.
import { getFirestore } from 'firebase/firestore';
import * as vault from '../../src/lib/vault';
import { exportKey, generatePassword, importKey } from '../../src/lib/crypto';
import { friendlyAuthError } from '../../src/lib/errors';
import {
  ContentMessage,
  ContentRequest,
  Entry,
  LOCAL,
  LoginSummary,
  PageLogins,
  PageRequest,
  PendingLogin,
  Request,
  Result,
  SESSION,
  STRONG_PASSWORD,
  SaveMode,
  StatusInfo,
  VaultStatus,
  getNeverSave,
  getSettings,
  hostOf,
  hostsMatch,
  normalizeHost,
} from './lib/shared';

declare const __FIREBASE_CONFIG__: FirebaseOptions;

const app = initializeApp(__FIREBASE_CONFIG__);
const auth = getAuth(app);
const db = getFirestore(app);

const PENDING_TTL_MS = 3 * 60 * 1000;
const AUTO_LOCK_ALARM = 'auto-lock';
const MENU_GENERATE = 'generate-password';

// ---------------------------------------------------------------------------
// Vault state
// The key lives in chrome.storage.session (memory only, survives worker restarts).
// Decrypted entries are cached in worker memory and reloaded when the worker restarts.
// ---------------------------------------------------------------------------
interface UnlockedVault {
  uid: string;
  key: CryptoKey;
  entries: Entry[];
  unreadable: number;
}
let cache: UnlockedVault | null = null;
let loading: Promise<UnlockedVault> | null = null;

async function currentUser() {
  await auth.authStateReady();
  return auth.currentUser;
}

async function touch() {
  await chrome.storage.session.set({ [SESSION.lastActivity]: Date.now() });
}

async function clearKey() {
  cache = null;
  await chrome.storage.session.remove([SESSION.key, SESSION.uid]);
}

/** The unlocked vault, or null if signed out / locked / timed out. */
async function openVault(): Promise<UnlockedVault | null> {
  const user = await currentUser();
  if (!user) {
    cache = null;
    return null;
  }
  const s = await chrome.storage.session.get([SESSION.key, SESSION.uid, SESSION.lastActivity]);
  if (!s[SESSION.key] || s[SESSION.uid] !== user.uid) {
    cache = null;
    return null;
  }
  const { autoLockMinutes } = await getSettings();
  if (Date.now() - ((s[SESSION.lastActivity] as number) ?? 0) > autoLockMinutes * 60_000) {
    await clearKey();
    return null;
  }
  if (cache?.uid === user.uid) return cache;

  loading ??= (async () => {
    const key = await importKey(s[SESSION.key] as string);
    const { entries, unreadable } = await vault.loadEntries(db, user.uid, key);
    const unlocked: UnlockedVault = { uid: user.uid, key, entries, unreadable };
    cache = unlocked;
    return unlocked;
  })().finally(() => (loading = null));
  return loading;
}

async function status(): Promise<VaultStatus> {
  if (!(await currentUser())) return 'signed-out';
  return (await openVault()) ? 'unlocked' : 'locked';
}

async function requireVault() {
  const v = await openVault();
  if (!v) throw new Error('Your vault is locked.');
  await touch();
  return v;
}

async function unlockWith(uid: string, master: string) {
  const { key, entries, unreadable } = await vault.unlockVault(db, uid, master, { extractableKey: true });
  await chrome.storage.session.set({
    [SESSION.key]: await exportKey(key),
    [SESSION.uid]: uid,
    [SESSION.lastActivity]: Date.now(),
  });
  cache = { uid, key, entries, unreadable };
}

function matchesFor(entries: Entry[], pageHost: string | null): Entry[] {
  if (!pageHost) return [];
  return entries.filter((e) => {
    const h = hostOf(e.url);
    return h !== null && hostsMatch(pageHost, h);
  });
}

function sortByRecent(entries: Entry[]) {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function saveLogin(login: PendingLogin): Promise<'added' | 'updated' | 'unchanged'> {
  const v = await requireVault();
  const existing = matchesFor(v.entries, login.hostname).find((e) => e.username === login.username);
  if (existing) {
    if (existing.password === login.password) return 'unchanged';
    const input = { ...existing, password: login.password };
    await vault.updateEntry(db, v.uid, v.key, existing.id, input);
    v.entries = sortByRecent(v.entries.map((e) => (e.id === existing.id ? { ...input, updatedAt: Date.now() } : e)));
    return 'updated';
  }
  const created = await vault.addEntry(db, v.uid, v.key, {
    title: login.hostname,
    url: new URL(login.url).origin,
    username: login.username,
    password: login.password,
    notes: '',
    tags: [],
  });
  v.entries = [created, ...v.entries];
  return 'added';
}

// ---------------------------------------------------------------------------
// Pending "save this login?" prompts, per tab
// ---------------------------------------------------------------------------
type PendingMap = Record<string, PendingLogin>;

async function getPendingMap(): Promise<PendingMap> {
  const stored = await chrome.storage.session.get(SESSION.pending);
  const map = (stored[SESSION.pending] as PendingMap | undefined) ?? {};
  for (const [tabId, p] of Object.entries(map)) {
    if (Date.now() - p.capturedAt > PENDING_TTL_MS) delete map[tabId];
  }
  return map;
}

async function setPending(tabId: number, login: PendingLogin | null) {
  const map = await getPendingMap();
  if (login) map[tabId] = login;
  else delete map[tabId];
  await chrome.storage.session.set({ [SESSION.pending]: map });
}

async function shouldOffer(hostname: string) {
  const [settings, neverSave] = await Promise.all([getSettings(), getNeverSave()]);
  return settings.offerToSave && !neverSave.includes(normalizeHost(hostname));
}

async function openPopup(): Promise<boolean> {
  try {
    await chrome.action.openPopup();
    return true;
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
    await chrome.action.setBadgeText({ text: '1' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Filling
// ---------------------------------------------------------------------------
/**
 * Ask the tab's frames to fill a login. Every frame receives the message, but only a frame
 * whose own site matches the login (re-checked in the content script) fills and answers,
 * so forms inside iframes work and other frames never get the credentials applied.
 */
async function sendFill(tabId: number, entry: Entry): Promise<boolean> {
  const message: ContentMessage = {
    type: 'fill',
    hostname: hostOf(entry.url) ?? '',
    username: entry.username,
    password: entry.password,
  };
  const send = () => chrome.tabs.sendMessage(tabId, message) as Promise<{ filled: boolean } | undefined>;
  try {
    return Boolean((await send())?.filled);
  } catch {
    // No frame answered: either nothing to fill, or the tab was opened before the extension
    // was installed and has no content script yet. Inject and try once more.
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      return Boolean((await send())?.filled);
    } catch {
      return false;
    }
  }
}

async function fillTab(tabId: number, entryId: string): Promise<boolean> {
  const v = await requireVault();
  const entry = v.entries.find((e) => e.id === entryId);
  const tab = await chrome.tabs.get(tabId);
  const tabHost = hostOf(tab.url);
  const entryHost = entry && hostOf(entry.url);
  if (!entry || !tabHost || !entryHost || !hostsMatch(tabHost, entryHost)) {
    throw new Error("This login isn't for the current site.");
  }
  return sendFill(tabId, entry);
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------
async function handlePage(req: PageRequest): Promise<unknown> {
  switch (req.type) {
    case 'status': {
      const s = await status();
      const user = await currentUser();
      const pending = (await chrome.storage.session.get(SESSION.saveRequest))[SESSION.saveRequest] as PendingLogin | undefined;
      chrome.action.setBadgeText({ text: '' });
      return {
        status: s,
        email: user?.email ?? null,
        unreadable: cache?.unreadable ?? 0,
        pendingSaveHost: pending?.hostname ?? null,
      } satisfies StatusInfo;
    }

    case 'sign-in': {
      let uid: string;
      try {
        uid = (await signInWithEmailAndPassword(auth, req.email.trim(), req.password)).user.uid;
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
      try {
        await unlockWith(uid, req.master);
      } catch (err) {
        await firebaseSignOut(auth).catch(() => {});
        throw err;
      }
      return null;
    }

    case 'unlock': {
      const user = await currentUser();
      if (!user) throw new Error('You are signed out.');
      await unlockWith(user.uid, req.master);
      return null;
    }

    case 'lock':
      await clearKey();
      return null;

    case 'sign-out':
      await clearKey();
      await chrome.storage.session.remove([SESSION.saveRequest, SESSION.pending]);
      await firebaseSignOut(auth);
      return null;

    case 'list': {
      const v = await requireVault();
      return v.entries;
    }

    case 'add': {
      const v = await requireVault();
      const created = await vault.addEntry(db, v.uid, v.key, req.input);
      v.entries = [created, ...v.entries];
      return created;
    }

    case 'update': {
      const v = await requireVault();
      await vault.updateEntry(db, v.uid, v.key, req.id, req.input);
      const existing = v.entries.find((e) => e.id === req.id);
      const updated: Entry = { ...(existing as Entry), ...req.input, id: req.id, updatedAt: Date.now() };
      v.entries = sortByRecent(v.entries.map((e) => (e.id === req.id ? updated : e)));
      return updated;
    }

    case 'delete': {
      const v = await requireVault();
      await vault.deleteEntry(db, v.uid, req.id);
      v.entries = v.entries.filter((e) => e.id !== req.id);
      return null;
    }

    case 'fill-tab':
      return fillTab(req.tabId, req.id);

    case 'take-save-request': {
      const stored = await chrome.storage.session.get(SESSION.saveRequest);
      const pending = stored[SESSION.saveRequest] as PendingLogin | undefined;
      if (!pending) return null;
      const result = await saveLogin(pending);
      await chrome.storage.session.remove(SESSION.saveRequest);
      return { result, hostname: pending.hostname };
    }
  }
}

async function handleContent(req: ContentRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  const frameHost = hostOf(sender.url);
  if (tabId === undefined || !frameHost) throw new Error('Unsupported page.');

  switch (req.type) {
    case 'page-logins': {
      const [s, settings] = await Promise.all([status(), getSettings()]);
      let logins: LoginSummary[] = [];
      if (s === 'unlocked' && cache) {
        logins = matchesFor(cache.entries, frameHost).map(({ id, title, username }) => ({ id, title, username }));
      }
      return { status: s, logins, settings } satisfies PageLogins;
    }

    case 'fill-request': {
      const v = await requireVault();
      const entry = v.entries.find((e) => e.id === req.id);
      const entryHost = entry && hostOf(entry.url);
      // Only release the password to the site it belongs to.
      if (!entry || !entryHost || !hostsMatch(frameHost, entryHost)) throw new Error('Not available on this site.');
      return { username: entry.username, password: entry.password };
    }

    case 'login-captured': {
      const login = req.login;
      // Trust the frame URL Chrome reports, not the page-supplied hostname.
      if (!hostsMatch(frameHost, login.hostname) || !login.password) return { show: false };
      if (!(await shouldOffer(frameHost))) return { show: false };

      let mode: SaveMode = 'save';
      const v = await openVault();
      if (v) {
        const existing = matchesFor(v.entries, frameHost).find((e) => e.username === login.username);
        if (existing?.password === login.password) return { show: false };
        if (existing) mode = 'update';
      }
      const topHost = hostOf(sender.tab?.url) ?? frameHost;
      await setPending(tabId, { ...login, hostname: frameHost, topHost, capturedAt: Date.now(), mode });
      if (sender.frameId && sender.frameId !== 0) {
        // Login happened inside an iframe: show the prompt in the top page, where it has room.
        const relay: ContentMessage = { type: 'show-save-prompt', hostname: frameHost, username: login.username, mode };
        chrome.tabs.sendMessage(tabId, relay, { frameId: 0 }).catch(() => {});
        return { show: false };
      }
      return { show: true, mode };
    }

    case 'get-pending': {
      if (sender.frameId) return null; // prompts are shown by the top frame only
      const pending = (await getPendingMap())[tabId];
      if (!pending || !(await shouldOffer(pending.hostname))) return null;
      if (!hostsMatch(frameHost, pending.hostname) && !hostsMatch(frameHost, pending.topHost)) return null;
      return { hostname: pending.hostname, username: pending.username, mode: pending.mode };
    }

    case 'save-pending': {
      const pending = (await getPendingMap())[tabId];
      if (!pending) return { result: 'expired' };
      await setPending(tabId, null);
      if (await openVault()) return { result: await saveLogin(pending) };
      // Locked: hand the login to the popup, which saves it right after unlocking.
      await chrome.storage.session.set({ [SESSION.saveRequest]: pending });
      return { result: (await openPopup()) ? 'unlocking' : 'click-icon' };
    }

    case 'dismiss-pending':
      await setPending(tabId, null);
      return null;

    case 'never-save': {
      const list = await getNeverSave();
      // The prompt may be shown on the top page for a login captured in an iframe.
      const pending = (await getPendingMap())[tabId];
      const host = normalizeHost(pending?.hostname ?? frameHost);
      if (!list.includes(host)) await chrome.storage.local.set({ [LOCAL.neverSave]: [...list, host] });
      await setPending(tabId, null);
      return null;
    }

    case 'open-popup':
      return openPopup();
  }
}

const PAGE_ONLY = new Set<Request['type']>([
  'status', 'sign-in', 'unlock', 'lock', 'sign-out', 'list', 'add', 'update', 'delete', 'fill-tab', 'take-save-request',
]);

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL('')) ?? false;

  const work = PAGE_ONLY.has(req.type)
    ? fromExtensionPage
      ? handlePage(req as PageRequest)
      : Promise.reject(new Error('Not allowed.'))
    : handleContent(req as ContentRequest, sender);

  work
    .then((data) => sendResponse({ ok: true, data } satisfies Result<unknown>))
    .catch((err: unknown) => {
      const error = err instanceof vault.IncorrectMasterPasswordError ? err.message : friendlyAuthError(err);
      sendResponse({ ok: false, error } satisfies Result<unknown>);
    });
  return true;
});

// ---------------------------------------------------------------------------
// Install, auto-lock, context menu, keyboard shortcut
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: MENU_GENERATE, title: 'Generate secure password', contexts: ['editable'] });
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

chrome.alarms.create(AUTO_LOCK_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) openVault().catch(() => {}); // openVault clears an expired key
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setPending(tabId, null).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_GENERATE || tab?.id === undefined) return;
  const message: ContentMessage = { type: 'insert-password', password: generatePassword(STRONG_PASSWORD) };
  chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-login' || tab?.id === undefined) return;
  const v = await openVault();
  if (!v) {
    await openPopup();
    return;
  }
  const [entry] = sortByRecent(matchesFor(v.entries, hostOf(tab.url)));
  if (entry) {
    await touch();
    await sendFill(tab.id, entry);
  }
});
