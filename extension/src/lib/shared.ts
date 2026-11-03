// Types, storage keys and helpers shared by the background worker, popup, welcome page
// and content script.

import type { DecryptedPasswordEntry } from '../../../src/lib/types';
import type { EntryInput } from '../../../src/lib/vault';

export type Entry = DecryptedPasswordEntry;
export type { EntryInput };

export interface Settings {
  offerToSave: boolean;
  inlineMenu: boolean;
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = { offerToSave: true, inlineMenu: true, autoLockMinutes: 15 };

export type VaultStatus = 'signed-out' | 'locked' | 'unlocked';

export interface CapturedLogin {
  url: string;
  hostname: string;
  username: string;
  password: string;
}

/** What the page is allowed to see about a saved login: never the password. */
export interface LoginSummary {
  id: string;
  title: string;
  username: string;
}

// ---------------------------------------------------------------------------
// Messages to the background worker
// ---------------------------------------------------------------------------

/** Requests only extension pages (popup, welcome) may make. */
export type PageRequest =
  | { type: 'status' }
  | { type: 'sign-in'; email: string; password: string; master: string }
  | { type: 'unlock'; master: string }
  | { type: 'lock' }
  | { type: 'sign-out' }
  | { type: 'list' }
  | { type: 'add'; input: EntryInput }
  | { type: 'update'; id: string; input: EntryInput }
  | { type: 'delete'; id: string }
  | { type: 'fill-tab'; id: string; tabId: number }
  | { type: 'take-save-request' };

/** Requests content scripts may make. Answers are scoped to the sender frame's site. */
export type ContentRequest =
  | { type: 'page-logins' }
  | { type: 'fill-request'; id: string }
  | { type: 'login-captured'; login: CapturedLogin }
  | { type: 'get-pending' }
  | { type: 'save-pending' }
  | { type: 'dismiss-pending' }
  | { type: 'never-save'; hostname: string }
  | { type: 'open-popup' };

export type Request = PageRequest | ContentRequest;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface StatusInfo {
  status: VaultStatus;
  email: string | null;
  unreadable: number;
  pendingSaveHost: string | null;
}

export interface PageLogins {
  status: VaultStatus;
  logins: LoginSummary[];
  settings: Settings;
}

export type SaveMode = 'save' | 'update';

/** Send a request to the background worker and unwrap the result. */
export async function call<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Result<T> | undefined;
  if (!res) throw new Error('SecureVault is not responding. Try again.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

// ---------------------------------------------------------------------------
// Messages to content scripts
// ---------------------------------------------------------------------------
export type ContentMessage =
  | { type: 'fill'; hostname: string; username: string; password: string }
  | { type: 'insert-password'; password: string }
  | { type: 'show-save-prompt'; hostname: string; username: string; mode: SaveMode };

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * chrome.storage.session holds unlocked-vault state. It lives in memory only, is cleared
 * when the browser closes, and content scripts cannot read it.
 */
export const SESSION = {
  key: 'vaultKey', // base64 raw AES key
  uid: 'vaultUid', // the account the key belongs to
  lastActivity: 'lastActivity',
  pending: 'pendingLogins', // { [tabId]: PendingLogin } captured but not yet answered
  saveRequest: 'saveRequest', // a login the user chose to save while the vault was locked
} as const;

export const LOCAL = {
  settings: 'settings',
  neverSave: 'neverSave',
} as const;

export interface PendingLogin extends CapturedLogin {
  capturedAt: number;
  mode: SaveMode;
  /** Site of the tab's top page, which differs from `hostname` when the form was in an iframe. */
  topHost: string;
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(LOCAL.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[LOCAL.settings] as Partial<Settings> | undefined) };
}

export async function getNeverSave(): Promise<string[]> {
  const stored = await chrome.storage.local.get(LOCAL.neverSave);
  return (stored[LOCAL.neverSave] as string[] | undefined) ?? [];
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? normalizeHost(u.hostname) : null;
  } catch {
    return null;
  }
}

/**
 * True if a saved login for `savedHost` should be offered on `pageHost`.
 * Exact match, or one is a subdomain of the other (accounts.google.com <-> google.com).
 * Substring matching is deliberately avoided: "evil-paypal.com" must not match "paypal.com".
 */
export function hostsMatch(pageHost: string, savedHost: string): boolean {
  const a = normalizeHost(pageHost);
  const b = normalizeHost(savedHost);
  if (a === b) return true;
  const isSub = (child: string, parent: string) => parent.includes('.') && child.endsWith('.' + parent);
  return isSub(a, b) || isSub(b, a);
}

export const STRONG_PASSWORD = {
  length: 20,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true,
};
