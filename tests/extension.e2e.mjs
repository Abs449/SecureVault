// End-to-end test of the Chrome extension against the Firebase project in .env.local:
// install, welcome page, popup sign-in, inline login menu + fill, strong-password suggestion,
// save and update prompts, locked-state menu, page isolation.
//
//   npm run build:extension && npm run test:extension
//
// Needs Google Chrome installed (set CHROME_PATH to override). Creates a throwaway account
// and deletes it afterwards. Screenshots go to dist/test-screenshots/.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(project, 'tests', 'fixtures');
const work = mkdtempSync(join(tmpdir(), 'sv-ext-test-'));
const shots = join(project, 'dist', 'test-screenshots');
mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
let failures = 0;
const { build } = createRequire(project + '/package.json')('esbuild');
const { loadFirebaseConfig } = await import(pathToFileURL(join(project, 'scripts', 'firebase-env.mjs')).href);
const cfg = JSON.stringify(loadFirebaseConfig(project));
const PORT = 4567;
const STORE = true; // 1280x800, light theme: the same shots are used for the Web Store listing
const PAGE = (n) => n;
const ORIGIN = `http://localhost:${PORT}`;
// A different site from ORIGIN, so Chrome runs it as an isolated cross-site iframe.
const FRAME_ORIGIN = `http://127.0.0.1:${PORT}`;

writeFileSync(join(work, 'setup.ts'), `
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import * as vault from ${JSON.stringify(join(project, 'src', 'lib', 'vault.ts').replace(/\\/g, '/'))};
declare const CFG: any;
(async () => {
  const app = initializeApp(CFG); const db = getFirestore(app);
  const { user } = await createUserWithEmailAndPassword(getAuth(app), process.argv[2], 'Acct-pass-123');
  await vault.initializeVault(db, user.uid, 'Master-Pass-2026!');
  const { key } = await vault.unlockVault(db, user.uid, 'Master-Pass-2026!');
  await vault.addEntry(db, user.uid, key, { title: 'Northwind', username: 'octocat@example.com', password: 'Very-Strong-Pass-42!', url: '${ORIGIN}', notes: '', tags: [] });
  await vault.addEntry(db, user.uid, key, { title: 'Embedded', username: 'frame@example.com', password: 'Frame-Pass-31!', url: '${FRAME_ORIGIN}', notes: '', tags: [] });
  console.log('setup: account with logins for localhost and 127.0.0.1'); process.exit(0);
})().catch((e) => { console.log('setup failed', e.code, e.message); process.exit(1); });
`);
writeFileSync(join(work, 'cleanup.ts'), "// Deletes a test account created by web.mjs, including its vault data.\nimport { initializeApp } from 'firebase/app';\nimport { deleteUser, getAuth, signInWithEmailAndPassword } from 'firebase/auth';\nimport { collection, deleteDoc, doc, getDocs, getFirestore } from 'firebase/firestore';\n\ndeclare const CFG: Record<string, string>;\nconst email = process.argv[2];\n\n(async () => {\n  const app = initializeApp(CFG);\n  const auth = getAuth(app);\n  const db = getFirestore(app);\n  const { user } = await signInWithEmailAndPassword(auth, email, 'Acct-pass-123');\n  for (const d of (await getDocs(collection(db, 'users', user.uid, 'passwords'))).docs) await deleteDoc(d.ref);\n  await deleteDoc(doc(db, 'users', user.uid, 'config', 'crypto'));\n  await deleteUser(user);\n  console.log('cleanup: deleted', email);\n  process.exit(0);\n})().catch((e) => {\n  console.log('cleanup failed:', e.code, e.message);\n  process.exit(1);\n});\n");
for (const name of ['setup', 'cleanup']) {
  await build({ entryPoints: [join(work, name + '.ts')], bundle: true, nodePaths: [join(project, 'node_modules')], platform: 'node', format: 'cjs', outfile: join(work, name + '.cjs'), logLevel: 'error', define: { CFG: cfg } });
}

