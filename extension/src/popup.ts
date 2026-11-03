// SecureVault popup.
// Uses the same vault module as the web app (src/lib/vault.ts), so both read and write
// exactly the same encrypted format.

import './popup.css';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide';
import * as vault from '../../src/lib/vault';
import { calculatePasswordStrength, exportKey, generatePassword, importKey } from '../../src/lib/crypto';
import { friendlyAuthError } from '../../src/lib/errors';
import type { DecryptedPasswordEntry } from '../../src/lib/types';
import { h, icon } from './lib/dom';
import {
  ContentMessage,
  LOCAL,
  PendingLogin,
  SESSION,
  Settings,
  getNeverSave,
  getSettings,
  hostOf,
  hostsMatch,
  loginFingerprint,
} from './lib/shared';

declare const __FIREBASE_CONFIG__: FirebaseOptions;

const app = initializeApp(__FIREBASE_CONFIG__);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
type Entry = DecryptedPasswordEntry;

const state = {
  key: null as CryptoKey | null,
  entries: [] as Entry[],
  unreadable: 0,
  query: '',
  tab: null as { id: number; host: string | null } | null,
  saveRequest: null as PendingLogin | null,
};

const root = document.getElementById('app')!;

function mount(...nodes: (Node | null)[]) {
  root.replaceChildren(...nodes.filter((n): n is Node => n !== null));
}

// ---------------------------------------------------------------------------
// Session (chrome.storage.session: memory only, cleared when the browser closes)
// ---------------------------------------------------------------------------
async function touchActivity() {
  await chrome.storage.session.set({ [SESSION.lastActivity]: Date.now() });
}

let lastTouch = 0;
['pointerdown', 'keydown'].forEach((type) =>
  document.addEventListener(type, () => {
    if (Date.now() - lastTouch > 15_000) {
      lastTouch = Date.now();
      touchActivity();
    }
  })
);

async function persistUnlocked(uid: string, key: CryptoKey) {
  await chrome.storage.session.set({
    [SESSION.key]: await exportKey(key),
    [SESSION.uid]: uid,
    [SESSION.lastActivity]: Date.now(),
  });
  await refreshKnownLogins();
}

/** Fingerprints let the background worker skip prompts for logins that are already saved. */
async function refreshKnownLogins() {
  const prints = await Promise.all(
    state.entries
      .map((e) => ({ e, host: hostOf(e.url) }))
      .filter((x) => x.host)
      .map(({ e, host }) => loginFingerprint(host!, e.username, e.password))
  );
  await chrome.storage.session.set({ [SESSION.knownLogins]: prints });
}

async function restoreKey(uid: string): Promise<CryptoKey | null> {
  const s = await chrome.storage.session.get([SESSION.key, SESSION.uid, SESSION.lastActivity]);
  if (!s[SESSION.key] || s[SESSION.uid] !== uid) return null;
  const { autoLockMinutes } = await getSettings();
  if (Date.now() - ((s[SESSION.lastActivity] as number) ?? 0) > autoLockMinutes * 60_000) {
    await chrome.storage.session.remove([SESSION.key, SESSION.knownLogins]);
    return null;
  }
  return importKey(s[SESSION.key] as string);
}

async function lock() {
  state.key = null;
  state.entries = [];
  await chrome.storage.session.remove([SESSION.key, SESSION.knownLogins]);
  renderLocked();
}

async function signOut() {
  await firebaseSignOut(auth).catch(() => {});
  state.key = null;
  state.entries = [];
  await chrome.storage.session.remove([SESSION.key, SESSION.uid, SESSION.knownLogins, SESSION.saveRequest]);
  renderSignIn();
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  mount(h('div', { class: 'center' }, h('div', { class: 'spinner' })));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  state.tab = tab?.id !== undefined ? { id: tab.id, host: tab.url ? hostOf(tab.url) : null } : null;

  const req = await chrome.storage.session.get(SESSION.saveRequest);
  state.saveRequest = (req[SESSION.saveRequest] as PendingLogin | undefined) ?? null;
  chrome.action.setBadgeText({ text: '' });

  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return renderSignIn();

  try {
    const key = await restoreKey(user.uid);
    if (!key) return renderLocked();
    state.key = key;
    ({ entries: state.entries, unreadable: state.unreadable } = await vault.loadEntries(db, user.uid, key));
    await touchActivity();
    afterUnlock();
  } catch (err) {
    console.error(err);
    renderLocked();
  }
}

