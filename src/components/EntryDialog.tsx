'use client';

import { useEffect, useState } from 'react';
import { Trash2, WandSparkles, X } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import { DecryptedPasswordEntry } from '@/lib/types';
import PasswordGenerator from './PasswordGenerator';
import { ErrorAlert, PasswordInput, StrengthMeter } from './ui';

interface EntryDialogProps {
  entry: DecryptedPasswordEntry | null;
  onClose: () => void;
}

function normalizeUrl(value: string) {
  const v = value.trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

export default function EntryDialog({ entry, onClose }: EntryDialogProps) {
  const { addEntry, updateEntry, deleteEntry } = useVault();

  const [title, setTitle] = useState(entry?.title ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState(entry?.password ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '');
  const [showGenerator, setShowGenerator] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      title: title.trim(),
      username: username.trim(),
      password,
      url: normalizeUrl(url),
      notes: notes.trim(),
      tags: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))],
    };
    run(() => (entry ? updateEntry(entry.id, input) : addEntry(input)));
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="entry-dialog-title">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id="entry-dialog-title" className="font-semibold">
            {entry ? 'Edit login' : 'New login'}
          </h2>
          <button onClick={onClose} className="icon-btn -mr-1.5" aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div>
              <label htmlFor="title" className="field-label">Name</label>
              <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus={!entry} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="username" className="field-label">Username</label>
                <input id="username" className="input" autoComplete="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div>
                <label htmlFor="url" className="field-label">Website</label>
                <input id="url" className="input" placeholder="example.com" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="field-label mb-0">Password</label>
                <button
                  type="button"
                  onClick={() => setShowGenerator((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover"
                >
                  <WandSparkles size={14} />
                  {showGenerator ? 'Hide generator' : 'Generate'}
                </button>
              </div>
              <PasswordInput
                id="password"
                className="font-mono text-[13px]"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {password && !showGenerator && <StrengthMeter password={password} />}
              {showGenerator && (
                <div className="mt-3 rounded-lg border border-border bg-surface-muted p-4">
                  <PasswordGenerator
                    onUsePassword={(p) => {
                      setPassword(p);
                      setShowGenerator(false);
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="notes" className="field-label">Notes</label>
              <textarea id="notes" rows={3} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div>
              <label htmlFor="tags" className="field-label">Tags</label>
              <input id="tags" className="input" placeholder="work, finance" value={tags} onChange={(e) => setTags(e.target.value)} />
              <p className="field-hint">Comma-separated. Tags are stored unencrypted so they can be filtered.</p>
            </div>

            {error && <ErrorAlert>{error}</ErrorAlert>}
          </div>

          <div className="flex items-center gap-2 rounded-b-[14px] border-t border-border bg-surface-muted px-5 py-3">
            {entry &&
              (confirmDelete ? (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => deleteEntry(entry.id))}>
                  Confirm delete
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} />
                  Delete
                </button>
              ))}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm min-w-[88px]" disabled={busy}>
                {busy ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
