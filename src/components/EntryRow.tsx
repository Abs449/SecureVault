'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, Pencil, UserRound } from 'lucide-react';
import { DecryptedPasswordEntry } from '@/lib/types';

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const MONOGRAM_COLORS = ['#1d4ed8', '#0f766e', '#6d28d9', '#be123c', '#b45309', '#0369a1', '#4d7c0f', '#475569'];

export function Monogram({ title, size = 36 }: { title: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length],
      }}
    >
      {title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function CopyButton({ value, label, icon: Icon }: { value: string; label: string; icon: typeof Copy }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title={copied ? 'Copied' : label}
      aria-label={label}
      disabled={!value}
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={16} className="text-success" /> : <Icon size={16} />}
    </button>
  );
}

interface EntryRowProps {
  entry: DecryptedPasswordEntry;
  onOpen: (entry: DecryptedPasswordEntry) => void;
}

export default function EntryRow({ entry, onOpen }: EntryRowProps) {
  const hostname = hostnameOf(entry.url);

  return (
    <li
      className="group grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 hover:bg-surface-hover md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_7rem_auto]"
      onClick={() => onOpen(entry)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Monogram title={entry.title} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.title}</p>
          <p className="truncate text-[13px] text-fg-muted">{entry.username || '—'}</p>
        </div>
      </div>

      <div className="hidden min-w-0 md:block">
        {hostname ? (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-[13px] text-fg-muted hover:text-accent"
          >
            {hostname}
          </a>
        ) : (
          <span className="text-[13px] text-fg-subtle">—</span>
        )}
      </div>

      <p className="hidden text-[13px] tabular-nums text-fg-subtle md:block">
        {new Date(entry.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>

      <div className="flex items-center gap-0.5">
        <CopyButton value={entry.username} label="Copy username" icon={UserRound} />
        <CopyButton value={entry.password} label="Copy password" icon={KeyRound} />
        <button
          type="button"
          className="icon-btn"
          title="Edit"
          aria-label={`Edit ${entry.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(entry);
          }}
        >
          <Pencil size={16} />
        </button>
      </div>
    </li>
  );
}