function afterUnlock() {
  if (state.saveRequest) {
    const req = state.saveRequest;
    state.saveRequest = null;
    chrome.storage.session.remove(SESSION.saveRequest);
    const existing = state.entries.find(
      (e) => e.username === req.username && hostsMatch(req.hostname, hostOf(e.url) ?? '')
    );
    if (existing && existing.password === req.password) {
      renderVault();
      toast('This login is already saved');
      return;
    }
    if (existing) return renderEdit(existing, { password: req.password }, 'Update the saved password?');
    return renderEdit(null, {
      title: req.hostname,
      url: req.url,
      username: req.username,
      password: req.password,
    });
  }
  renderVault();
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function logoMark(size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const parts: [string, Record<string, string>][] = [
    ['rect', { width: '128', height: '128', rx: '30', fill: 'var(--accent)' }],
    ['circle', { cx: '64', cy: '53', r: '19', fill: '#fff' }],
    ['path', { d: 'M55.5 62h17l6.2 31.2a4 4 0 0 1-3.9 4.8H53.2a4 4 0 0 1-3.9-4.8z', fill: '#fff' }],
  ];
  for (const [tag, attrs] of parts) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    svg.append(el);
  }
  return svg;
}

const MONOGRAM_COLORS = ['#1d4ed8', '#0f766e', '#6d28d9', '#be123c', '#b45309', '#0369a1', '#4d7c0f', '#475569'];

