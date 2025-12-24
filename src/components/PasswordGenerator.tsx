'use client';

import { useState, useEffect } from 'react';
import { generatePassword, calculatePasswordStrength } from '@/lib/crypto';
import { PasswordGeneratorOptions } from '@/lib/types';

interface PasswordGeneratorProps {
  onUsePassword: (password: string) => void;
}

export default function PasswordGenerator({ onUsePassword }: PasswordGeneratorProps) {
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState<PasswordGeneratorOptions>({
    length: 16,
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true,
  });
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [strength, setStrength] = useState(0);
  const [copied, setCopied] = useState(false);

  // Generate password on mount and when options change
  useEffect(() => {
    try {
      const newOptions = { ...options, length };
      const password = generatePassword(newOptions);
      setGeneratedPassword(password);
      setStrength(calculatePasswordStrength(password));
    } catch (error) {
      console.error('Failed to generate password:', error);
    }
  }, [length, options]);

  const handleRegenerate = () => {
    try {
      const password = generatePassword({ ...options, length });
      setGeneratedPassword(password);
      setStrength(calculatePasswordStrength(password));
      setCopied(false);
    } catch (error) {
      console.error('Failed to generate password:', error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const toggleOption = (key: keyof Omit<PasswordGeneratorOptions, 'length'>) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getStrengthLabel = () => {
    if (strength < 40) return { text: 'Weak', color: 'text-red-400', barClass: 'strength-weak' };
    if (strength < 70) return { text: 'Medium', color: 'text-yellow-400', barClass: 'strength-medium' };
    return { text: 'Strong', color: 'text-green-400', barClass: 'strength-strong' };
  };

  const strengthInfo = getStrengthLabel();

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2">Generated Password</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={generatedPassword}
            readOnly
            className="input font-mono text-sm flex-1"
          />
          <button onClick={handleCopy} className="btn btn-secondary px-3" title="Copy">
            {copied ? '✓' : '📋'}
          </button>
          <button onClick={handleRegenerate} className="btn btn-secondary px-3" title="Regenerate">
            🔄
          </button>
        </div>
        
        {/* Strength indicator */}
        <div className="mt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-text-secondary">Strength:</span>
            <span className={`text-xs font-medium ${strengthInfo.color}`}>
              {strengthInfo.text}
            </span>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className={`strength-bar ${strengthInfo.barClass}`} />
          </div>
        </div>
      </div>

      {/* Length slider */}
      <div>
        <label>Length: {length}</label>
        <input
          type="range"
          min="8"
          max="64"
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="w-full accent-accent-primary"
        />
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={options.includeUppercase}
            onChange={() => toggleOption('includeUppercase')}
            className="mr-2 accent-accent-primary"
          />
          <span className="text-sm">Uppercase (A-Z)</span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={options.includeLowercase}
            onChange={() => toggleOption('includeLowercase')}
            className="mr-2 accent-accent-primary"
          />
          <span className="text-sm">Lowercase (a-z)</span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={options.includeNumbers}
            onChange={() => toggleOption('includeNumbers')}
            className="mr-2 accent-accent-primary"
          />
          <span className="text-sm">Numbers (0-9)</span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={options.includeSymbols}
            onChange={() => toggleOption('includeSymbols')}
            className="mr-2 accent-accent-primary"
          />
          <span className="text-sm">Symbols (!@#$...)</span>
        </label>
      </div>

      {/* Use password button */}
      <button
        onClick={() => onUsePassword(generatedPassword)}
        className="btn btn-primary w-full"
      >
        Use This Password
      </button>
    </div>
  );
}
