import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Privacy policy · SecureVault',
  description: 'What SecureVault and the SecureVault browser extension collect, store and share.',
};

const UPDATED = 'November 3, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-fg-muted [&_strong]:font-medium [&_strong]:text-fg">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <Link href="/" className="hover:no-underline">
          <Wordmark />
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-fg-subtle">Last updated {UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-fg-muted">
          This policy covers the SecureVault web app and the SecureVault browser extension. SecureVault is built so
          that we cannot read your passwords: they are encrypted on your device before they are stored.
        </p>

        <Section title="What we store">
          <p>
            <strong>Account:</strong> your email address and an account password, handled by Firebase Authentication
            (Google) to sign you in.
          </p>
          <p>
            <strong>Vault:</strong> your saved logins (name, username, password, website and notes) stored in Cloud
            Firestore only as AES-256 ciphertext. The encryption key is derived on your device from your master
            password with PBKDF2 and is never sent to us, so we cannot decrypt your vault.
          </p>
          <p>
            <strong>Unencrypted metadata:</strong> the tags you add to items, the creation and update times of items,
            and a random salt and key-check value needed to derive and verify your key.
          </p>
        </Section>

        <Section title="What the extension does on websites">
          <p>
            The extension runs on the pages you visit so it can find login and sign-up forms, show saved logins for
            that site, suggest generated passwords and offer to save logins you submit. This happens locally in your
            browser.
          </p>
          <p>
            It does not collect, log or transmit your browsing history, page content or form data. A login you submit
            is only sent anywhere if you choose <strong>Save</strong>, and then only in encrypted form to your own
            vault. Passwords are released to a page only when you choose to fill them, and only on the site they were
            saved for.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            While the vault is unlocked, the extension keeps the encryption key in the browser&apos;s in-memory session
            storage. It is removed when you lock the vault, after the auto-lock period you choose, or when the browser
            closes. Extension settings and the list of sites where you chose &ldquo;Never save&rdquo; are stored
            locally in the browser.
          </p>
        </Section>

        <Section title="Sharing and selling">
          <p>
            We do not sell or share your data, use it for advertising, or use it to determine creditworthiness. We
            use no third-party analytics or trackers in the extension. Google provides the hosting for authentication
            and storage and processes data only to provide that service.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            You can delete any item from your vault at any time. To delete your account and all associated data,
            contact us from the email address on your account and we will remove it. Uninstalling the extension
            deletes its local data.
          </p>
        </Section>

        <Section title="Your master password">
          <p>
            Because we never receive your master password, we cannot reset it or recover your vault if you forget it.
          </p>
        </Section>
      </main>
    </div>
  );
}
