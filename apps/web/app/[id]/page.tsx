'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';
import { AblyProvider } from '@/components/AblyProvider';
import { GameSubscriber } from '@/components/GameSubscriber';
import { GameBoard } from '@/components/GameBoard';
import { Hand } from '@/components/Hand';
import { ChatPanel } from '@/components/ChatPanel';
import { TrumpSelector } from '@/components/TrumpSelector';

interface LobbyPageProps {
  params: Promise<{ id: string }>;
}

export default function LobbyPage({ params }: LobbyPageProps) {
  // use() hook to unwrap params in Next.js 15+
  const resolvedParams = use(params);
  const lobbyId = resolvedParams.id.toUpperCase();
  const router = useRouter();

  const { jwt, lobbyStatus, players, mySeat, error, setSession, setLobbyState, setError, isAdmin } = useGameStore();

  const [isLoading, setIsLoading] = useState(true);
  const [joinName, setJoinName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Initial fetch of lobby status (without JWT)
  useEffect(() => {
    async function fetchStatus() {
      try {
        const data = await apiClient.lobby.status(lobbyId);
        setLobbyState(data.status, data.players, data.isAdmin);
      } catch (err: any) {
        if (err.code === 'NOT_FOUND') {
          router.push('/');
        }
      } finally {
        setIsLoading(false);
      }
    }
    
    // Only fetch if we aren't already in the lobby
    if (!jwt) {
      fetchStatus();
    } else {
      setIsLoading(false);
    }
  }, [lobbyId, jwt, router, setLobbyState]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || isJoining) return;
    
    setIsJoining(true);
    setError(null);
    try {
      const data = await apiClient.lobby.join(lobbyId, joinName.trim());
      setSession(data.lobbyId, data.token, data.playerId, data.seat);
      // AblyProvider will detect the JWT and connect automatically
    } catch (err: any) {
      setError(err.message || 'Failed to join lobby');
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    try {
      await apiClient.lobby.start(lobbyId);
    } catch (err: any) {
      setError(err.message || 'Failed to start game');
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  // ─── WAITING ROOM UI (NOT JOINED) ───
  if (!jwt) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--color-carpet-gold)' }}>Lobby: {lobbyId}</h2>
          
          <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontWeight: 'bold' }}>Players ({players.length}/4)</div>
            {players.length === 0 && <div style={{ color: 'var(--color-text-secondary)' }}>Waiting for players...</div>}
            {players.map((p, i) => (
              <div key={p.id} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                {i + 1}. {p.name}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(255,0,0,0.2)', border: '1px solid #ff4444', borderRadius: '4px', marginBottom: '1.5rem', color: '#fff' }}>
              {error}
            </div>
          )}

          {players.length < 4 || lobbyStatus === 'waiting' ? (
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Your Name" 
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                maxLength={20}
              />
              <button type="submit" className="btn btn-primary" disabled={isJoining || !joinName.trim() || players.length >= 4}>
                {isJoining ? <div className="spinner" /> : 'Join Game'}
              </button>
            </form>
          ) : (
            <div style={{ color: 'var(--color-carpet-gold)' }}>Game is full or already in progress.</div>
          )}
        </div>
      </main>
    );
  }

  // ─── JOINED: ABLY WRAPPER ───
  // We have a JWT, so we wrap the UI in AblyProvider to connect.
  return (
    <AblyProvider>
      <GameSubscriber />
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '1rem', overflowY: 'auto', overflowX: 'hidden' }}>
        
        {/* Header bar */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <span style={{ color: 'var(--color-carpet-gold)', fontWeight: 'bold' }}>Lobby: </span> {lobbyId}
          </div>
          {error && <div style={{ color: '#ff4444' }}>{error}</div>}
        </header>

        {/* Content Area */}
        <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0 }}>
          
          {/* Main Game Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {lobbyStatus === 'waiting' || lobbyStatus === 'ready' ? (
              <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <h2 style={{ marginBottom: '1rem', color: 'var(--color-carpet-gold)' }}>Waiting Room</h2>
                <p style={{ marginBottom: '1rem' }}>{players.length}/4 Players Joined</p>
                
                <div style={{ width: '100%', maxWidth: '400px', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {players.map((p, i) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                      <span>{i + 1}. {p.name} {mySeat === p.seat && '(You)'}</span>
                      {isAdmin && mySeat === 0 && (
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={async () => {
                            const newName = prompt(`Enter new name for ${p.name} (Max 20 chars):`, p.name);
                            if (!newName || newName === p.name || newName.trim() === '') return;
                            try {
                              await apiClient.lobby.rename(lobbyId, p.id, newName);
                            } catch (err: any) {
                              useGameStore.getState().setError(err.message || 'Failed to rename player');
                            }
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {mySeat === 0 && (
                  <button 
                    className="btn btn-primary" 
                    onClick={handleStartGame}
                    disabled={players.length < 4}
                    style={{ width: '100%', maxWidth: '400px' }}
                  >
                    Start Game
                  </button>
                )}
                {mySeat !== 0 && (
                  <p style={{ color: 'var(--color-text-secondary)' }}>Waiting for the host (Player 1) to start the game.</p>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <GameBoard />
                <Hand />
                <TrumpSelector />
              </div>
            )}
          </div>

          {/* Sidebar Area (Chat) */}
          <div style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel />
          </div>
          
        </div>
      </main>
    </AblyProvider>
  );
}
