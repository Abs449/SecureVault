'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { generatePassword } from '@/lib/crypto';
import { PasswordGeneratorOptions } from '@/lib/types';
import { StrengthMeter } from './ui';

type CharsetKey = keyof Omit<PasswordGeneratorOptions, 'length'>;

const CHARSETS: { key: CharsetKey; label: string }[] = [
  { key: 'includeUppercase', label: 'A–Z' },
  { key: 'includeLowercase', label: 'a–z' },
  { key: 'includeNumbers', label: '0–9' },
  { key: 'includeSymbols', label: '!@#' },
];

export default function PasswordGenerator({ onUsePassword }: { onUsePassword: (password: string) => void }) {
  const [options, setOptions] = useState<PasswordGeneratorOptions>({
    length: 20,
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true,
  });
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);

  const password = useMemo(() => {
    try {
      return generatePassword(options);
    } catch {
      return '';
    }
    // `seed` forces a fresh password when "Regenerate" is pressed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, seed]);

  const toggle = (key: CharsetKey) => {
    const enabled = CHARSETS.filter((c) => options[c.key]).length;
    if (options[key] && enabled === 1) return; // keep at least one character set
    setOptions((o) => ({ ...o, [key]: !o[key] }));
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface py-1 pl-3 pr-1">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6">{password}</code>
          <button
            type="button"
            className="icon-btn"
            title="Copy"
            aria-label="Copy generated password"
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          </button>
          <button type="button" className="icon-btn" title="Regenerate" aria-label="Regenerate" onClick={() => setSeed((s) => s + 1)}>
            <RefreshCw size={16} />
          </button>
        </div>
        <StrengthMeter password={password} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[13px]">
          <label htmlFor="gen-length" className="font-medium">Length</label>
          <span className="font-mono tabular-nums text-fg-muted">{options.length}</span>
        </div>
        <input
          id="gen-length"
          type="range"
          min={8}
          max={64}
          value={options.length}
          onChange={(e) => setOptions((o) => ({ ...o, length: Number(e.target.value) }))}
          className="range"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHARSETS.map(({ key, label }) => (
          <button key={key} type="button" className="chip font-mono" aria-pressed={options[key]} onClick={() => toggle(key)}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => onUsePassword(password)} className="btn btn-primary btn-sm ml-auto">
          Use password
        </button>
      </div>
    </div>
  );
}
