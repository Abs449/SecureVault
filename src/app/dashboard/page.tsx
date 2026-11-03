'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, LogOut, Plus, Puzzle, Search, Tag, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signOut } from '@/lib/auth';
import { DecryptedPasswordEntry } from '@/lib/types';
import EntryDialog from '@/components/EntryDialog';
import EntryRow from '@/components/EntryRow';
import LockScreen from '@/components/LockScreen';
import { Wordmark } from '@/components/Logo';
import { FullPageSpinner } from '@/components/ui';

type DialogState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; entry: DecryptedPasswordEntry };

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isUnlocked, entries, unreadable, lockVault } = useVault();

  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => e.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const tagExists = activeTag === null || tagCounts.some(([t]) => t === activeTag);
  const currentTag = tagExists ? activeTag : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (currentTag && !e.tags.includes(currentTag)) return false;
      if (!q) return true;
      return [e.title, e.username, e.url, ...e.tags].some((v) => v.toLowerCase().includes(q));
    });
  }, [entries, query, currentTag]);

  const handleSignOut = async () => {
    await signOut().catch((err) => console.error('Failed to sign out:', err));
    router.replace('/');
  };

  if (authLoading) return <FullPageSpinner />;
  if (!user) return null;
  if (!isUnlocked) return <LockScreen />;

  const filtering = Boolean(query.trim() || currentTag);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark size={26} />
          <div className="flex items-center gap-1">
            <span className="mr-3 hidden max-w-[240px] truncate text-sm text-fg-muted md:block">{user.email}</span>
            <Link href="/extension" className="btn btn-ghost btn-sm hover:no-underline">
              <Puzzle size={15} />
              <span className="hidden sm:inline">Extension</span>
            </Link>
            <button onClick={lockVault} className="btn btn-ghost btn-sm">
              <Lock size={15} />
              <span className="hidden sm:inline">Lock</span>
            </button>
            <button onClick={handleSignOut} className="btn btn-ghost btn-sm">
              <LogOut size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        {/* Sidebar */}
        <nav aria-label="Filter by tag" className="hidden w-48 shrink-0 lg:block">
          <ul className="space-y-0.5 text-sm">
            <SidebarItem label="All items" count={entries.length} active={currentTag === null} onClick={() => setActiveTag(null)} />
          </ul>
          {tagCounts.length > 0 && (
            <>
              <p className="mb-1 mt-6 px-2.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">Tags</p>
              <ul className="space-y-0.5 text-sm">
                {tagCounts.map(([tag, count]) => (
                  <SidebarItem
                    key={tag}
                    label={tag}
                    count={count}
                    icon
                    active={currentTag === tag}
                    onClick={() => setActiveTag(tag)}
                  />
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-lg font-semibold tracking-tight">{currentTag ?? 'All items'}</h1>
            <button onClick={() => setDialog({ mode: 'new' })} className="btn btn-primary btn-sm">
              <Plus size={16} />
              New item
            </button>
          </div>

          {unreadable > 0 && (
            <p className="alert alert-warning mt-4">
              {unreadable} item{unreadable === 1 ? '' : 's'} in this vault couldn&apos;t be decrypted with your master
              password and {unreadable === 1 ? 'is' : 'are'} hidden. They were likely saved by an older version of the
              browser extension.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                type="search"
                placeholder="Search vault"
                className="input pl-9 pr-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search vault"
              />
              {query && (
                <button onClick={() => setQuery('')} className="icon-btn absolute right-1 top-1/2 -translate-y-1/2" aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </div>
            {tagCounts.length > 0 && (
              <select
                className="input w-auto lg:hidden"
                value={currentTag ?? ''}
                onChange={(e) => setActiveTag(e.target.value || null)}
                aria-label="Filter by tag"
              >
                <option value="">All tags</option>
                {tagCounts.map(([tag]) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            )}
          </div>

          <div className="panel mt-4 overflow-hidden">
            {visible.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="font-medium">{filtering ? 'No matching items' : 'No items yet'}</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-fg-muted">
                  {filtering
                    ? 'Try another search, or clear the filter.'
                    : 'Logins you add are encrypted before they leave this device.'}
                </p>
                {filtering ? (
                  <button className="btn btn-secondary btn-sm mt-5" onClick={() => { setQuery(''); setActiveTag(null); }}>
                    Clear filters
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm mt-5" onClick={() => setDialog({ mode: 'new' })}>
                    <Plus size={16} />
                    Add a login
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_7rem_auto] gap-4 border-b border-border bg-surface-muted px-4 py-2 text-xs font-medium text-fg-subtle md:grid">
                  <span>Name</span>
                  <span>Website</span>
                  <span>Updated</span>
                  <span className="w-[104px]" />
                </div>
                <ul className="divide-y divide-border">
                  {visible.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onOpen={(e) => setDialog({ mode: 'edit', entry: e })} />
                  ))}
                </ul>
              </>
            )}
          </div>

          {visible.length > 0 && (
            <p className="mt-3 text-xs text-fg-subtle">
              {visible.length} of {entries.length} item{entries.length === 1 ? '' : 's'}
            </p>
          )}
        </main>
      </div>

      {dialog.mode !== 'closed' && (
        <EntryDialog
          entry={dialog.mode === 'edit' ? dialog.entry : null}
          onClose={() => setDialog({ mode: 'closed' })}
        />
      )}
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  icon?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${
          active ? 'bg-accent-soft font-medium text-accent' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
        }`}
      >
        {icon && <Tag size={14} className="shrink-0" />}
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs tabular-nums opacity-70">{count}</span>
      </button>
    </li>
  );
}
