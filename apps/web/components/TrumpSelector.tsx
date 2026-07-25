'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';

export function TrumpSelector() {
  const { view, mySeat, setError } = useGameStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only show if it's trump selection phase, and we are Player 1 (seat 0)
  if (!view || view.phase !== 'trump_selection' || mySeat !== 0) return null;

  const handleSelectTrump = async (suit: string) => {
    setIsSubmitting(true);
    try {
      await apiClient.game.trump(suit);
      // Success - the server will broadcast the new state and the modal will disappear
    } catch (err: any) {
      setError(err.message || 'Failed to select trump');
      setIsSubmitting(false);
    }
  };

  const suits = [
    { id: 'S', symbol: '♠', color: '#1a1a1a', name: 'Spades' },
    { id: 'C', symbol: '♣', color: '#1a1a1a', name: 'Clubs' },
    { id: 'H', symbol: '♥', color: '#cc0000', name: 'Hearts' },
    { id: 'D', symbol: '♦', color: '#cc0000', name: 'Diamonds' },
  ];

  return (
    <div style={{
      position: 'absolute',
      top: '40%', left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200
    }}>
      <div className="glass-panel animate-fade-in" style={{ padding: '1rem', textAlign: 'center', width: '350px', background: 'rgba(28, 50, 84, 0.95)', border: '2px solid var(--color-carpet-gold)', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
        <h2 style={{ color: 'var(--color-carpet-gold)', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Select Trump Suit</h2>
        <p style={{ marginBottom: '2rem' }}>You have been dealt your first 5 cards. Choose wisely.</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {suits.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectTrump(s.id)}
              disabled={isSubmitting}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '1.5rem 1rem',
                backgroundColor: 'var(--color-carpet-cream)',
                border: '2px solid transparent',
                borderRadius: '8px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                color: s.color,
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
            >
              <span style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '0.5rem' }}>{s.symbol}</span>
              <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
