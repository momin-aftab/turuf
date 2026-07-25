'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/game';
import { devEngine } from '@/lib/dev-engine';
import { GameBoard } from '@/components/GameBoard';
import { Hand } from '@/components/Hand';
import { TrumpSelector } from '@/components/TrumpSelector';

export default function DevGamePage() {
  const router = useRouter();
  const { lobbyStatus, mySeat, error, clearSession } = useGameStore();

  useEffect(() => {
    // Start dev game on mount
    devEngine.startDevGame();
    return () => {
      // Clean up on unmount
      devEngine.stopDevGame();
    };
  }, []);

  if (lobbyStatus === 'waiting') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '1rem', overflowY: 'auto', overflowX: 'hidden' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span style={{ color: 'var(--color-carpet-gold)', fontWeight: 'bold', marginRight: '1rem' }}>Local Developer Mode</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>No Redis/Ably required. Bots are playing seats 1, 2, and 3.</span>
        </div>
        <button className="btn btn-secondary" onClick={() => router.push('/')}>
          Exit Dev Mode
        </button>
      </header>

      {error && (
        <div style={{ padding: '0.75rem', background: 'rgba(255,0,0,0.2)', border: '1px solid #ff4444', borderRadius: '4px', marginBottom: '1rem', color: '#fff' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <GameBoard />
        <Hand />
        <TrumpSelector />
      </div>
    </main>
  );
}