const server = createServer((req, res) => {
  try {
    const body = readFileSync(join(fixtures, req.url.replace(/^\//, '').split('?')[0] || 'login.html'));
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(PORT);

const email = `sv-inline-${Date.now()}@example.com`;
console.log('test account:', email);
if (!existsSync(join(project, 'dist', 'extension', 'manifest.json'))) { console.error('Run npm run build:extension first.'); process.exit(1); }
if (spawnSync(process.execPath, [join(work, 'setup.cjs'), email], { stdio: 'inherit' }).status !== 0) process.exit(1);

const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sv-inline-'))}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--window-size=1100,760', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const out = chrome.stdio[3], inp = chrome.stdio[4];
let id = 0, buf = ''; const w = new Map(), errors = [], listeners = [];
inp.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
  if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } else listeners.forEach((l) => l(m)); } });
listeners.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(`[${m.sessionId?.slice(0, 4)}] EXCEPTION ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`[${m.sessionId?.slice(0, 4)}] ERROR ` + m.params.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0]);
});
const send = (method, params = {}, s) => new Promise((r) => { const k = ++id; w.set(k, r); out.write(JSON.stringify({ id: k, method, params, ...(s && { sessionId: s }) }) + '\0'); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (ok, l) => { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) failures++; };

/** Evaluate, wait, screenshot, type, click and pierce shadow roots within one DevTools session. */
function helpers(s) {
  const t = { s };
  t.ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, s)).result?.result?.value;
  t.waitFor = async (e, ms = 20000) => { const st = Date.now(); while (Date.now() - st < ms) { if (await t.ev(e)) return true; await sleep(250); } return false; };
  t.shot = async (name) => writeFileSync(join(shots, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, s)).result.data, 'base64'));
  t.key = async (key, code, keyCode) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode }, s); };
  t.type = async (text) => send('Input.insertText', { text }, s);
  t.clickAt = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, s); };
  t.front = () => send('Page.bringToFront', {}, s);
  /** Find an element inside (closed) shadow roots by class and return its center. */
  t.findInShadow = async (hostTag, className, textIncludes) => {
    const { result: { root } } = await send('DOM.getDocument', { depth: -1, pierce: true }, s);
    const hits = [];
    const walk = (n, inHost) => {
      const host = inHost || n.localName === hostTag;
      const cls = (n.attributes || []).reduce((a, v, i, arr) => (v === 'class' ? arr[i + 1] : a), '');
      if (host && cls.split(' ').includes(className)) hits.push(n);
      [...(n.children || []), ...(n.shadowRoots || [])].forEach((c) => walk(c, host));
    };
    walk(root, false);
    for (const n of hits) {
      const text = (await send('DOM.getOuterHTML', { nodeId: n.nodeId }, s)).result.outerHTML;
      if (textIncludes && !text.includes(textIncludes)) continue;
      const q = (await send('DOM.getBoxModel', { nodeId: n.nodeId }, s)).result?.model?.content;
      if (q) return { x: (q[0] + q[2]) / 2, y: (q[1] + q[5]) / 2 };
    }
    return null;
  };
  return t;
}

async function openTab(url, width = STORE ? 1280 : 1100, height = STORE ? 800 : 760) {
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const s = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
  await send('Runtime.enable', {}, s); await send('Page.enable', {}, s);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, s);
  if (STORE) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, s);
  await send('Page.navigate', { url }, s);
  const t = helpers(s);
  t.targetId = targetId;
  return t;
}

try {
  const extId = (await send('Extensions.loadUnpacked', { path: join(project, 'dist', 'extension') })).result?.id;
  step(Boolean(extId), 'extension installs');
  await sleep(1500);
  const { result: { targetInfos } } = await send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId));
  step(Boolean(sw), 'background service worker running');
  if (sw) {
    const swS = (await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).result.sessionId;
    await send('Runtime.enable', {}, swS);
  }
  const welcomeTarget = targetInfos.find((t) => t.url.endsWith('/welcome.html'));
  step(Boolean(welcomeTarget), 'welcome page opens on install');

  const welcome = await openTab(`chrome-extension://${extId}/welcome.html`, STORE ? 1280 : 1100, STORE ? 800 : 900);
  step(await welcome.waitFor(`document.body.innerText.includes('SecureVault is installed')`), 'welcome page renders');
  await sleep(500); await welcome.shot('ext-welcome');

  // Sign in through the popup (which goes through the background engine).
  const popup = await openTab(`chrome-extension://${extId}/popup.html`, 360, 540);
  await popup.waitFor(`!!document.querySelector('input[type=email]')`);
  await popup.ev(`(() => { const f = document.querySelectorAll('input'); f[0].value = ${JSON.stringify(email)}; f[1].value = 'Acct-pass-123'; f[2].value = 'Master-Pass-2026!'; document.querySelector('form').requestSubmit(); })()`);
  step(await popup.waitFor(`document.body.innerText.includes('octocat@example.com')`, 30000), 'popup sign-in via background engine, vault decrypted');

  // ---- Login page: inline menu lists the saved login; keyboard selects and fills it.
  const login = await openTab(`${ORIGIN}/${PAGE('login.html')}`);
  await login.waitFor(`document.readyState === 'complete'`); await sleep(800); await login.front();
  await login.ev(`document.getElementById('user').focus()`);
  await sleep(1200);
  const loginItem = await login.findInShadow('securevault-menu', 'item');
  step(Boolean(loginItem), 'inline menu appears under the username field');
  await login.shot('ext-inline-login');
  await login.key('ArrowDown', 'ArrowDown', 40); await login.key('Enter', 'Enter', 13);
  step(await login.waitFor(`document.getElementById('user').value === 'octocat@example.com' && document.getElementById('pass').value === 'Very-Strong-Pass-42!'`, 5000), 'choosing the login fills username + password');
  await sleep(800);
  step(!(await login.findInShadow('securevault-menu', 'item')), 'menu stays closed after filling');
  // Submitting the same credentials must NOT prompt to save again.
  await login.ev(`document.querySelector('#f button').click()`); await sleep(1500);
  step(!(await login.findInShadow('securevault-prompt', 'prompt')), 'no save prompt for an already-saved login');

  // ---- Sign-up page: strong password suggestion fills both fields, then save prompt saves it.
  const signup = await openTab(`${ORIGIN}/${PAGE('signup.html')}`);
  await signup.waitFor(`document.readyState === 'complete'`); await sleep(800); await signup.front();
  await signup.ev(`document.getElementById('user').focus()`); await signup.type('jordan.lee');
  await signup.ev(`document.getElementById('pass').focus()`); await sleep(1200);
  const suggestion = await signup.findInShadow('securevault-menu', 'item');
  step(Boolean(suggestion), 'strong-password suggestion appears on the new-password field');
  await signup.shot('ext-inline-signup');
  await signup.clickAt(suggestion.x, suggestion.y);
  const pw = await signup.ev(`(() => { const a = document.getElementById('pass').value, b = document.getElementById('confirm').value; return a === b && a.length === 20 ? a : null; })()`);
  step(Boolean(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw), 'suggested 20-char password fills password + confirm');
  await sleep(800);
  step(!(await signup.findInShadow('securevault-menu', 'item')), 'menu stays closed after using the suggestion');
  await signup.ev(`document.querySelector('#f button').click()`); await sleep(1500);
  const saveBtn = await signup.findInShadow('securevault-prompt', 'primary');
  step(Boolean(saveBtn), 'save prompt appears after sign-up');
  await signup.shot('ext-save-prompt');
  if (saveBtn) await signup.clickAt(saveBtn.x, saveBtn.y);
  await sleep(2500);
  await signup.shot('ext-save-done');
  const list = await popup.ev(`chrome.runtime.sendMessage({ type: 'list' })`);
  const saved = list?.data?.find((e) => e.username === 'jordan.lee');
  step(saved?.password === pw, 'new login saved to the encrypted vault from the page');

  // ---- Change the password on the login page -> prompt offers to UPDATE.
  await login.front();
  await login.ev(`(() => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(document.getElementById('pass'), 'Changed-Pass-77!'); })()`);
  await login.ev(`document.querySelector('#f button').click()`); await sleep(1500);
  const updateBtn = await login.findInShadow('securevault-prompt', 'primary', 'Update');
  step(Boolean(updateBtn), 'changed password -> "Update saved password?" prompt');
  await login.shot('ext-update-prompt');
  if (updateBtn) await login.clickAt(updateBtn.x, updateBtn.y);
  await sleep(2500);
  const list2 = await popup.ev(`chrome.runtime.sendMessage({ type: 'list' })`);
  step(list2?.data?.find((e) => e.username === 'octocat@example.com')?.password === 'Changed-Pass-77!', 'saved password updated in the vault');

  // ---- Cross-site iframe: menu inside the frame, fill, and the save prompt relayed to the top page.
  const embed = await openTab(`${ORIGIN}/embed.html`);
  await embed.waitFor(`document.readyState === 'complete'`); await embed.front();
  const frameSession = new Promise((res) => listeners.push((m) => {
    if (m.method === 'Target.attachedToTarget' && m.sessionId === embed.s && m.params.targetInfo.url.startsWith(FRAME_ORIGIN)) res(m.params.sessionId);
  }));
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, embed.s);
  const fs = await Promise.race([frameSession, sleep(10000).then(() => null)]);
  step(Boolean(fs), 'login iframe runs as an isolated cross-site frame');
  if (fs) {
    await send('Runtime.enable', {}, fs);
    const frame = helpers(fs);
    await frame.waitFor(`document.readyState === 'complete'`); await sleep(800);
    // Real click on the field (page coordinates = iframe offset + field position in the frame).
    const off = await embed.ev(`(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
    const pos = await frame.ev(`(() => { const r = document.getElementById('user').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await embed.clickAt(off.x + pos.x, off.y + pos.y); await sleep(1500);
    step(Boolean(await frame.findInShadow('securevault-menu', 'item', 'frame@example.com')), 'inline menu inside the iframe lists the frame site\u2019s login');
    step(!(await frame.findInShadow('securevault-menu', 'item', 'octocat@example.com')), 'the top page\u2019s logins are not offered inside the iframe');
    await embed.shot('ext-iframe-menu');
    await embed.key('ArrowDown', 'ArrowDown', 40); await embed.key('Enter', 'Enter', 13);
    step(await frame.waitFor(`document.getElementById('user').value === 'frame@example.com' && document.getElementById('pass').value === 'Frame-Pass-31!'`, 5000), 'choosing it fills the fields inside the iframe');
    await frame.ev(`(() => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(document.getElementById('pass'), 'Frame-New-Pass-88!'); document.querySelector('#f button').click(); })()`);
    await sleep(1500);
    const relayed = await embed.findInShadow('securevault-prompt', 'primary', 'Update');
    step(Boolean(relayed), 'password changed in the iframe -> prompt shown on the top page');
    await embed.shot('ext-iframe-prompt');
    if (relayed) await embed.clickAt(relayed.x, relayed.y);
    await sleep(2500);
    const list3 = await popup.ev(`chrome.runtime.sendMessage({ type: 'list' })`);
    step(list3?.data?.find((e) => e.username === 'frame@example.com')?.password === 'Frame-New-Pass-88!', 'iframe login updated in the vault');
  }

  // ---- Locked vault: menu offers to unlock instead of leaking anything.
  await popup.ev(`chrome.runtime.sendMessage({ type: 'lock' })`);
  const fresh = await openTab(`${ORIGIN}/${PAGE('login.html')}`);
  await fresh.waitFor(`document.readyState === 'complete'`); await sleep(800); await fresh.front();
  await fresh.ev(`document.getElementById('pass').focus()`); await sleep(1200);
  step(Boolean(await fresh.findInShadow('securevault-menu', 'item', 'Unlock to fill')), 'locked vault -> menu shows "Unlock to fill"');
  await fresh.shot('ext-inline-locked');
  const leaked = await fresh.ev(`chrome?.runtime?.sendMessage ? 'page can message' : 'isolated'`);
  step(leaked === 'isolated', 'page scripts cannot reach the extension messaging API');

  step(errors.length === 0, 'no errors in pages, popup or service worker' + (errors.length ? ':\n  ' + errors.join('\n  ') : ''));
} catch (e) { failures++; console.log('FAIL  driver error', e); }
finally {
  chrome.kill(); server.close();
  spawnSync(process.execPath, [join(work, 'cleanup.cjs'), email], { stdio: 'inherit' });
  rmSync(work, { recursive: true, force: true });
  console.log(failures ? `
${failures} check(s) failed` : `
All checks passed. Screenshots: ${shots}`);
  process.exit(failures ? 1 : 0);
}
