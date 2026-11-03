// SecureVault content script.
//
// - Classifies form fields as username / current password / new password.
// - Shows an inline menu under focused fields: saved logins for this site, or a strong
//   generated password on sign-up and change-password forms.
// - Detects submitted logins and offers to save or update them.
// - Fills credentials on request from the popup or the keyboard shortcut.
//
// All UI is rendered inside closed shadow roots, so the page can neither restyle nor read it.
// Passwords are requested from the background worker only at the moment they are filled,
// and only for logins saved for this site.

import { Check, KeyRound, LockKeyhole, RefreshCw, WandSparkles, X, createElement as lucide, type IconNode } from 'lucide';
import { calculatePasswordStrength, generatePassword } from '../../src/lib/crypto';
import {
  CapturedLogin,
  ContentMessage,
  LoginSummary,
  PageLogins,
  STRONG_PASSWORD,
  SaveMode,
  call,
  hostsMatch,
  normalizeHost,
} from './lib/shared';

declare global {
  interface Window {
    __secureVaultLoaded?: boolean;
  }
}

if (!window.__secureVaultLoaded && /^https?:$/.test(location.protocol)) {
  window.__secureVaultLoaded = true;
  main();
}

function main() {
  // ===========================================================================
  // Field analysis
  // ===========================================================================
  type Kind = 'username' | 'current-password' | 'new-password';
  const isTop = window === window.top;

  /** Fields where the user closed the menu or that we just filled: don't pop it up again on focus. */
  const dismissedFor = new WeakSet<HTMLInputElement>();

  const USERNAME_HINT = /user|e-?mail|login|account|identifier|phone|mobile/i;
  const NEW_PASSWORD_HINT = /new|confirm|repeat|retype|re-enter|verify|create|choose|signup|sign-up|register/i;
  const SIGNUP_TEXT = /sign\s?up|register|create (an |your )?account|join|get started|new account/i;
  const LOGIN_TEXT = /log\s?in|sign\s?in|welcome back/i;

  const isVisible = (el: HTMLElement) =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.offsetWidth > 8;
  const isUsable = (el: HTMLInputElement) => isVisible(el) && !el.disabled && !el.readOnly;
  const isTextLike = (el: HTMLInputElement) => ['text', 'email', 'tel', ''].includes(el.type);
  const describe = (el: HTMLInputElement) =>
    [el.name, el.id, el.placeholder, el.getAttribute('aria-label') ?? '', el.autocomplete].join(' ');

  const scopeOf = (el: HTMLElement): ParentNode => el.closest('form') ?? document;
  const inputsIn = (scope: ParentNode) => Array.from(scope.querySelectorAll('input'));
  const passwordsIn = (scope: ParentNode) => inputsIn(scope).filter((el) => el.type === 'password' && isVisible(el));

  function formLooksLikeSignup(scope: ParentNode): boolean {
    const root = scope instanceof HTMLFormElement ? scope : document.body;
    const buttons = Array.from(root.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .map((b) => (b instanceof HTMLInputElement ? b.value : b.textContent ?? ''))
      .join(' ');
    const action = scope instanceof HTMLFormElement ? scope.action : location.pathname;
    const text = `${buttons} ${action}`;
    return SIGNUP_TEXT.test(text) && !LOGIN_TEXT.test(buttons);
  }

  function classify(el: HTMLInputElement): Kind | null {
    if (!isUsable(el)) return null;
    const ac = el.autocomplete.toLowerCase();

    if (el.type === 'password') {
      if (ac.includes('new-password')) return 'new-password';
      if (ac.includes('current-password')) return 'current-password';
      if (NEW_PASSWORD_HINT.test(describe(el))) return 'new-password';
      const scope = scopeOf(el);
      const passwords = passwordsIn(scope);
      if (passwords.length >= 3) return passwords.indexOf(el) === 0 ? 'current-password' : 'new-password';
      if (passwords.length === 2) return 'new-password';
      return formLooksLikeSignup(scope) ? 'new-password' : 'current-password';
    }

    if (!isTextLike(el) || /search|query|coupon|promo|captcha|otp|code/i.test(describe(el))) return null;
    const hinted = /username|email/.test(ac) || el.type === 'email' || USERNAME_HINT.test(describe(el));
    if (!hinted) return null;
    // A username field either sits next to a password field, or announces itself
    // (username-first sign-in pages such as Google or Microsoft).
    return passwordsIn(scopeOf(el)).length > 0 || /username|email/.test(ac) ? 'username' : null;
  }

  /** Best username field for a password field: hinted inputs first, then the nearest text input before it. */
  function usernameFieldFor(password: HTMLInputElement, requireValue: boolean): HTMLInputElement | null {
    const all = inputsIn(scopeOf(password));
    const before = all.slice(0, Math.max(all.indexOf(password), 0));
    const candidates = before.filter((el) => isTextLike(el) && isVisible(el) && (!requireValue || el.value.trim() !== ''));
    const hinted = candidates.filter(
      (el) => /username|email/.test(el.autocomplete) || el.type === 'email' || USERNAME_HINT.test(describe(el))
    );
    return hinted.at(-1) ?? candidates.at(-1) ?? null;
  }

  // ===========================================================================
  // Filling
  // ===========================================================================
  // Filling moves focus between fields; don't let that re-open the menu.
  let fillingUntil = 0;

  function setValue(input: HTMLInputElement, value: string) {
    fillingUntil = Date.now() + 400;
    dismissedFor.add(input);
    // The native setter makes frameworks (React, Vue, Angular…) notice the change.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    input.focus({ preventScroll: true });
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Fill a login into the form around `anchor` (or the page's first login form). */
  function fillLogin(username: string, password: string, anchor?: HTMLInputElement): boolean {
    const scope = anchor ? scopeOf(anchor) : document;
    const passwordField =
      (anchor?.type === 'password' && isUsable(anchor) ? anchor : null) ??
      inputsIn(scope).find((el) => el.type === 'password' && isUsable(el) && classify(el) === 'current-password') ??
      inputsIn(scope).find((el) => el.type === 'password' && isUsable(el));

    let filled = false;
    const userField =
      (anchor && classify(anchor) === 'username' ? anchor : null) ??
      (passwordField ? usernameFieldFor(passwordField, false) : null) ??
      inputsIn(scope).find((el) => classify(el) === 'username');

    if (userField && username) {
      setValue(userField, username);
      filled = true;
    }
    if (passwordField) {
      setValue(passwordField, password);
      filled = true;
    }
    return filled;
  }

  /** Put a new password into every new-password field of the form (password + confirmation). */
  function fillNewPassword(password: string, anchor: HTMLInputElement) {
    const targets = passwordsIn(scopeOf(anchor)).filter((el) => isUsable(el) && classify(el) === 'new-password');
    (targets.length ? targets : [anchor]).forEach((el) => setValue(el, password));
    anchor.focus({ preventScroll: true });
  }

  function insertPassword(password: string) {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || !isUsable(active)) return;
    if (active.type === 'password') fillNewPassword(password, active);
    else setValue(active, password);
  }

  chrome.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message.type === 'fill') {
      // Every frame of the tab receives this. Only a frame on the login's own site fills, and
      // only a frame that actually filled answers, so the first answer is the meaningful one.
      if (hostsMatch(location.hostname, message.hostname) && fillLogin(message.username, message.password)) {
        sendResponse({ filled: true });
      }
    } else if (message.type === 'show-save-prompt') {
      if (isTop) showSavePrompt(message.hostname, message.username, message.mode);
    } else if (message.type === 'insert-password') {
      insertPassword(message.password);
      sendResponse({ ok: true });
    }
    return false;
  });

  // ===========================================================================
  // Inline menu
  // ===========================================================================
  let pageInfo: { at: number; data: PageLogins } | null = null;
  async function getPageInfo(): Promise<PageLogins | null> {
    if (pageInfo && Date.now() - pageInfo.at < 3000) return pageInfo.data;
    try {
      pageInfo = { at: Date.now(), data: await call<PageLogins>({ type: 'page-logins' }) };
      return pageInfo.data;
    } catch {
      return null; // extension reloaded or unavailable
    }
  }

  interface MenuItem {
    icon: Node;
    title: string;
    subtitle?: string;
    mono?: boolean;
    trailing?: Node;
    run: () => void | Promise<void>;
  }

  let menu: { host: HTMLElement; field: HTMLInputElement; items: HTMLElement[]; active: number; raf: number } | null = null;

  function closeMenu() {
    if (!menu) return;
    cancelAnimationFrame(menu.raf);
    menu.host.remove();
    menu = null;
  }

  function positionMenu() {
    if (!menu) return;
    const { field, host } = menu;
    if (!field.isConnected || !isVisible(field)) return closeMenu();
    const r = field.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    host.style.left = `${left}px`;
    host.style.width = `${width}px`;
    const below = r.bottom + 6;
    const height = host.offsetHeight || 0;
    host.style.top = `${below + height > window.innerHeight && r.top - height - 6 > 0 ? r.top - height - 6 : below}px`;
    menu.raf = requestAnimationFrame(positionMenu);
  }

  function showMenu(field: HTMLInputElement, heading: string, items: MenuItem[]) {
    closeMenu();
    const host = document.createElement('securevault-menu');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;

    const card = el('div', 'card menu');
    card.setAttribute('role', 'listbox');
    // Keep focus in the page field while interacting with the menu.
    card.addEventListener('mousedown', (e) => e.preventDefault());

    const head = el('div', 'menu-head');
    const brand = el('span', 'brand');
    brand.innerHTML = LOGO_SVG; // static markup, no page data
    brand.append(el('span', '', heading));
    const close = el('button', 'icon-btn');
    close.setAttribute('aria-label', 'Close');
    close.append(icon(X, 14));
    close.addEventListener('click', () => {
      dismissedFor.add(field);
      closeMenu();
    });
    head.append(brand, close);
    card.append(head);

    const rows = items.map((item, i) => {
      const row = el('div', 'item');
      row.setAttribute('role', 'option');
      const text = el('span', 'item-text');
      text.append(el('span', `item-title${item.mono ? ' mono' : ''}`, item.title));
      if (item.subtitle) text.append(el('span', 'item-sub', item.subtitle));
      row.append(item.icon, text);
      if (item.trailing) row.append(item.trailing);
      row.addEventListener('mouseenter', () => setActive(i));
      row.addEventListener('click', async () => {
        await item.run();
      });
      card.append(row);
      return row;
    });

    root.append(style, card);
    document.documentElement.append(host);
    menu = { host, field, items: rows, active: -1, raf: 0 };
    positionMenu();
  }

  function setActive(i: number) {
    if (!menu) return;
    menu.items.forEach((row, j) => row.classList.toggle('active', j === i));
    menu.active = i;
  }

  function monogram(title: string) {
    const m = el('span', 'mono-badge', title.trim().charAt(0).toUpperCase() || '?');
    let hash = 0;
    for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
    m.style.background = COLORS[Math.abs(hash) % COLORS.length];
    return m;
  }

  function strengthLabel(pw: string) {
    const s = calculatePasswordStrength(pw);
    return s < 40 ? 'Weak' : s < 70 ? 'Fair' : 'Strong';
  }

  async function openMenuFor(field: HTMLInputElement) {
    const kind = classify(field);
    if (!kind || dismissedFor.has(field) || Date.now() < fillingUntil) return;
    const info = await getPageInfo();
    if (!info || !info.settings.inlineMenu || info.status === 'signed-out') return;
    if (document.activeElement !== field) return; // focus moved on while we were asking

    if (kind === 'new-password') {
      let suggestion = generatePassword(STRONG_PASSWORD);
      const regenerate = el('button', 'icon-btn');
      regenerate.setAttribute('aria-label', 'Generate another');
      regenerate.title = 'Generate another';
      regenerate.append(icon(RefreshCw, 14));
      const items: MenuItem[] = [
        {
          icon: badge(WandSparkles),
          title: suggestion,
          subtitle: `${strengthLabel(suggestion)} · ${suggestion.length} characters · click to use`,
          mono: true,
          trailing: regenerate,
          run: () => {
            fillNewPassword(suggestion, field);
            closeMenu();
          },
        },
      ];
      regenerate.addEventListener('click', (e) => {
        e.stopPropagation();
        suggestion = generatePassword(STRONG_PASSWORD);
        menu?.items[0].querySelector('.item-title')?.replaceChildren(suggestion);
      });
      showMenu(field, 'Suggested password', items);
      return;
    }

    if (info.status === 'locked') {
      // Only interrupt on fields that are clearly part of a sign-in form.
      if (kind === 'username' && passwordsIn(scopeOf(field)).length === 0 && !/username|email/.test(field.autocomplete)) return;
      showMenu(field, 'SecureVault', [
        {
          icon: badge(LockKeyhole),
          title: 'Unlock to fill',
          subtitle: 'Your vault is locked',
          run: async () => {
            closeMenu();
            await call({ type: 'open-popup' }).catch(() => {});
          },
        },
      ]);
      return;
    }

    if (info.logins.length === 0) return;
    showMenu(
      field,
      `Logins for ${normalizeHost(location.hostname)}`,
      info.logins.map((login: LoginSummary) => ({
        icon: monogram(login.title),
        title: login.username || login.title,
        subtitle: login.username ? login.title : 'No username',
        trailing: icon(KeyRound, 14),
        run: async () => {
          closeMenu();
          try {
            const creds = await call<{ username: string; password: string }>({ type: 'fill-request', id: login.id });
            fillLogin(creds.username, creds.password, field);
          } catch {
            /* vault locked meanwhile, or site mismatch */
          }
        },
      }))
    );
  }

  document.addEventListener(
    'focusin',
    (e) => {
      const target = e.target;
      if (target instanceof HTMLInputElement) {
        if (menu && menu.field !== target) closeMenu();
        setTimeout(() => openMenuFor(target), 0);
      } else closeMenu();
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target;
      if (menu && target === menu.host) return;
      if (target instanceof HTMLInputElement && target === document.activeElement && !menu) {
        dismissedFor.delete(target); // clicking a field again re-opens the menu
        openMenuFor(target);
      } else if (menu && target !== menu.field) closeMenu();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!menu || e.target !== menu.field) return;
      const n = menu.items.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((menu.active + 1) % n);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((menu.active - 1 + n) % n);
      } else if (e.key === 'Enter' && menu.active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        menu.items[menu.active].click();
      } else if (e.key === 'Escape') {
        dismissedFor.add(menu.field);
        closeMenu();
      } else if (e.key === 'Tab') {
        closeMenu();
      }
    },
    true
  );

  // Typing in a field hides the menu; the user is entering something by hand.
  document.addEventListener('input', (e) => {
    if (menu && e.target === menu.field && e.isTrusted) closeMenu();
  }, true);

  // ===========================================================================
  // Capturing submitted logins
  // ===========================================================================
  const SUBMIT_TEXT = /log\s?in|sign\s?in|sign\s?up|continue|next|submit|register|create|save|change|update|reset|join/i;
  let lastCapture = { key: '', at: 0 };

  function filledPasswordField(scope: ParentNode): HTMLInputElement | null {
    // On sign-up / change-password forms the last filled field is the new password.
    return passwordsIn(scope).filter((el) => el.value).at(-1) ?? null;
  }

  function capture(scope: ParentNode) {
    const password = filledPasswordField(scope);
    if (!password) return;
    const login: CapturedLogin = {
      url: location.origin + location.pathname,
      hostname: normalizeHost(location.hostname),
      username: usernameFieldFor(password, true)?.value.trim() ?? '',
      password: password.value,
    };
    const key = `${login.username}\u0000${login.password}`;
    if (key === lastCapture.key && Date.now() - lastCapture.at < 5000) return;
    lastCapture = { key, at: Date.now() };
    closeMenu();

    call<{ show: boolean; mode?: SaveMode }>({ type: 'login-captured', login })
      .then((res) => {
        if (res.show) showSavePrompt(login.hostname, login.username, res.mode ?? 'save');
      })
      .catch(() => {});
  }

  function isSubmitLike(button: Element): boolean {
    if (button instanceof HTMLButtonElement && button.form) return button.type === 'submit';
    if (button instanceof HTMLInputElement) return button.type === 'submit' || SUBMIT_TEXT.test(button.value);
    return SUBMIT_TEXT.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`);
  }

  document.addEventListener('submit', (e) => capture(e.target as HTMLFormElement), true);
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]');
      if (button && isSubmitLike(button)) capture(button.closest('form') ?? document);
    },
    true
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && !menu && e.target instanceof HTMLInputElement) capture(scopeOf(e.target));
    },
    true
  );

  // A login captured just before navigating is offered again on the next page (top frame only).
  if (isTop) call<{ hostname: string; username: string; mode: SaveMode } | null>({ type: 'get-pending' })
    .then((p) => p && showSavePrompt(p.hostname, p.username, p.mode))
    .catch(() => {});

  // ===========================================================================
  // Save prompt
  // ===========================================================================
  let prompt: HTMLElement | null = null;
  let promptTimer: ReturnType<typeof setTimeout> | undefined;

  function closePrompt() {
    clearTimeout(promptTimer);
    prompt?.remove();
    prompt = null;
  }

  function showSavePrompt(hostname: string, username: string, mode: SaveMode) {
    closePrompt();
    prompt = document.createElement('securevault-prompt');
    prompt.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;';
    const root = prompt.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;

    const card = el('div', 'card prompt');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'SecureVault');

    const header = el('div', 'prompt-head');
    const logo = el('span', 'logo');
    logo.innerHTML = LOGO_SVG.replace('width="16" height="16"', 'width="28" height="28"');
    const titles = el('div', 'titles');
    titles.append(
      el('p', 'title', mode === 'update' ? 'Update saved password?' : 'Save this login?'),
      el('p', 'sub', `SecureVault · ${hostname}`)
    );
    const close = el('button', 'icon-btn');
    close.setAttribute('aria-label', 'Close');
    close.append(icon(X, 16));
    header.append(logo, titles, close);

    const body = el('div', 'body');
    body.append(el('span', 'label', 'Username'), el('span', 'value', username || 'No username detected'));

    const actions = el('div', 'actions');
    const never = el('button', 'link', 'Never for this site');
    const later = el('button', 'btn secondary', 'Not now');
    const save = el('button', 'btn primary', mode === 'update' ? 'Update' : 'Save');
    actions.append(mode === 'save' ? never : el('span'), el('span', 'spacer'), later, save);

    card.append(header, body, actions);
    root.append(style, card);
    document.documentElement.append(prompt);

    const finish = (message: string, ok = true) => {
      body.replaceChildren(icon(ok ? Check : LockKeyhole, 15), el('span', 'value wide', message));
      body.classList.toggle('done', ok);
      actions.replaceChildren();
      clearTimeout(promptTimer);
      promptTimer = setTimeout(closePrompt, ok ? 2500 : 8000);
    };

    const dismiss = () => {
      call({ type: 'dismiss-pending' }).catch(() => {});
      closePrompt();
    };
    close.addEventListener('click', dismiss);
    later.addEventListener('click', dismiss);
    never.addEventListener('click', () => {
      call({ type: 'never-save', hostname }).catch(() => {});
      closePrompt();
    });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const { result } = await call<{ result: string }>({ type: 'save-pending' });
        if (result === 'added') finish('Saved to SecureVault');
        else if (result === 'updated') finish('Password updated');
        else if (result === 'unchanged') finish('Already saved');
        else if (result === 'click-icon') finish('Click the SecureVault icon in your toolbar to unlock and finish saving.', false);
        else closePrompt(); // 'unlocking' (popup opened) or 'expired'
      } catch (err) {
        finish((err as Error).message, false);
      }
    });

    const schedule = () => {
      clearTimeout(promptTimer);
      promptTimer = setTimeout(closePrompt, 30000);
    };
    card.addEventListener('mouseenter', () => clearTimeout(promptTimer));
    card.addEventListener('mouseleave', schedule);
    schedule();
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(node: IconNode, size: number) {
    return lucide(node, { width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true' });
  }

  function badge(node: IconNode) {
    const b = el('span', 'icon-badge');
    b.append(icon(node, 15));
    return b;
  }
}

const COLORS = ['#1d4ed8', '#0f766e', '#6d28d9', '#be123c', '#b45309', '#0369a1', '#4d7c0f', '#475569'];

const LOGO_SVG =
  '<svg viewBox="0 0 128 128" width="16" height="16" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#1d4ed8"/><circle cx="64" cy="53" r="19" fill="#fff"/><path d="M55.5 62h17l6.2 31.2a4 4 0 0 1-3.9 4.8H53.2a4 4 0 0 1-3.9-4.8z" fill="#fff"/></svg>';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; }
.card {
  --bg: #fff; --fg: #0f172a; --muted: #5b6577; --subtle: #8a93a3; --border: #e3e6eb; --soft: #f1f3f6;
  --hover: #eef2fb; --accent: #1d4ed8; --accent-hover: #1e40af; --success: #15803d;
  background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, .16), 0 2px 6px rgba(15, 23, 42, .06);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  animation: in .12s ease-out;
}
@media (prefers-color-scheme: dark) {
  .card { --bg: #151b27; --fg: #e6e9ef; --muted: #9aa4b5; --subtle: #6b7587; --border: #2a3445; --soft: #1b2331;
    --hover: #1f2a3d; --accent: #3b6cf6; --accent-hover: #5b84f7; --success: #4ade80; }
}
@keyframes in { from { opacity: 0; transform: translateY(-3px); } }
button { font: inherit; color: inherit; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.icon-btn { all: unset; display: inline-flex; padding: 5px; border-radius: 6px; color: var(--muted); cursor: pointer; }
.icon-btn:hover { background: var(--soft); color: var(--fg); }

/* Inline menu */
.menu { padding: 4px; max-height: min(320px, calc(100vh - 16px)); overflow-y: auto; }
.menu-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 4px 8px; }
.brand { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 7px; cursor: pointer; }
.item.active, .item:hover { background: var(--hover); }
.item > svg { color: var(--subtle); flex-shrink: 0; }
.item-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.item-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-title.mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12.5px; letter-spacing: .01em; }
.item-sub { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono-badge, .icon-badge { width: 28px; height: 28px; flex-shrink: 0; border-radius: 7px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: #fff; }
.icon-badge { background: var(--soft); color: var(--accent); }

/* Save prompt */
.prompt { width: 340px; padding: 14px; }
.prompt-head { display: flex; gap: 10px; align-items: center; }
.logo { display: flex; flex-shrink: 0; }
.titles { flex: 1; min-width: 0; }
.title { font-weight: 600; font-size: 14px; }
.sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt-head .icon-btn { align-self: flex-start; }
.body { margin-top: 12px; padding: 8px 10px; border-radius: 8px; background: var(--soft); display: flex; gap: 10px; align-items: center; }
.body.done { color: var(--success); }
.label { color: var(--muted); font-size: 12px; flex-shrink: 0; }
.value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.value.wide { white-space: normal; }
.actions { margin-top: 12px; display: flex; gap: 8px; align-items: center; }
.actions:empty { display: none; }
.spacer { flex: 1; }
.btn { all: unset; height: 30px; padding: 0 12px; border-radius: 7px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .6; cursor: default; }
.btn.secondary { border: 1px solid var(--border); }
.btn.secondary:hover { background: var(--soft); }
.link { all: unset; color: var(--muted); font-size: 12px; cursor: pointer; }
.link:hover { color: var(--fg); text-decoration: underline; }
`;
