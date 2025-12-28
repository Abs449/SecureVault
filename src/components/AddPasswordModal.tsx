'use client';

import { useState, useEffect } from 'react';
import { useVault } from '@/context/VaultContext';
import { DecryptedPasswordEntry, PasswordData } from '@/lib/types';
import PasswordGenerator from './PasswordGenerator';

interface AddPasswordModalProps {
  entry?: DecryptedPasswordEntry | null;
  onClose: () => void;
}

export default function AddPasswordModal({ entry, onClose }: AddPasswordModalProps) {
  const { addEntry, updateEntry } = useVault();

  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Populate form if editing
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setUsername(entry.username);
      setPassword(entry.password);
      setUrl(entry.url);
      setNotes(entry.notes);
      setTags(entry.tags.join(', '));
    }
  }, [entry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const entryData = {
        title: title.trim(),
        username: username.trim(),
        password,
        url: url.trim(),
        notes: notes.trim(),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      };

      if (entry) {
        await updateEntry(entry.id, entryData);
      } else {
        await addEntry(entryData);
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save password');
    } finally {
      setLoading(false);
    }
  };

  const handleUseGeneratedPassword = (generatedPassword: string) => {
    setPassword(generatedPassword);
    setShowGenerator(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {entry ? 'Edit Password' : 'Add New Password'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              className="input"
              placeholder="e.g., Gmail, Facebook, Work Portal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="username">Username / Email</label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="your@email.com or username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="password" className="mb-0">Password *</label>
              <button
                type="button"
                onClick={() => setShowGenerator(!showGenerator)}
                className="text-sm text-accent-primary hover:text-accent-secondary"
              >
                {showGenerator ? 'Hide' : 'Generate'} Password
              </button>
            </div>

            {showGenerator ? (
              <div className="mb-4 p-4 glass">
                <PasswordGenerator onUsePassword={handleUseGeneratedPassword} />
              </div>
            ) : (
              <input
                id="password"
                type="text"
                className="input font-mono"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </div>

          <div>
            <label htmlFor="url">Website URL</label>
            <input
              id="url"
              type="url"
              className="input"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="input min-h-[80px] resize-y"
              placeholder="Additional information..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="tags">Tags (comma-separated)</label>
            <input
              id="tags"
              type="text"
              className="input"
              placeholder="work, social, banking"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn btn-primary flex-1" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" />
                  Saving...
                </>
              ) : (
                entry ? 'Update Password' : 'Add Password'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
