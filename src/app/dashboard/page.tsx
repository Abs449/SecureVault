'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { signOut } from '@/lib/auth';
import { DecryptedPasswordEntry, PasswordData } from '@/lib/types';
import AddPasswordModal from '@/components/AddPasswordModal';
import PasswordCard from '@/components/PasswordCard';
import LockScreen from '@/components/LockScreen';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isUnlocked, entries, loading: vaultLoading, lockVault, deleteEntry, updateEntry } = useVault();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DecryptedPasswordEntry | null>(null);
  const [filteredEntries, setFilteredEntries] = useState<DecryptedPasswordEntry[]>([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Filter entries based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEntries(entries);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = entries.filter(
        (entry) =>
          entry.title.toLowerCase().includes(query) ||
          entry.username.toLowerCase().includes(query) ||
          entry.url.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query))
      );
      setFilteredEntries(filtered);
    }
  }, [searchQuery, entries]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const handleLock = () => {
    lockVault();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this password?')) {
      try {
        await deleteEntry(id);
      } catch (error) {
        console.error('Failed to delete entry:', error);
        alert('Failed to delete password');
      }
    }
  };

  const handleEdit = (entry: DecryptedPasswordEntry) => {
    setEditingEntry(entry);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingEntry(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isUnlocked) {
    return <LockScreen />;
  }

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-start p-8 md:p-12">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="mb-12 animate-slide-in">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-5xl font-bold gradient-text mb-3">SecureVault</h1>
              <p className="text-text-secondary text-lg">
                Welcome, {user.email} • {entries.length} password{entries.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-4">
              <button onClick={handleLock} className="btn btn-secondary">
                🔒 Lock
              </button>
              <button onClick={handleSignOut} className="btn btn-secondary">
                Sign Out
              </button>
            </div>
          </div>

          {/* Search and Add */}
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="🔍 Search passwords..."
              className="input flex-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary whitespace-nowrap">
              + Add Password
            </button>
          </div>
        </div>

        {/* Password List */}
        <div className="space-y-4">
          {vaultLoading ? (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold mb-2">
                {searchQuery ? 'No passwords found' : 'No passwords yet'}
              </h3>
              <p className="text-text-secondary mb-6">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'Click "Add Password" to store your first password securely'}
              </p>
              {!searchQuery && (
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                  + Add Your First Password
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
              {filteredEntries.map((entry) => (
                <PasswordCard
                  key={entry.id}
                  entry={entry}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <AddPasswordModal
          entry={editingEntry}
          onClose={handleCloseModal}
        />
      )}
    </main>
  );
}
