'use client';

import React from 'react';
import type { Seat, Team } from '@turuf/game-engine';

interface PlayerSeatProps {
  name: string;
  seat: Seat;
  team: Team;
  isMyTurn: boolean;
  isConnected: boolean;
  isMe: boolean;
  isDealer?: boolean;
  roundsWon?: number;
  isGameOver?: boolean;
  winningTeam?: string | null;
}

export function PlayerSeat({ name, seat, team, isMyTurn, isConnected, isMe, isDealer, roundsWon = 0, isGameOver, winningTeam }: PlayerSeatProps) {
  const isWinner = isGameOver && winningTeam === team;
  const isLoser = isGameOver && winningTeam && winningTeam !== team;

  return (
    <div 
      className="glass-panel player-seat-container"
      style={{
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '120px',
        border: isWinner ? '2px solid var(--color-carpet-gold)' : (isMyTurn ? '2px solid var(--color-carpet-gold)' : '2px solid var(--color-panel-border)'),
        boxShadow: isWinner ? '0 0 25px rgba(207, 168, 94, 0.8)' : (isMyTurn ? '0 0 15px rgba(207, 168, 94, 0.4)' : 'var(--shadow-panel)'),
        opacity: isLoser ? 0.3 : (isConnected ? 1 : 0.6),
        filter: isLoser ? 'grayscale(100%)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          backgroundColor: isConnected ? '#4ade80' : '#f87171' 
        }} />
        <span style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--color-text-primary)' }}>
          {name} {isMe && '(You)'}
        </span>
        {isMyTurn && (
          <span className="gold-text animate-pulse" style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Turn
          </span>
        )}
      </div>
      
      <div className="player-seat-subtitle" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', whiteSpace: 'nowrap' }}>
        Seat {seat + 1} &bull; Team {team} {isDealer && <>&bull; D</>}
      </div>

      {/* 13-Circle Cylindrical Tracker */}
      <div className="player-seat-dots" style={{ 
        display: 'flex', 
        background: 'rgba(0, 0, 0, 0.4)', 
        padding: '4px 6px', 
        borderRadius: '12px', // cylindrical pill shape
        gap: '3px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {Array.from({ length: 13 }).map((_, i) => {
          const isWon = i < roundsWon;
          return (
            <div 
              key={i} 
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isWon ? 'var(--color-carpet-gold)' : 'rgba(255, 255, 255, 0.15)',
                boxShadow: isWon ? '0 0 4px var(--color-carpet-gold)' : 'none',
                transition: 'all 0.3s ease'
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
