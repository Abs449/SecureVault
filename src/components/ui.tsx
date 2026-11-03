'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { calculatePasswordStrength } from '@/lib/crypto';

/** Password input with a built-in show/hide toggle. */
export function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        className={`input pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert alert-danger" role="alert">
      <CircleAlert size={16} className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="spinner spinner-lg" role="status" aria-label="Loading" />
    </div>
  );
}

/** Segmented strength meter for a password value. */
export function StrengthMeter({ password }: { password: string }) {
  const score = calculatePasswordStrength(password);
  const level =
    score < 40
      ? { label: 'Weak', color: 'var(--danger)', segments: 1 }
      : score < 70
        ? { label: 'Fair', color: 'var(--warning)', segments: 2 }
        : { label: 'Strong', color: 'var(--success)', segments: 3 };

  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full bg-border"
            style={i < level.segments ? { background: level.color } : undefined}
          />
        ))}
      </div>
      <span className="w-11 text-right text-xs font-medium" style={{ color: level.color }}>
        {level.label}
      </span>
    </div>
  );
}
