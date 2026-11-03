// SecureVault popup: a UI over the background worker's vault engine (see background.ts).

import './popup.css';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Keyboard,
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
import { calculatePasswordStrength, generatePassword } from '../../src/lib/crypto';
import { h, icon } from './lib/dom';
import { logoMark, monogram } from './lib/brand';
import {
  Entry,
  EntryInput,
  LOCAL,
  STRONG_PASSWORD,
  Settings,
  StatusInfo,
  call,
  getNeverSave,
  getSettings,
  hostOf,
  hostsMatch,
} from './lib/shared';

declare const __APP_URL__: string;

const state = {
  info: null as StatusInfo | null,
  entries: [] as Entry[],
  query: '',
  tab: null as { id: number; host: string | null } | null,
};

const root = document.getElementById('app')!;
const mount = (...nodes: (Node | null)[]) => root.replaceChildren(...nodes.filter((n): n is Node => n !== null));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  mount(h('div', { class: 'center' }, h('div', { class: 'spinner' })));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  state.tab = tab?.id !== undefined ? { id: tab.id, host: hostOf(tab.url) } : null;
  await route();
}

async function route() {
  try {
    state.info = await call<StatusInfo>({ type: 'status' });
  } catch (err) {
    mount(h('div', { class: 'auth' }, errorBox((err as Error).message)));
    return;
  }
  if (state.info.status === 'signed-out') return renderSignIn();
  if (state.info.status === 'locked') return renderLocked();

  state.entries = await call<Entry[]>({ type: 'list' });
  if (state.info.pendingSaveHost) {
    const res = await call<{ result: string; hostname: string } | null>({ type: 'take-save-request' }).catch(() => null);
    state.entries = await call<Entry[]>({ type: 'list' });
    renderVault();
    if (res) toast(res.result === 'updated' ? `Password updated for ${res.hostname}` : res.result === 'unchanged' ? 'Already saved' : `Saved login for ${res.hostname}`);
    return;
  }
  renderVault();
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
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
  toastTimer = setTimeout(() => node.remove(), 2400);
}

function busy(button: HTMLButtonElement, on: boolean, label?: string) {
  button.disabled = on;
  if (on) button.replaceChildren(h('span', { class: 'spinner sm' }));
  else if (label) button.replaceChildren(label);
}

function webLink(path: string, label: string) {
  if (!__APP_URL__) return null;
  return h('a', { class: 'link-btn', href: new URL(path, __APP_URL__).href, target: '_blank', rel: 'noopener' }, label);
}

// ---------------------------------------------------------------------------
// Sign in / locked
// ---------------------------------------------------------------------------
function authLayout(title: string, subtitle: string, form: HTMLFormElement, ...footer: (Node | null)[]) {
  mount(
    h(
      'div',
      { class: 'auth' },
      h('div', { class: 'auth-brand' }, logoMark(36)),
      h('h1', { class: 'auth-title' }, title),
      h('p', { class: 'auth-sub' }, subtitle),
      form,
      h('div', { class: 'auth-footer' }, ...footer)
    )
  );
}

function pendingNote() {
  const host = state.info?.pendingSaveHost;
  return host ? h('p', { class: 'note' }, `Unlock to save the login for ${host}.`) : null;
}

function renderSignIn() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const account = passwordInput({ autocomplete: 'current-password', required: true });
  const master = passwordInput({ autocomplete: 'off', required: true });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');
  const errorSlot = h('div');

  const form = h(
    'form',
    { class: 'stack' },
    pendingNote(),
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
    try {
      await call({ type: 'sign-in', email: email.value, password: account.input.value, master: master.input.value });
      await route();
    } catch (err) {
      busy(submit, false, 'Sign in');
      master.input.value = '';
      errorSlot.replaceChildren(errorBox((err as Error).message));
    }
  });

  authLayout(
    'Sign in to SecureVault',
    'Use the account you created in the web app.',
    form,
    webLink('/register', 'Create an account')
  );
}

function renderLocked() {
  const master = passwordInput({ autocomplete: 'off', required: true, autofocus: true });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Unlock');
  const errorSlot = h('div');

  const form = h('form', { class: 'stack' }, pendingNote(), field('Master password', master.node), errorSlot, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorSlot.replaceChildren();
    busy(submit, true);
    try {
      await call({ type: 'unlock', master: master.input.value });
      await route();
    } catch (err) {
      busy(submit, false, 'Unlock');
      master.input.value = '';
      master.input.focus();
      errorSlot.replaceChildren(errorBox((err as Error).message));
    }
  });

  authLayout(
    'Vault locked',
    state.info?.email ?? '',
    form,
    h('button', { class: 'link-btn', type: 'button', onclick: signOut }, 'Sign in with a different account')
  );
}

async function lock() {
  await call({ type: 'lock' });
  state.entries = [];
  await route();
}

async function signOut() {
  await call({ type: 'sign-out' }).catch(() => {});
  state.entries = [];
  await route();
}

// ---------------------------------------------------------------------------
// Vault list
// ---------------------------------------------------------------------------
function siteMatches(): Entry[] {
  const host = state.tab?.host;
  if (!host) return [];
  return state.entries.filter((e) => {
    const eh = hostOf(e.url);
    return eh !== null && hostsMatch(host, eh);
  });
}

