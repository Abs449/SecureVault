import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { VaultProvider } from '@/context/VaultContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SecureVault - Zero-Knowledge Password Manager',
  description: 'Client-side encrypted password manager with zero-knowledge architecture',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <VaultProvider>{children}</VaultProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
