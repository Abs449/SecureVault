// Core cryptography module using Web Crypto API
// All encryption happens client-side - zero-knowledge architecture

import { EncryptedResult, PasswordGeneratorOptions } from './types';

// PBKDF2 configuration
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum
const PBKDF2_HASH = 'SHA-256';
const SALT_LENGTH = 16; // 128 bits
const KEY_LENGTH = 256; // AES-256

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derive an encryption key from a master password using PBKDF2
 * @param masterPassword - The user's master password
 * @param salt - Salt for key derivation (Uint8Array)
 * @returns CryptoKey for AES-256-CBC encryption
 */
export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
  extractable = false
): Promise<CryptoKey> {
  // Import the password as a key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive the encryption key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    passwordKey,
    { name: 'AES-CBC', length: KEY_LENGTH },
    // Not extractable by default, so the key stays inside Web Crypto. The browser extension
    // opts in so it can keep the key in memory-only session storage between popup openings.
    extractable,
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Encrypt plaintext using AES-256-CBC
 * @param plaintext - Data to encrypt
 * @param key - CryptoKey derived from master password
 * @returns Encrypted data and IV (both base64 encoded)
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedResult> {
  // Generate random IV for this encryption
  const iv = crypto.getRandomValues(new Uint8Array(16)); // AES block size

  // Encrypt the data
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Convert to base64 for storage
  return {
    data: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt ciphertext using AES-256-CBC
 * @param encryptedData - Base64 encoded encrypted data
 * @param ivBase64 - Base64 encoded initialization vector
 * @param key - CryptoKey derived from master password
 * @returns Decrypted plaintext
 */
export async function decrypt(
  encryptedData: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  try {
    const encryptedBuffer = base64ToArrayBuffer(encryptedData);
    const iv = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encryptedBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error('Decryption failed. Invalid master password or corrupted data.');
  }
}

// ---------------------------------------------------------------------------
// Master password verification
// A known constant is encrypted with the vault key at sign-up. Unlocking decrypts it first,
// so a wrong master password is rejected even when the vault has no entries yet.
// ---------------------------------------------------------------------------
const VERIFIER_PLAINTEXT = 'securevault:key-check:v1';

export async function createVerifier(key: CryptoKey): Promise<EncryptedResult> {
  return encrypt(VERIFIER_PLAINTEXT, key);
}

export async function checkVerifier(verifier: EncryptedResult, key: CryptoKey): Promise<boolean> {
  try {
    return (await decrypt(verifier.data, verifier.iv, key)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Serialize an (extractable) key so it can be held in extension session storage. */
export async function exportKey(key: CryptoKey): Promise<string> {
  return arrayBufferToBase64(await crypto.subtle.exportKey('raw', key));
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToArrayBuffer(raw), { name: 'AES-CBC' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Generate a secure random password
 * @param options - Password generation options
 * @returns Generated password
 */
export function generatePassword(options: PasswordGeneratorOptions): string {
  const { length, includeUppercase, includeLowercase, includeNumbers, includeSymbols } = options;

  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const sets = [
    includeUppercase && uppercase,
    includeLowercase && lowercase,
    includeNumbers && numbers,
    includeSymbols && symbols,
  ].filter((set): set is string => Boolean(set));

  if (sets.length === 0) {
    throw new Error('At least one character type must be selected');
  }

  const charset = sets.join('');
  // One character from each selected set, so the result satisfies "must contain a number /
  // symbol / uppercase letter" rules, then fill the rest from the full set and shuffle.
  const chars = sets.slice(0, length).map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(charset[randomInt(charset.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Uniform random integer in [0, max) from the CSPRNG, without modulo bias. */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/**
 * Validate master password strength
 * @param password - Password to validate
 * @returns Validation result with error message if invalid
 */
export function validateMasterPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 12) {
    return { valid: false, error: 'Master password must be at least 12 characters long' };
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

  const typesCount = [hasUppercase, hasLowercase, hasNumber, hasSymbol].filter(Boolean).length;

  if (typesCount < 3) {
    return {
      valid: false,
      error: 'Master password must include at least 3 of: uppercase, lowercase, numbers, symbols',
    };
  }

  return { valid: true };
}

/**
 * Calculate password strength (0-100)
 */
export function calculatePasswordStrength(password: string): number {
  let strength = 0;

  // Length
  strength += Math.min(password.length * 2, 30);

  // Character variety
  if (/[a-z]/.test(password)) strength += 15;
  if (/[A-Z]/.test(password)) strength += 15;
  if (/[0-9]/.test(password)) strength += 15;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 25;

  return Math.min(strength, 100);
}

// Helper functions for base64 encoding/decoding
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Uint8Array to base64 string
 */
export function saltToBase64(salt: Uint8Array): string {
  return arrayBufferToBase64(salt.buffer as ArrayBuffer);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToSalt(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}