function monogram(title: string, size = 32) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return h(
    'span',
    {
      class: 'monogram',
      style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${
        MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length]
      }`,
      'aria-hidden': 'true',
    },
    title.trim().charAt(0).toUpperCase() || '?'
  );
}

function iconButton(node: Parameters<typeof icon>[0], label: string, onClick: (e: MouseEvent) => void, extra = '') {
  return h('button', { class: `icon-btn ${extra}`, title: label, 'aria-label': label, type: 'button', onclick: onClick }, icon(node));
}

function subHeader(title: string, onBack: () => void, ...actions: Node[]) {
  return h(
    'header',
    { class: 'topbar' },
    iconButton(ArrowLeft, 'Back', onBack),
    h('h1', { class: 'topbar-title' }, title),
    h('div', { class: 'topbar-actions' }, ...actions)
  );
}

function errorBox(message: string) {
  return h('div', { class: 'alert', role: 'alert' }, icon(CircleAlert, 15), h('span', null, message));
}

function field(label: string, input: HTMLElement, hint?: string) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'field-hint' }, hint));
}

function passwordInput(props: Record<string, unknown> = {}) {
  const input = h('input', { class: 'input has-btn', type: 'password', spellcheck: false, ...props });
  const toggle = iconButton(Eye, 'Show password', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.replaceChildren(icon(show ? EyeOff : Eye));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }, 'in-input');
  return { input, node: h('div', { class: 'input-wrap' }, input, toggle) };
}

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text);
  toast(`${what} copied`);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = h('div', { class: `toast ${kind}`, role: 'status' }, icon(kind === 'ok' ? Check : CircleAlert, 15), message);
  document.body.append(node);
  toastTimer = setTimeout(() => node.remove(), 2200);
}

function busy(button: HTMLButtonElement, on: boolean, label?: string) {
  button.disabled = on;
  if (on) button.replaceChildren(h('span', { class: 'spinner sm' }));
  else if (label) button.replaceChildren(label);
}

// ---------------------------------------------------------------------------
// Views: sign in / locked
// ---------------------------------------------------------------------------
function authLayout(title: string, subtitle: string, form: HTMLFormElement, footer?: Node) {
  mount(
    h(
      'div',
      { class: 'auth' },
      h('div', { class: 'auth-brand' }, logoMark(36)),
      h('h1', { class: 'auth-title' }, title),
      h('p', { class: 'auth-sub' }, subtitle),
      form,
      footer
    )
  );
}

function saveRequestNote() {
  return state.saveRequest
    ? h('p', { class: 'note' }, `Unlock to save the login for ${state.saveRequest.hostname}.`)
    : null;
}

function renderSignIn(error?: string) {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const account = passwordInput({ autocomplete: 'current-password', required: true });
  const master = passwordInput({ autocomplete: 'off', required: true });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');
  const errorSlot = h('div', null, error ? errorBox(error) : null);

  const form = h(
    'form',
    { class: 'stack' },
    saveRequestNote(),
    field('Email', email),
    field('Account password', account.node),
    field('Master password', master.node, 'Decrypts your vault on this device.'),
    errorSlot,
    submit
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorSlot.replaceChildren();
    busy(submit, true);
    let uid: string;
    try {
      uid = (await signInWithEmailAndPassword(auth, email.value.trim(), account.input.value)).user.uid;
    } catch (err) {
      busy(submit, false, 'Sign in');
      errorSlot.replaceChildren(errorBox(friendlyAuthError(err)));
      return;
    }
    try {
      const { key, entries, unreadable } = await vault.unlockVault(db, uid, master.input.value, { extractableKey: true });
      state.key = key;
      state.entries = entries;
      state.unreadable = unreadable;
      await persistUnlocked(uid, key);
      afterUnlock();
    } catch (err) {
      await firebaseSignOut(auth).catch(() => {});
      busy(submit, false, 'Sign in');
      master.input.value = '';
      errorSlot.replaceChildren(errorBox((err as Error).message));
    }
  });

  authLayout('Sign in to SecureVault', 'Use the account you created in the web app.', form);
}

function renderLocked(error?: string) {
  const user = auth.currentUser;
  if (!user) return renderSignIn();

  const master = passwordInput({ autocomplete: 'off', required: true, autofocus: true });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Unlock');
  const errorSlot = h('div', null, error ? errorBox(error) : null);

  const form = h('form', { class: 'stack' }, saveRequestNote(), field('Master password', master.node), errorSlot, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorSlot.replaceChildren();
    busy(submit, true);
    try {
      const { key, entries, unreadable } = await vault.unlockVault(db, user.uid, master.input.value, { extractableKey: true });
      state.key = key;
      state.entries = entries;
      state.unreadable = unreadable;
      await persistUnlocked(user.uid, key);
      afterUnlock();
    } catch (err) {
      busy(submit, false, 'Unlock');
      master.input.value = '';
      master.input.focus();
      errorSlot.replaceChildren(errorBox(friendlyAuthError(err)));
    }
  });

  authLayout(
    'Vault locked',
    user.email ?? '',
    form,
    h('button', { class: 'link-btn', type: 'button', onclick: signOut }, 'Sign in with a different account')
  );
}

// ---------------------------------------------------------------------------
// View: vault list
// ---------------------------------------------------------------------------
function siteMatches(): Entry[] {
  const host = state.tab?.host;
  if (!host) return [];
  return state.entries.filter((e) => {
    const h2 = hostOf(e.url);
    return h2 !== null && hostsMatch(host, h2);
  });
}

function renderVault() {
  const search = h('input', {
    class: 'input search',
    type: 'search',
    placeholder: 'Search vault',
    value: state.query,
    'aria-label': 'Search vault',
  });
  const list = h('div', { class: 'list-area' });

  const draw = () => {
    const q = state.query.trim().toLowerCase();
    const sections: Node[] = [];
    if (state.unreadable > 0) {
      sections.push(h('p', { class: 'note warn' }, `${state.unreadable} item(s) couldn't be decrypted and are hidden.`));
    }

    if (!q) {
      const matches = siteMatches();
      if (state.tab?.host) {
        sections.push(
          h('h2', { class: 'section-title' }, 'This site', h('span', { class: 'section-meta' }, state.tab.host)),
          matches.length
            ? h('ul', { class: 'rows' }, matches.map((e) => row(e, true)))
            : h(
                'div',
                { class: 'site-empty' },
                h('span', null, 'No saved logins for this site.'),
                h('button', { class: 'link-btn accent', type: 'button', onclick: () => renderEdit(null, { title: state.tab!.host!, url: `https://${state.tab!.host}` }) }, 'Add one')
              )
        );
      }
    }

    const all = q
      ? state.entries.filter((e) => [e.title, e.username, e.url, ...e.tags].some((v) => v.toLowerCase().includes(q)))
      : state.entries;

    sections.push(h('h2', { class: 'section-title' }, q ? 'Results' : 'All items', h('span', { class: 'section-meta' }, String(all.length))));
    if (all.length) sections.push(h('ul', { class: 'rows' }, all.map((e) => row(e, false))));
    else
      sections.push(
        h('p', { class: 'empty' }, q ? 'Nothing matches that search.' : 'Your vault is empty. Logins you add are encrypted before they leave this device.')
      );

    list.replaceChildren(...sections);
  };

  search.addEventListener('input', () => {
    state.query = search.value;
    draw();
  });

  draw();
  mount(
    h(
      'header',
      { class: 'topbar' },
      logoMark(24),
      h('div', { class: 'search-wrap' }, icon(Search, 15), search),
      iconButton(Plus, 'New item', () => renderEdit(null)),
      iconButton(Lock, 'Lock', lock),
      iconButton(SettingsIcon, 'Settings', renderSettings)
    ),
    list
  );
  search.focus();
}