function renderVault() {
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search vault', value: state.query, 'aria-label': 'Search vault' });
  const list = h('div', { class: 'list-area' });

  const draw = () => {
    const q = state.query.trim().toLowerCase();
    const sections: Node[] = [];
    if (state.info?.unreadable) {
      sections.push(h('p', { class: 'note warn' }, `${state.info.unreadable} item(s) couldn't be decrypted and are hidden.`));
    }

    if (!q && state.tab?.host) {
      const host = state.tab.host;
      const matches = siteMatches();
      sections.push(
        h('h2', { class: 'section-title' }, 'This site', h('span', { class: 'section-meta' }, host)),
        matches.length
          ? h('ul', { class: 'rows' }, matches.map((e) => row(e, true)))
          : h(
              'div',
              { class: 'site-empty' },
              h('span', null, 'No saved logins for this site.'),
              h('button', { class: 'link-btn accent', type: 'button', onclick: () => renderEdit(null, { title: host, url: `https://${host}` }) }, 'Add one')
            )
      );
    }

    const all = q
      ? state.entries.filter((e) => [e.title, e.username, e.url, ...e.tags].some((v) => v.toLowerCase().includes(q)))
      : state.entries;
    sections.push(h('h2', { class: 'section-title' }, q ? 'Results' : 'All items', h('span', { class: 'section-meta' }, String(all.length))));
    sections.push(
      all.length
        ? h('ul', { class: 'rows' }, all.map((e) => row(e, false)))
        : h('p', { class: 'empty' }, q ? 'Nothing matches that search.' : 'Your vault is empty. Sign in to a website and SecureVault will offer to save the login.')
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
  if (!state.tab) return;
  try {
    const filled = await call<boolean>({ type: 'fill-tab', id: entry.id, tabId: state.tab.id });
    if (filled) window.close();
    else toast('No login form found on this page', 'error');
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Item detail
// ---------------------------------------------------------------------------
function renderItem(entry: Entry) {
  const host = hostOf(entry.url);
  const canFill = Boolean(host && state.tab?.host && hostsMatch(state.tab.host, host));
  const masked = () => '•'.repeat(Math.min(entry.password.length, 16));

  const pw = h('span', { class: 'mono' }, masked());
  let shown = false;
  const reveal = iconButton(Eye, 'Show password', () => {
    shown = !shown;
    pw.textContent = shown ? entry.password : masked();
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
// Add / edit
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
    node.hidden = !input.value;
    const score = calculatePasswordStrength(input.value);
    const [level, n] = score < 40 ? ['weak', 1] : score < 70 ? ['fair', 2] : ['strong', 3];
    node.dataset.level = String(level);
    label.textContent = String(level).charAt(0).toUpperCase() + String(level).slice(1);
    bars.forEach((b, i) => b.classList.toggle('on', i < (n as number)));
  };
  input.addEventListener('input', update);
  update();
  return { node, update };
}

function renderEdit(entry: Entry | null, prefill: Partial<Entry> = {}) {
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
        pw.input.value = generatePassword(STRONG_PASSWORD);
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
      field('Name', title),
      field('Username', username),
      h('div', { class: 'field' }, h('div', { class: 'field-row' }, h('span', { class: 'field-label' }, 'Password'), generate), pw.node, strength.node),
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
    const input: EntryInput = {
      title: title.value.trim(),
      username: username.value.trim(),
      password: pw.input.value,
      url: normalizeUrl(url.value),
      notes: notes.value.trim(),
      tags: [...new Set(tags.value.split(',').map((t) => t.trim()).filter(Boolean))],
    };
    busy(save, true);
    try {
      const saved = entry
        ? await call<Entry>({ type: 'update', id: entry.id, input })
        : await call<Entry>({ type: 'add', input });
      state.entries = [saved, ...state.entries.filter((x) => x.id !== saved.id)];
      renderItem(saved);
      toast('Saved');
    } catch (err) {
      busy(save, false, 'Save');
      errorSlot.replaceChildren(errorBox((err as Error).message));
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
    busy(button, true);
    try {
      await call({ type: 'delete', id: entry.id });
      state.entries = state.entries.filter((x) => x.id !== entry.id);
      renderVault();
      toast('Deleted');
    } catch (err) {
      busy(button, false, 'Delete');
      toast((err as Error).message, 'error');
    }
  });
  return button;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function renderSettings() {
  const [settings, neverSave] = await Promise.all([getSettings(), getNeverSave()]);
  const update = async (patch: Partial<Settings>) => {
    await chrome.storage.local.set({ [LOCAL.settings]: { ...(await getSettings()), ...patch } });
  };

  const toggle = (checked: boolean, key: 'offerToSave' | 'inlineMenu') => {
    const input = h('input', { type: 'checkbox', class: 'switch', checked });
    input.addEventListener('change', () => update({ [key]: input.checked }));
    return input;
  };

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
        setting('Suggestions in forms', 'Show saved logins and strong passwords under fields.', toggle(settings.inlineMenu, 'inlineMenu')),
        setting('Offer to save logins', 'Ask after you sign in or sign up on a site.', toggle(settings.offerToSave, 'offerToSave')),
        setting('Auto-lock', 'Lock after this long without activity.', autoLock)
      ),
      h(
        'section',
        { class: 'group' },
        h('p', { class: 'setting-title' }, 'Keyboard shortcuts'),
        h('p', { class: 'setting-desc' }, 'Fill the login for the current site with Ctrl+Shift+L (⌘+Shift+L on Mac).'),
        h('button', { class: 'btn block', type: 'button', onclick: () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) }, icon(Keyboard, 15), 'Change shortcuts')
      ),
      h('section', { class: 'group' }, h('p', { class: 'setting-title' }, 'Never offer to save on'), neverList),
      h(
        'section',
        { class: 'group' },
        h('p', { class: 'setting-title' }, 'Account'),
        h('p', { class: 'setting-desc' }, state.info?.email ?? ''),
        webLink('/dashboard', 'Open web vault'),
        h('button', { class: 'btn block', type: 'button', onclick: signOut }, icon(LogOut, 15), 'Sign out')
      ),
      h('p', { class: 'meta center-text' }, `SecureVault ${chrome.runtime.getManifest().version}`)
    )
  );
}

start();
