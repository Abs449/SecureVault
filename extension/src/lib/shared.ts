// Types, storage keys and helpers shared by the popup, background worker and content script.

export interface Settings {
  offerToSave: boolean;
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = { offerToSave: true, autoLockMinutes: 15 };

export interface CapturedLogin {
  url: string;
  hostname: string;
  username: string;
  password: string;
}

/** Messages sent to the background worker. */
export type BackgroundMessage =
  | { type: 'login-captured'; login: CapturedLogin }
  | { type: 'get-pending' }
  | { type: 'save-pending' }
  | { type: 'dismiss-pending' }
  | { type: 'never-save'; hostname: string };

/** Messages sent to the content script. */
export type ContentMessage =
  | { type: 'fill'; hostname: string; username: string; password: string }
  | { type: 'insert-password'; password: string };

/**
 * chrome.storage.session holds the unlocked vault state. It lives in memory only, is cleared
 * when the browser closes, and is not readable by content scripts.
 */
export const SESSION = {
  key: 'vaultKey', // base64 raw AES key
  uid: 'vaultUid', // the account the key belongs to
  lastActivity: 'lastActivity',
  knownLogins: 'knownLogins', // SHA-256 fingerprints of saved logins, to avoid re-prompting
  pending: 'pendingLogins', // { [tabId]: PendingLogin } captured but not yet answered
  saveRequest: 'saveRequest', // the login the user chose to save; the popup picks it up
} as const;

export const LOCAL = {
  settings: 'settings',
  neverSave: 'neverSave',
} as const;

export interface PendingLogin extends CapturedLogin {
  capturedAt: number;
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(LOCAL.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[LOCAL.settings] as Partial<Settings> | undefined) };
}

export async function getNeverSave(): Promise<string[]> {
  const stored = await chrome.storage.local.get(LOCAL.neverSave);
  return (stored[LOCAL.neverSave] as string[] | undefined) ?? [];
}

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function hostOf(url: string): string | null {
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
  // Require at least a two-label parent so "com" alone never matches.
  const isSub = (child: string, parent: string) => parent.includes('.') && child.endsWith('.' + parent);
  return isSub(a, b) || isSub(b, a);
}

/** Fingerprint of a login, so the worker can tell whether a captured login is already saved. */
export async function loginFingerprint(host: string, username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${normalizeHost(host)}\u0000${username}\u0000${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
