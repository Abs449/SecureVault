// First-run page: pin the extension, sign in, learn the basics.
import './welcome.css';
import { Check, Command, KeyRound, MousePointerClick, Pin, Puzzle, Save, WandSparkles, createElement as lucide, type IconNode } from 'lucide';
import { h } from './lib/dom';
import { logoMark } from './lib/brand';
import { StatusInfo, call } from './lib/shared';

declare const __APP_URL__: string;

const icon = (node: IconNode, size = 18) => lucide(node, { width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true' });
const isMac = navigator.userAgent.includes('Mac');

const pinState = h('div', { class: 'state' });
const signInState = h('div', { class: 'state' });

function done(text: string) {
  return h('span', { class: 'done' }, icon(Check, 16), text);
}

let lastPin: boolean | null = null;
async function refreshPin() {
  const { isOnToolbar } = await chrome.action.getUserSettings();
  if (isOnToolbar === lastPin) return;
  lastPin = isOnToolbar;
  pinState.replaceChildren(
    isOnToolbar
      ? done('Pinned to your toolbar')
      : h(
          'p',
          { class: 'hint' },
          'Click ',
          h('span', { class: 'kbd' }, icon(Puzzle, 14)),
          ' in the toolbar, then ',
          h('span', { class: 'kbd' }, icon(Pin, 14)),
          ' next to SecureVault.'
        )
  );
}

let lastSignIn: string | null = null;
async function refreshSignIn() {
  const info = await call<StatusInfo>({ type: 'status' }).catch(() => null);
  const key = info && info.status !== 'signed-out' ? `in:${info.email}` : 'out';
  if (key === lastSignIn) return;
  lastSignIn = key;
  if (info && info.status !== 'signed-out') {
    signInState.replaceChildren(done(`Signed in as ${info.email}`));
    return;
  }
  const open = h('button', { class: 'btn primary', type: 'button' }, 'Sign in');
  open.addEventListener('click', () => chrome.action.openPopup().catch(() => alert('Click the SecureVault icon in your toolbar to sign in.')));
  signInState.replaceChildren(open);
  if (__APP_URL__) {
    signInState.append(
      h('a', { class: 'link', href: new URL('/register', __APP_URL__).href, target: '_blank', rel: 'noopener' }, 'No account yet? Create one')
    );
  }
}

const step = (n: number, title: string, body: string, state: Node) =>
  h('li', { class: 'step' }, h('span', { class: 'num' }, String(n)), h('div', null, h('h2', null, title), h('p', null, body), state));

const feature = (node: IconNode, title: string, body: Node | string) =>
  h('li', { class: 'feature' }, h('span', { class: 'feature-icon' }, icon(node)), h('div', null, h('h3', null, title), h('p', null, body)));

document.getElementById('app')!.replaceChildren(
  h('header', { class: 'brand' }, logoMark(28), h('span', null, 'SecureVault')),
  h(
    'main',
    null,
    h('h1', null, 'SecureVault is installed'),
    h('p', { class: 'lead' }, 'Two quick steps and your logins will be ready on every site.'),
    h(
      'ol',
      { class: 'steps' },
      step(1, 'Pin it to the toolbar', 'Keeps SecureVault one click away and shows when it has something to save.', pinState),
      step(2, 'Sign in', 'Use the email, account password and master password from the SecureVault web app.', signInState)
    ),
    h('h2', { class: 'section' }, 'How it works'),
    h(
      'ul',
      { class: 'features' },
      feature(MousePointerClick, 'Fills logins', 'Click into a sign-in field and pick a saved login from the list under it.'),
      feature(WandSparkles, 'Suggests strong passwords', 'On sign-up and change-password forms, use a generated password in one click.'),
      feature(Save, 'Saves as you go', 'After you sign in or sign up, SecureVault offers to save or update the login.'),
      feature(
        Command,
        'Keyboard shortcut',
        h('span', null, 'Press ', h('span', { class: 'kbd' }, isMac ? '⌘ Shift L' : 'Ctrl Shift L'), ' to fill the login for the current site.')
      ),
      feature(KeyRound, 'Right-click to generate', 'Right-click any text field and choose “Generate secure password”.')
    )
  )
);

refreshPin();
refreshSignIn();
// Pinning happens outside the page; re-check periodically and when the tab regains focus.
setInterval(refreshPin, 1500);
setInterval(refreshSignIn, 3000);
window.addEventListener('focus', () => {
  refreshPin();
  refreshSignIn();
});
