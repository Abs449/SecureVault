# Chrome Web Store submission: SecureVault Password Manager

Everything the Chrome Web Store developer dashboard asks for, ready to paste.
Upload package: `dist/securevault-<version>-webstore.zip` (from `npm run build:extension`).

## Before you submit

1. Register a developer account at <https://chrome.google.com/webstore/devconsole>
   (one-time fee, and verify your contact email).
2. Deploy the web app and set `NEXT_PUBLIC_APP_URL` in `.env.local` to its address, then
   rebuild. The extension uses it for "Create account" / "Open web vault" links and as the
   listing homepage.
3. Make sure `https://<your-app>/privacy` is reachable. That is the privacy policy URL.
4. In Firebase Console → Authentication → Settings → Authorized domains, add your web
   app's domain. In Google Cloud Console → Credentials, restrict the API key to the
   Identity Toolkit and Cloud Firestore APIs.

## Store listing tab

**Name:** SecureVault Password Manager

**Summary (≤132 chars):**
Fill, save and generate passwords. Your vault is encrypted on your device with AES-256 and only you hold the key.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
SecureVault is a password manager that encrypts your vault on your own device. Your master password never leaves your computer, so nobody else, including us, can read your saved logins.

FILL LOGINS
Click into a sign-in field and pick from the logins saved for that site. Or press Ctrl+Shift+L (⌘+Shift+L on Mac) to fill the most recent one.

SUGGEST STRONG PASSWORDS
On sign-up and change-password forms, SecureVault offers a strong 20-character password and fills it into both the password and confirmation fields.

SAVE AS YOU GO
After you sign in or create an account, SecureVault offers to save the login, or to update it if the password changed. Choose "Never for this site" to stop asking.

MADE TO BE SAFE
• AES-256 encryption with a key derived from your master password (PBKDF2)
• Logins are only offered and filled on the site they were saved for. Lookalike domains don't match.
• Auto-locks after a period of inactivity you choose
• Suggestions and prompts are isolated from the page, so websites can't read or restyle them
• No ads, no analytics, no tracking

SecureVault works with the SecureVault web app, where you create your account and manage your vault from any computer.
```

**Graphics:**
- Store icon: `extension/icons/icon128.png`
- Screenshots (1280×800): `store/screenshots/*.png`
- Small promo tile (440×280): `store/promo-small.png`

## Privacy practices tab

**Single purpose:**
Store the user's website logins in an encrypted vault, and fill, save and generate passwords on websites.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves extension settings and the list of sites where the user chose "Never save". Holds the vault key in memory-only session storage while the vault is unlocked. |
| `alarms` | Checks once a minute whether the vault should auto-lock after the user's chosen period of inactivity. |
| `contextMenus` | Adds "Generate secure password" to the right-click menu of text fields. |
| `activeTab` | Reads the current tab's address when the user opens the popup, to show and fill the logins saved for that site. |
| `scripting` | Injects the fill script into a tab that was already open before the extension was installed, only when the user clicks Fill. |
| Host permission (content script on http/https pages and their frames) | A password manager has to detect login and sign-up forms on the sites the user visits, including sign-in forms embedded in iframes, show saved logins and password suggestions under those fields, fill them when asked, and offer to save submitted logins. Nothing is collected or sent from pages unless the user chooses to save a login. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage:** tick the following, and certify the three disclosures at the bottom of the form.
- **Personally identifiable information:** email address (account sign-in).
- **Authentication information:** passwords and usernames the user saves, stored end-to-end encrypted.
- **Website content:** not collected. Form fields are read locally, and only a login the user chooses to save is stored, encrypted.

Certify:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://<your-app>/privacy`

## Distribution tab

Visibility: start with **Unlisted** for a review pass with a few people, then switch to **Public**.

## After it's published

Put the listing URL in `.env.local` as `NEXT_PUBLIC_WEBSTORE_URL`. The web app's `/extension` page
then shows an **Add to Chrome** button that goes to the store, instead of the manual install steps.
