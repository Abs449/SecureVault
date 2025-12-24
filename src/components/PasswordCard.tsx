'use client';

import { useState } from 'react';
import { DecryptedPasswordEntry } from '@/lib/types';

interface PasswordCardProps {
  entry: DecryptedPasswordEntry;
  onEdit: (entry: DecryptedPasswordEntry) => void;
  onDelete: (id: string) => void;
}

export default function PasswordCard({ entry, onEdit, onDelete }: PasswordCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return null;
    }
  };

  const faviconUrl = entry.url ? getFaviconUrl(entry.url) : null;

  return (
    <div className="card group">
      <div className="flex items-start gap-4">
        {/* Favicon */}
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-10 h-10 rounded-lg bg-gray-800 p-1"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-xl">
            🔐
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold mb-1 truncate">{entry.title}</h3>
          {entry.username && (
            <p className="text-sm text-text-secondary mb-2 truncate">{entry.username}</p>
          )}

          {/* Password */}
          <div className="mb-3 flex items-center gap-2">
            <input
              type={showPassword ? 'text' : 'password'}
              value={entry.password}
              readOnly
              className="input text-sm flex-1 font-mono"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="btn btn-secondary px-3 py-2 text-sm"
              title={showPassword ? 'Hide' : 'Show'}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
            <button
              onClick={() => copyToClipboard(entry.password, 'password')}
              className="btn btn-secondary px-3 py-2 text-sm"
              title="Copy password"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>

          {/* URL */}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-primary hover:text-accent-secondary mb-2 block truncate"
            >
              {entry.url}
            </a>
          )}

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {entry.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <p className="text-xs text-text-secondary border-t border-border-color pt-2 mb-3">
              {entry.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(entry)} className="btn btn-secondary text-xs py-1 px-3">
              ✏️ Edit
            </button>
            <button onClick={() => onDelete(entry.id)} className="btn btn-danger text-xs py-1 px-3">
              🗑️ Delete
            </button>
          </div>

          {/* Timestamp */}
          <p className="text-xs text-text-secondary mt-2">
            Updated {new Date(entry.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