function row(entry: Entry, fillable: boolean) {
  const actions = h(
    'div',
    { class: 'row-actions' },
    iconButton(Copy, 'Copy password', (e) => {
      e.stopPropagation();
      copy(entry.password, 'Password');
    })
  );
  if (fillable) {
    actions.append(
      h('button', { class: 'btn primary sm', type: 'button', onclick: (e: Event) => { e.stopPropagation(); fillEntry(entry); } }, 'Fill')
    );
  }
  return h(
    'li',
    { class: 'row', tabindex: 0, onclick: () => renderItem(entry), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && renderItem(entry) },
    monogram(entry.title),
    h('div', { class: 'row-text' }, h('span', { class: 'row-title' }, entry.title), h('span', { class: 'row-sub' }, entry.username || '—')),
    actions
  );
}

async function fillEntry(entry: Entry) {
  const host = hostOf(entry.url);
  const tab = state.tab;
  if (!tab?.host || !host || !hostsMatch(tab.host, host)) {
    toast("This login isn't for the current site", 'error');
    return;
  }
  const message: ContentMessage = { type: 'fill', hostname: host, username: entry.username, password: entry.password };
  const send = () => chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }) as Promise<{ filled: boolean } | undefined>;
  let res: { filled: boolean } | undefined;
  try {
    res = await send();
  } catch {
    // Tabs opened before the extension was installed have no content script yet.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      res = await send();
    } catch {
      res = undefined;
    }
  }
  if (res?.filled) window.close();
  else toast('No login form found on this page', 'error');
}

// ---------------------------------------------------------------------------
// View: item detail
// ---------------------------------------------------------------------------
function renderItem(entry: Entry) {
  const host = hostOf(entry.url);
  const canFill = Boolean(host && state.tab?.host && hostsMatch(state.tab.host, host));

  const pw = h('span', { class: 'mono' }, '•'.repeat(Math.min(entry.password.length, 16)));
  let shown = false;
  const reveal = iconButton(Eye, 'Show password', () => {
    shown = !shown;
    pw.textContent = shown ? entry.password : '•'.repeat(Math.min(entry.password.length, 16));
    reveal.replaceChildren(icon(shown ? EyeOff : Eye));
  });

  const detail = (label: string, value: Node | string, ...buttons: (Node | null)[]) =>
    h('div', { class: 'detail' }, h('span', { class: 'detail-label' }, label), h('div', { class: 'detail-value' }, value), ...buttons);

  mount(
    subHeader('Login', renderVault, iconButton(Pencil, 'Edit', () => renderEdit(entry))),
    h(
      'div',
      { class: 'scroll pad' },
      h('div', { class: 'item-head' }, monogram(entry.title, 40), h('div', { class: 'item-head-text' }, h('h2', null, entry.title), host && h('span', null, host))),
      h(
        'div',
        { class: 'details' },
        detail('Username', entry.username || '—', entry.username ? iconButton(Copy, 'Copy username', () => copy(entry.username, 'Username')) : null),
        detail('Password', pw, reveal, iconButton(Copy, 'Copy password', () => copy(entry.password, 'Password'))),
        entry.url ? detail('Website', h('span', { class: 'truncate' }, entry.url), iconButton(ExternalLink, 'Open website', () => chrome.tabs.create({ url: entry.url }))) : null
      ),
      entry.notes && h('div', { class: 'notes' }, h('span', { class: 'detail-label' }, 'Notes'), h('p', null, entry.notes)),
      entry.tags.length > 0 && h('div', { class: 'tags' }, entry.tags.map((t) => h('span', { class: 'tag' }, t))),
      h('p', { class: 'meta' }, `Updated ${new Date(entry.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`)
    ),
    canFill ? h('footer', { class: 'footer' }, h('button', { class: 'btn primary block', type: 'button', onclick: () => fillEntry(entry) }, `Fill on ${state.tab!.host}`)) : null
  );
}

