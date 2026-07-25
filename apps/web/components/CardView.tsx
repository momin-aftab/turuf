'use client';

import React from 'react';
import { RANK_NAMES, type Card } from '@turuf/game-engine';

interface CardViewProps {
  card?: Card; // If missing or hidden is true, render the back of the card
  hidden?: boolean;
  playable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function CardView({ card, hidden, playable, onClick, style, className = '' }: CardViewProps) {
  const isBack = hidden || !card;

  const suitColors = {
    'S': '#1a1a1a', // Spades (Black)
    'C': '#1a1a1a', // Clubs (Black)
    'H': '#cc0000', // Hearts (Red)
    'D': '#cc0000', // Diamonds (Red)
  };

  const suitSymbols = {
    'S': '♠',
    'C': '♣',
    'H': '♥',
    'D': '♦',
  };

  // Base styling for the card container
  const baseStyle: React.CSSProperties = {
    width: 'var(--card-width)',
    height: 'var(--card-height)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-card)',
    position: 'relative',
    cursor: playable ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    transform: playable ? 'translateY(-4px)' : 'none',
    border: playable ? '2px solid var(--color-carpet-gold)' : 'none',
    userSelect: 'none',
    overflow: 'hidden',
    ...style,
  };

  if (isBack) {
    return (
      <div 
        className={`card-back-engraving ${className}`}
        style={baseStyle}
        onClick={playable ? onClick : undefined}
      />
    );
  }

  // Front of the card
  return (
    <div 
      className={className}
      style={{
        ...baseStyle,
        backgroundColor: 'var(--color-carpet-cream)',
        color: suitColors[card.suit],
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '0.35rem',
      }}
      onClick={playable ? onClick : undefined}
    >
      {/* Top Left Rank/Suit */}
      <div style={{ fontSize: '1rem', fontWeight: 'bold', lineHeight: 1, textAlign: 'left' }}>
        <div>{RANK_NAMES[card.rank]}</div>
        <div style={{ fontSize: '1.25rem', marginTop: '-2px' }}>{suitSymbols[card.suit]}</div>
      </div>
      
      {/* Center Large Suit */}
      <div style={{ fontSize: '2.5rem', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {suitSymbols[card.suit]}
      </div>

      {/* Bottom Right Rank/Suit (inverted) */}
      <div style={{ fontSize: '1rem', fontWeight: 'bold', lineHeight: 1, textAlign: 'right', transform: 'rotate(180deg)' }}>
        <div>{RANK_NAMES[card.rank]}</div>
        <div style={{ fontSize: '1.25rem', marginTop: '-2px' }}>{suitSymbols[card.suit]}</div>
      </div>
    </div>
  );
}
