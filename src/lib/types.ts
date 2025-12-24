// Type definitions for the password manager

export interface PasswordEntry {
  id: string;
  encryptedData: string; // Encrypted JSON containing title, username, password, url, notes
  iv: string; // Initialization vector for AES-256-CBC
  tags: string[]; // Unencrypted tags for search/filter
  createdAt: number;
  updatedAt: number;
}

export interface DecryptedPasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PasswordData {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export interface CryptoConfig {
  salt: string; // Base64 encoded salt for PBKDF2
}

export interface User {
  uid: string;
  email: string | null;
}

export interface EncryptedResult {
  data: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
}

export interface PasswordGeneratorOptions {
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
}