// ---------------------------------------------------------------------------
// View: add / edit
// ---------------------------------------------------------------------------
function normalizeUrl(value: string) {
  const v = value.trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

function strengthMeter(input: HTMLInputElement) {
  const bars = [0, 1, 2].map(() => h('span'));
  const label = h('span', { class: 'strength-label' });
  const node = h('div', { class: 'strength' }, h('div', { class: 'strength-bars' }, bars), label);
  const update = () => {
    const v = input.value;
    node.hidden = !v;
    const score = calculatePasswordStrength(v);
    const [level, n] = score < 40 ? ['weak', 1] : score < 70 ? ['fair', 2] : ['strong', 3];
    node.dataset.level = String(level);
    label.textContent = String(level).charAt(0).toUpperCase() + String(level).slice(1);
    bars.forEach((b, i) => b.classList.toggle('on', i < (n as number)));
  };
  input.addEventListener('input', update);
  update();
  return { node, update };
}

function renderEdit(entry: Entry | null, prefill: Partial<Entry> = {}, banner?: string) {
  const base = { ...entry, ...prefill };
  const title = h('input', { class: 'input', required: true, value: base.title ?? '' });
  const username = h('input', { class: 'input', autocomplete: 'off', spellcheck: false, value: base.username ?? '' });
  const pw = passwordInput({ class: 'input has-btn mono', required: true, autocomplete: 'new-password', value: base.password ?? '' });
  const strength = strengthMeter(pw.input);
  const generate = h(
    'button',
    {
      class: 'link-btn accent',
      type: 'button',
      onclick: () => {
        pw.input.value = generatePassword({ length: 20, includeUppercase: true, includeLowercase: true, includeNumbers: true, includeSymbols: true });
        pw.input.type = 'text';
        strength.update();
      },
    },
    icon(RefreshCw, 13),
    'Generate'
  );
  const url = h('input', { class: 'input', placeholder: 'example.com', spellcheck: false, value: base.url ?? '' });
  const notes = h('textarea', { class: 'input', rows: 3 });
  notes.value = base.notes ?? '';
  const tags = h('input', { class: 'input', placeholder: 'work, finance', value: (base.tags ?? []).join(', ') });

  const errorSlot = h('div');
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Save');

  const form = h(
    'form',
    { class: 'edit' },
    h(
      'div',
      { class: 'scroll pad stack' },
      banner && h('p', { class: 'note' }, banner),
      field('Name', title),
      field('Username', username),
      h(
        'div',
        { class: 'field' },
        h('div', { class: 'field-row' }, h('span', { class: 'field-label' }, 'Password'), generate),
        pw.node,
        strength.node
      ),
      field('Website', url),
      field('Notes', notes),
      field('Tags', tags, 'Comma-separated. Stored unencrypted for filtering.'),
      errorSlot
    ),
    h(
      'footer',
      { class: 'footer row-between' },
      entry ? deleteButton(entry) : h('span'),
      h('div', { class: 'footer-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => (entry ? renderItem(entry) : renderVault()) }, 'Cancel'), save)
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorSlot.replaceChildren();
    const uid = auth.currentUser?.uid;
    if (!uid || !state.key) return lock();
    const input: vault.EntryInput = {
      title: title.value.trim(),
      username: username.value.trim(),
      password: pw.input.value,
      url: normalizeUrl(url.value),
      notes: notes.value.trim(),
      tags: [...new Set(tags.value.split(',').map((t) => t.trim()).filter(Boolean))],
    };
    busy(save, true);
    try {
      let saved: Entry;
      if (entry) {
        await vault.updateEntry(db, uid, state.key, entry.id, input);
        saved = { ...entry, ...input, updatedAt: Date.now() };
        state.entries = [saved, ...state.entries.filter((x) => x.id !== entry.id)];
      } else {
        saved = await vault.addEntry(db, uid, state.key, input);
        state.entries = [saved, ...state.entries];
      }
      await refreshKnownLogins();
      renderItem(saved);
      toast('Saved');
    } catch (err) {
      busy(save, false, 'Save');
      errorSlot.replaceChildren(errorBox(friendlyAuthError(err)));
    }
  });

  mount(subHeader(entry ? 'Edit login' : 'New login', () => (entry ? renderItem(entry) : renderVault())), form);
  (entry ? pw.input : title).focus();
}

function deleteButton(entry: Entry) {
  let armed = false;
  const button = h('button', { class: 'btn ghost danger', type: 'button' }, icon(Trash2, 15), 'Delete');
  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.classList.add('armed');
      button.replaceChildren('Confirm delete');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    busy(button, true);
    try {
      await vault.deleteEntry(db, uid, entry.id);
      state.entries = state.entries.filter((x) => x.id !== entry.id);
      await refreshKnownLogins();
      renderVault();
      toast('Deleted');
    } catch (err) {
      busy(button, false, 'Delete');
      toast(friendlyAuthError(err), 'error');
    }
  });
  return button;
}

// ---------------------------------------------------------------------------
// View: settings
// ---------------------------------------------------------------------------
async function renderSettings() {
  const [settings, neverSave] = await Promise.all([getSettings(), getNeverSave()]);
  const update = async (patch: Partial<Settings>) => {
    await chrome.storage.local.set({ [LOCAL.settings]: { ...(await getSettings()), ...patch } });
  };

  const offer = h('input', { type: 'checkbox', class: 'switch', checked: settings.offerToSave });
  offer.addEventListener('change', () => update({ offerToSave: offer.checked }));

  const autoLock = h(
    'select',
    { class: 'input select' },
    [5, 15, 30, 60, 240].map((m) => h('option', { value: String(m), selected: m === settings.autoLockMinutes }, m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`))
  );
  autoLock.addEventListener('change', () => update({ autoLockMinutes: Number(autoLock.value) }));

  const neverList = h('ul', { class: 'never-list' });
  const drawNever = (list: string[]) =>
    neverList.replaceChildren(
      ...(list.length
        ? list.map((host) =>
            h(
              'li',
              null,
              h('span', { class: 'truncate' }, host),
              iconButton(X, `Allow prompts on ${host}`, async () => {
                const next = (await getNeverSave()).filter((x) => x !== host);
                await chrome.storage.local.set({ [LOCAL.neverSave]: next });
                drawNever(next);
              })
            )
          )
        : [h('li', { class: 'muted' }, 'None')])
    );
  drawNever(neverSave);

  const setting = (title: string, desc: string, control: Node) =>
    h('div', { class: 'setting' }, h('div', null, h('p', { class: 'setting-title' }, title), h('p', { class: 'setting-desc' }, desc)), control);

  mount(
    subHeader('Settings', renderVault),
    h(
      'div',
      { class: 'scroll' },
      h(
        'section',
        { class: 'group' },
        setting('Offer to save logins', 'Ask after you sign in to a site.', offer),
        setting('Auto-lock', 'Lock after this long without activity.', autoLock)
      ),
      h('section', { class: 'group' }, h('p', { class: 'setting-title' }, 'Never offer to save on'), neverList),
      h(
        'section',
        { class: 'group' },
        h('p', { class: 'setting-title' }, 'Account'),
        h('p', { class: 'setting-desc' }, auth.currentUser?.email ?? ''),
        h('button', { class: 'btn block', type: 'button', onclick: signOut }, icon(LogOut, 15), 'Sign out')
      ),
      h('p', { class: 'meta center-text' }, `SecureVault ${chrome.runtime.getManifest().version}`)
    )
  );
}

start();
