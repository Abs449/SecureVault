'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Download, KeyRound, MousePointerClick, Save } from 'lucide-react';
import { Wordmark } from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';

const DOWNLOAD_URL = '/downloads/securevault-extension.zip';

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted py-0.5 pl-2 pr-0.5 font-mono text-[13px]">
      {text}
      <button
        type="button"
        className="icon-btn h-6 w-6"
        aria-label={`Copy ${text}`}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      </button>
    </span>
  );
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Download and unzip',
    body: (
      <>
        Extract <span className="font-mono text-[13px]">securevault-extension.zip</span> somewhere permanent, such as
        your Documents folder. Chrome loads it from that folder, so don&apos;t delete it afterwards.
      </>
    ),
  },
  {
    title: 'Open the extensions page',
    body: (
      <>
        Paste <CopyText text="chrome://extensions" /> into the address bar. In Edge, use{' '}
        <CopyText text="edge://extensions" />.
      </>
    ),
  },
  {
    title: 'Turn on Developer mode',
    body: 'Use the toggle in the top-right corner of the page (bottom-left in Edge).',
  },
  {
    title: 'Load the folder',
    body: (
      <>
        Click <strong className="font-medium text-fg">Load unpacked</strong> and select the{' '}
        <span className="font-mono text-[13px]">securevault-extension</span> folder: the one that contains{' '}
        <span className="font-mono text-[13px]">manifest.json</span>.
      </>
    ),
  },
  {
    title: 'Pin it and sign in',
    body: 'Click the puzzle-piece icon in the toolbar, pin SecureVault, then sign in with the same email, account password and master password you use here.',
  },
];

const FEATURES = [
  { icon: MousePointerClick, title: 'Fill', body: 'Logins for the site you are on, filled with one click.' },
  { icon: Save, title: 'Save', body: 'Offers to save a login after you sign in to a site.' },
  { icon: KeyRound, title: 'Generate', body: 'Right-click any password field to create a strong password.' },
];

export default function ExtensionPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="hover:no-underline">
          <Wordmark />
        </Link>
        <Link href={user ? '/dashboard' : '/'} className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeft size={15} />
          {user ? 'Back to vault' : 'Back to sign in'}
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Browser extension</h1>
        <p className="mt-2 max-w-xl text-fg-muted">
          Use your vault on any website. The extension reads the same encrypted data as this app and decrypts it
          locally with your master password.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={DOWNLOAD_URL} download className="btn btn-primary hover:no-underline">
            <Download size={16} />
            Download extension
          </a>
          <span className="text-sm text-fg-subtle">Chrome or Edge, version 127 or later</span>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="panel p-6">
            <h2 className="font-semibold">Install</h2>
            <p className="mt-1 text-sm text-fg-muted">
              SecureVault isn&apos;t in the Chrome Web Store yet, so it&apos;s installed as an unpacked extension.
            </p>
            <ol className="mt-5 space-y-5">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs font-medium tabular-nums text-fg-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{body}</p>
                </div>
              </div>
            ))}
            <p className="border-t border-border pt-5 text-[13px] leading-relaxed text-fg-subtle">
              The extension stays locked until you enter your master password, and locks itself again after a period
              of inactivity you choose in its settings.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
