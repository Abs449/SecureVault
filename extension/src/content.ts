// SecureVault content script.
// - Detects login submissions and offers to save them.
// - Fills credentials when the popup asks (only on a matching site).
// - Inserts generated passwords from the context menu.

import { X, createElement as lucide } from 'lucide';
import type { BackgroundMessage, CapturedLogin, ContentMessage } from './lib/shared';
import { hostsMatch, normalizeHost } from './lib/shared';

declare global {
  interface Window {
    __secureVaultLoaded?: boolean;
  }
}

if (!window.__secureVaultLoaded) {
  window.__secureVaultLoaded = true;
  main();
}

function main() {
  // ---------------------------------------------------------------------------
  // Field discovery
  // ---------------------------------------------------------------------------
  const USERNAME_HINT = /user|email|login|account|identifier|phone/i;

  const isVisible = (el: HTMLElement) =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  const isUsable = (el: HTMLInputElement) => isVisible(el) && !el.disabled && !el.readOnly;

  const isTextLike = (el: HTMLInputElement) => ['text', 'email', 'tel', ''].includes(el.type);

  function inputsIn(scope: ParentNode): HTMLInputElement[] {
    return Array.from(scope.querySelectorAll('input'));
  }

  function scopeOf(field: HTMLElement): ParentNode {
    return field.closest('form') ?? document;
  }

  /** Best username field for a password field: hinted inputs first, then the nearest text input before it. */
  function usernameFieldFor(password: HTMLInputElement, requireValue: boolean): HTMLInputElement | null {
    const all = inputsIn(scopeOf(password));
    const before = all.slice(0, Math.max(all.indexOf(password), 0));
    const candidates = before.filter(
      (el) => isTextLike(el) && isVisible(el) && (!requireValue || el.value.trim() !== '')
    );
    const hinted = candidates.filter(
      (el) =>
        /username|email/.test(el.autocomplete) ||
        el.type === 'email' ||
        USERNAME_HINT.test(el.name) ||
        USERNAME_HINT.test(el.id)
    );
    return hinted.at(-1) ?? candidates.at(-1) ?? null;
  }

  function filledPasswordField(scope: ParentNode): HTMLInputElement | null {
    // On sign-up / change-password forms the last filled field is the new password.
    const fields = inputsIn(scope).filter((el) => el.type === 'password' && el.value && isVisible(el));
    return fields.at(-1) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------
  let lastCapture = { key: '', at: 0 };

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

    send<{ show: boolean }>({ type: 'login-captured', login }).then((res) => {
      if (res?.show) showPrompt(login.hostname, login.username);
    });
  }

  document.addEventListener('submit', (e) => capture(e.target as HTMLFormElement), true);

  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.(
        'button, input[type="submit"], input[type="button"], [role="button"]'
      );
      if (button && isSubmitLike(button)) capture(button.closest('form') ?? document);
    },
    true
  );

  const SUBMIT_TEXT = /log\s?in|sign\s?in|sign\s?up|continue|next|submit|register|create|save|change|update|reset/i;

  /** Ignore unrelated buttons such as "show password" toggles. */
  function isSubmitLike(button: Element): boolean {
    if (button instanceof HTMLButtonElement && button.form) return button.type === 'submit';
    if (button instanceof HTMLInputElement) return button.type === 'submit' || SUBMIT_TEXT.test(button.value);
    const label = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`;
    return SUBMIT_TEXT.test(label);
  }

  document.addEventListener(
    'keydown',
    (e) => {
      const target = e.target as HTMLInputElement;
      if (e.key === 'Enter' && target instanceof HTMLInputElement) capture(scopeOf(target));
    },
    true
  );

  // A login captured just before navigation is shown again on the next page.
  send<{ hostname: string; username: string } | null>({ type: 'get-pending' }).then((pending) => {
    if (pending) showPrompt(pending.hostname, pending.username);
  });

  // ---------------------------------------------------------------------------
  // Fill
  // ---------------------------------------------------------------------------
  function setValue(input: HTMLInputElement, value: string) {
    // Use the native setter so frameworks (React, Vue…) notice the change.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fill(username: string, password: string): boolean {
    const passwordField = inputsIn(document).find((el) => el.type === 'password' && isUsable(el));
    if (passwordField) {
      const userField = usernameFieldFor(passwordField, false);
      if (userField && username) setValue(userField, username);
      setValue(passwordField, password);
      return true;
    }
    // Username-first sign-in pages (password asked on the next step).
    const userField = inputsIn(document).find(
      (el) =>
        isTextLike(el) &&
        isUsable(el) &&
        (/username|email/.test(el.autocomplete) || el.type === 'email' || USERNAME_HINT.test(el.name) || USERNAME_HINT.test(el.id))
    );
    if (userField && username) {
      setValue(userField, username);
      return true;
    }
    return false;
  }

  function insertPassword(password: string) {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || !isUsable(active)) return;
    setValue(active, password);
    // Fill an empty "confirm password" field in the same form as well.
    if (active.type === 'password') {
      inputsIn(scopeOf(active))
        .filter((el) => el !== active && el.type === 'password' && !el.value && isUsable(el))
        .forEach((el) => setValue(el, password));
      active.focus();
    }
  }

  chrome.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message.type === 'fill') {
      // Re-check the site here in case the tab navigated after the popup opened.
      if (!hostsMatch(location.hostname, message.hostname)) {
        sendResponse({ filled: false, reason: 'site-mismatch' });
      } else {
        sendResponse({ filled: fill(message.username, message.password) });
      }
    } else if (message.type === 'insert-password') {
      insertPassword(message.password);
      sendResponse({ ok: true });
    }
    return false;
  });

  // ---------------------------------------------------------------------------
  // Save prompt (closed shadow root so the page can neither style nor read it)
  // ---------------------------------------------------------------------------
  let promptHost: HTMLElement | null = null;
  let autoHide: ReturnType<typeof setTimeout> | undefined;

  function closePrompt() {
    clearTimeout(autoHide);
    promptHost?.remove();
    promptHost = null;
  }

  function showPrompt(hostname: string, username: string) {
    closePrompt();
    promptHost = document.createElement('securevault-prompt');
    promptHost.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;';
    const root = promptHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = PROMPT_CSS;

    const card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Save login to SecureVault');

    const header = el('div', 'header');
    const logo = el('span', 'logo');
    logo.innerHTML = LOGO_SVG; // static markup, no page data
    const titles = el('div', 'titles');
    titles.append(el('p', 'title', 'Save this login?'), el('p', 'sub', `SecureVault · ${hostname}`));
    const close = el('button', 'close');
    close.setAttribute('aria-label', 'Close');
    close.append(lucide(X, { width: 16, height: 16, 'stroke-width': 2 }));
    header.append(logo, titles, close);

    const body = el('div', 'body');
    body.append(el('span', 'label', 'Username'), el('span', 'value', username || 'No username detected'));

    const actions = el('div', 'actions');
    const never = el('button', 'link', 'Never for this site');
    const later = el('button', 'btn secondary', 'Not now');
    const save = el('button', 'btn primary', 'Save');
    actions.append(never, el('span', 'spacer'), later, save);

    card.append(header, body, actions);
    root.append(style, card);
    document.documentElement.append(promptHost);

    const dismiss = () => {
      send({ type: 'dismiss-pending' });
      closePrompt();
    };
    close.addEventListener('click', dismiss);
    later.addEventListener('click', dismiss);
    never.addEventListener('click', () => {
      send({ type: 'never-save', hostname });
      closePrompt();
    });
    save.addEventListener('click', async () => {
      save.disabled = true;
      const res = await send<{ opened: boolean }>({ type: 'save-pending' });
      if (res?.opened) {
        closePrompt();
        return;
      }
      body.replaceChildren(el('span', 'value wide', 'Click the SecureVault icon in your toolbar to finish saving.'));
      actions.replaceChildren(el('span', 'spacer'), Object.assign(el('button', 'btn secondary', 'OK'), { onclick: closePrompt }));
    });

    // Leave the prompt up while the pointer is over it.
    const schedule = () => {
      clearTimeout(autoHide);
      autoHide = setTimeout(closePrompt, 20000);
    };
    card.addEventListener('mouseenter', () => clearTimeout(autoHide));
    card.addEventListener('mouseleave', schedule);
    schedule();
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function send<T = unknown>(message: BackgroundMessage): Promise<T | null> {
    return chrome.runtime.sendMessage(message).catch(() => null) as Promise<T | null>;
  }
}

const LOGO_SVG =
  '<svg viewBox="0 0 128 128" width="28" height="28" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#1d4ed8"/><circle cx="64" cy="53" r="19" fill="#fff"/><path d="M55.5 62h17l6.2 31.2a4 4 0 0 1-3.9 4.8H53.2a4 4 0 0 1-3.9-4.8z" fill="#fff"/></svg>';

const PROMPT_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; }
.card {
  --bg: #fff; --fg: #0f172a; --muted: #5b6577; --border: #e3e6eb; --soft: #f1f3f6; --accent: #1d4ed8; --accent-hover: #1e40af;
  width: 340px; padding: 14px; border-radius: 12px; background: var(--bg); color: var(--fg);
  border: 1px solid var(--border); box-shadow: 0 12px 32px rgba(15, 23, 42, .18);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  animation: in .16s ease-out;
}
@media (prefers-color-scheme: dark) {
  .card { --bg: #121823; --fg: #e6e9ef; --muted: #9aa4b5; --border: #2a3445; --soft: #1b2331; --accent: #3b6cf6; --accent-hover: #5b84f7; }
}
@keyframes in { from { opacity: 0; transform: translateY(-4px); } }
.header { display: flex; gap: 10px; align-items: center; }
.logo { display: flex; flex-shrink: 0; }
.titles { flex: 1; min-width: 0; }
.title { font-weight: 600; font-size: 14px; }
.sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.close { all: unset; display: flex; padding: 6px; border-radius: 6px; color: var(--muted); cursor: pointer; align-self: flex-start; }
.close:hover { background: var(--soft); color: var(--fg); }
.body { margin-top: 12px; padding: 8px 10px; border-radius: 8px; background: var(--soft); display: flex; gap: 10px; align-items: baseline; }
.label { color: var(--muted); font-size: 12px; flex-shrink: 0; }
.value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.value.wide { white-space: normal; font-weight: 400; }
.actions { margin-top: 12px; display: flex; gap: 8px; align-items: center; }
.spacer { flex: 1; }
.btn { all: unset; height: 30px; padding: 0 12px; border-radius: 7px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .6; cursor: default; }
.btn.secondary { border: 1px solid var(--border); color: var(--fg); }
.btn.secondary:hover { background: var(--soft); }
.link { all: unset; color: var(--muted); font-size: 12px; cursor: pointer; }
.link:hover { color: var(--fg); text-decoration: underline; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;
