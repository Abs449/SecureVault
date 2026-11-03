import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { Wordmark } from './Logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Link shown in the top-right corner, e.g. "Create account". */
  aside: { prompt: string; href: string; label: string };
}

/** Layout shared by the sign-in and sign-up pages. */
export default function AuthShell({ title, subtitle, children, aside }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="hover:no-underline">
          <Wordmark />
        </Link>
        <p className="text-sm text-fg-muted">
          <span className="hidden sm:inline">{aside.prompt} </span>
          <Link href={aside.href} className="font-medium">
            {aside.label}
          </Link>
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-[408px]">
          <div className="panel px-6 py-7 sm:px-8 sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>

          <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[13px] leading-relaxed text-fg-subtle">
            <LockKeyhole size={14} className="mt-[3px] shrink-0" aria-hidden />
            <span>
              Entries are encrypted in your browser with AES-256. Your master password is never sent to
              our servers.
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
