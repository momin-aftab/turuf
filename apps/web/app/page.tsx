'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  const handleCreateGame = async () => {
    setIsCreating(true);
    setError('');
    try {
      const data = await apiClient.lobby.create();
      // Redirect to the newly created lobby
      router.push(`/${data.lobbyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
      setIsCreating(false);
    }
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinId.trim().toUpperCase();
    if (!code) return;

    const devCode = process.env.NEXT_PUBLIC_DEV_MODE_CODE || 'DEV-CNK80Q3';
    const mosPrefix = process.env.NEXT_PUBLIC_MOS_MODE_PREFIX || 'MOS-';

    if (code === devCode) {
      router.push('/dev');
      return;
    }

    if (code.startsWith(mosPrefix)) {
      setIsCreating(true);
      setError('');
      try {
        let customId = code.substring(mosPrefix.length);
        const data = await apiClient.lobby.create({ admin: true, customId: customId || undefined });
        router.push(`/${data.lobbyId}`);
      } catch (err: any) {
        setError(err.message || 'Failed to create Admin lobby');
        setIsCreating(false);
      }
      return;
    }

    if (code.length !== 6) {
      setError('Lobby code must be exactly 6 characters.');
      return;
    }

    router.push(`/${code}`);
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%', padding: '3rem 2rem', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Turuf</h1>
        <p style={{ marginBottom: '2.5rem', color: 'var(--color-text-secondary)' }}>The Traditional Kashmiri Card Game</p>

        {error && (
          <div style={{ padding: '0.75rem', background: 'rgba(255,0,0,0.2)', border: '1px solid #ff4444', borderRadius: '4px', marginBottom: '1.5rem', color: '#fff' }}>
            {error}
          </div>
        )}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', marginBottom: '2rem' }}
          onClick={handleCreateGame}
          disabled={isCreating}
        >
          {isCreating ? <div className="spinner" /> : 'Create New Game'}
        </button>

        <div style={{ position: 'relative', marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.2)', zIndex: 1 }}></div>
          <span style={{ position: 'relative', background: 'var(--color-panel-bg)', padding: '0 1rem', color: 'rgba(255,255,255,0.6)', zIndex: 2, fontSize: '0.875rem' }}>
            OR JOIN EXISTING
          </span>
        </div>

        <form onSubmit={handleJoinGame} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Lobby Code (e.g. KAZ2Y5)" 
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            style={{ textTransform: 'uppercase', flex: 1 }}
          />
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!joinId.trim()}
          >
            Join
          </button>
        </form>

        <div style={{ paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', fontSize: '0.9rem' }}
            onClick={() => router.push('/dev')}
          >
            🧪 Test Offline (Dev Mode)
          </button>
        </div>
      </div>
    </main>
  );
}
