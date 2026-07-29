'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';
import { AblyProvider } from '@/components/AblyProvider';
import { GameSubscriber } from '@/components/GameSubscriber';
import { GameBoard } from '@/components/GameBoard';
import { Hand } from '@/components/Hand';

import { TrumpSelector } from '@/components/TrumpSelector';

interface LobbyPageProps {
  params: Promise<{ id: string }>;
}

export default function LobbyPage({ params }: LobbyPageProps) {
  // use() hook to unwrap params in Next.js 15+
  const resolvedParams = use(params);
  const lobbyId = resolvedParams.id.toUpperCase();
  const router = useRouter();

  const { 
    lobbyId: storeLobbyId, 
    jwt, 
    lobbyStatus, 
    players, 
    mySeat, 
    myPlayerId,
    error, 
    setSession, 
    setLobbyState, 
    setError, 
    isAdmin,
    clearSession 
  } = useGameStore();

  const [isLoading, setIsLoading] = useState(true);
  const [joinName, setJoinName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);

  // 1. Synchronously clear stale session on mount
  const isStale = storeLobbyId && storeLobbyId !== lobbyId;
  const isJoined = jwt && !isStale;
  
  useEffect(() => {
    if (isStale) {
      clearSession();
    }
  }, [isStale, clearSession]);

  // 2. Continual polling for lobby status (works as fallback for websockets)
  useEffect(() => {
    let interval: NodeJS.Timeout;

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
    
    // Always fetch immediately
    fetchStatus();
    
    // Always poll every 3 seconds, even if joined, to ensure consistency
    interval = setInterval(fetchStatus, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [lobbyId, router, setLobbyState]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || isJoining) return;
    
    setIsJoining(true);
    setError(null);
    try {
      const data = await apiClient.lobby.join(lobbyId, joinName.trim());
      setSession(lobbyId, data.jwt, data.playerId, data.seat);
      setIsJoining(false);
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

  const handleLeaveLobby = async () => {
    try {
      await apiClient.lobby.leave(lobbyId);
      useGameStore.getState().clearSession();
      // Polling will automatically resume because jwt is now null
    } catch (err: any) {
      setError(err.message || 'Failed to leave lobby');
    }
  };

  // ── Auto-rejoin flow ───────────────────────────────────────────────────────
  // If the player has a stored playerId but no valid JWT and the game is in progress,
  // attempt to rejoin automatically.
  useEffect(() => {
    if (isJoined || !myPlayerId || isRejoining) return;
    if (lobbyStatus !== 'in_game') return;

    async function attemptRejoin() {
      setIsRejoining(true);
      try {
        const data = await apiClient.lobby.rejoin(lobbyId, myPlayerId!, joinName || 'Player');
        setSession(lobbyId, data.jwt, data.playerId, data.seat);
        if (data.view) {
          useGameStore.getState().applyServerEvent({
            type: 'RECONNECT_STATE',
            payload: { view: data.view, myHand: data.myHand },
          });
        }
      } catch (err: any) {
        console.log('Auto-rejoin failed:', err.message);
        // Don't set error — let the user join normally
      } finally {
        setIsRejoining(false);
      }
    }

    attemptRejoin();
  }, [lobbyStatus, myPlayerId, isJoined, isRejoining, lobbyId, setSession]);

  const handleRejoin = async () => {
    if (!myPlayerId || isRejoining) return;
    setIsRejoining(true);
    setError(null);
    try {
      const data = await apiClient.lobby.rejoin(lobbyId, myPlayerId, joinName || 'Player');
      setSession(lobbyId, data.jwt, data.playerId, data.seat);
      if (data.view) {
        useGameStore.getState().applyServerEvent({
          type: 'RECONNECT_STATE',
          payload: { view: data.view, myHand: data.myHand },
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to rejoin');
    } finally {
      setIsRejoining(false);
    }
  };

  if (isLoading || isRejoining) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner" />
        {isRejoining && <div style={{ color: 'var(--color-carpet-gold)' }}>Rejoining game...</div>}
      </div>
    );
  }


  // ─── WAITING ROOM UI (NOT JOINED) ───
  if (!isJoined) {
    // Show rejoin button if game is in progress and player has a stored ID
    const canRejoin = myPlayerId && (lobbyStatus === 'in_game');

    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--color-carpet-gold)' }}>Lobby: {lobbyId}</h2>
          
          <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontWeight: 'bold' }}>Players ({players.length}/4)</div>
            {players.length === 0 && <div style={{ color: 'var(--color-text-secondary)' }}>Waiting for players...</div>}
            {players.map((p, i) => (
              <div key={p.id} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                {i + 1}. {p.name} {i === 0 && '👑'}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(255,0,0,0.2)', border: '1px solid #ff4444', borderRadius: '4px', marginBottom: '1.5rem', color: '#fff' }}>
              {error}
            </div>
          )}

          {canRejoin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ color: 'var(--color-carpet-gold)', marginBottom: '0.5rem' }}>Game is in progress. You were previously in this game.</div>
              <button 
                className="btn btn-primary" 
                onClick={handleRejoin}
                disabled={isRejoining}
              >
                {isRejoining ? <div className="spinner" /> : 'Rejoin Game'}
              </button>
            </div>
          ) : players.length < 4 || lobbyStatus === 'waiting' ? (
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
                      <span>{i + 1}. {p.name} {i === 0 && '👑'} {mySeat === p.seat && '(You)'}</span>
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
                    style={{ width: '100%', maxWidth: '400px', marginBottom: '1rem' }}
                  >
                    Start Game
                  </button>
                )}
                {mySeat !== 0 && (
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Waiting for the host (Player 1) to start the game.</p>
                )}

                <button 
                  className="btn btn-secondary" 
                  onClick={handleLeaveLobby}
                  style={{ width: '100%', maxWidth: '400px' }}
                >
                  Leave Lobby
                </button>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <GameBoard />
                <Hand />
                <TrumpSelector />
              </div>
            )}
          </div>


          
        </div>
      </main>
    </AblyProvider>
  );
}
