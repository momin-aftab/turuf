'use client';

import React, { useState, useEffect } from 'react';
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
  isBot?: boolean;
  /** Unix ms timestamp when the turn expires (null = no timer) */
  turnDeadline?: number | null;
}

export function PlayerSeat({ 
  name, seat, team, isMyTurn, isConnected, isMe, isDealer, 
  roundsWon = 0, isGameOver, winningTeam, isBot = false, turnDeadline 
}: PlayerSeatProps) {
  const isWinner = isGameOver && winningTeam === team;
  const isLoser = isGameOver && winningTeam && winningTeam !== team;

  // ── Countdown Timer ─────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isMyTurn || !turnDeadline || isGameOver) {
      setSecondsLeft(null);
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((turnDeadline! - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }

    tick(); // Set immediately
    const interval = setInterval(tick, 250); // Update 4x/sec for smooth countdown

    return () => clearInterval(interval);
  }, [isMyTurn, turnDeadline, isGameOver]);

  const timerFraction = secondsLeft !== null ? secondsLeft / 20 : 1;
  const isUrgent = secondsLeft !== null && secondsLeft <= 5;

  return (
    <div 
      className="glass-panel player-seat-container"
      style={{
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '120px',
        border: isWinner 
          ? '2px solid var(--color-carpet-gold)' 
          : (isMyTurn 
            ? `2px solid ${isUrgent ? '#ff4444' : 'var(--color-carpet-gold)'}` 
            : '2px solid var(--color-panel-border)'),
        boxShadow: isWinner 
          ? '0 0 25px rgba(207, 168, 94, 0.8)' 
          : (isMyTurn 
            ? `0 0 15px ${isUrgent ? 'rgba(255, 68, 68, 0.6)' : 'rgba(207, 168, 94, 0.4)'}` 
            : 'var(--shadow-panel)'),
        opacity: isLoser ? 0.3 : (isConnected && !isBot ? 1 : 0.75),
        filter: isLoser ? 'grayscale(100%)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          backgroundColor: isBot ? '#f59e0b' : (isConnected ? '#4ade80' : '#f87171') 
        }} />
        <span style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--color-text-primary)' }}>
          {name} {isMe && '(You)'} {isBot && '🤖'}
        </span>
        {isMyTurn && !isGameOver && (
          <span 
            className="animate-pulse" 
            style={{ 
              fontSize: '0.75rem', 
              fontWeight: 'bold', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              color: isUrgent ? '#ff4444' : 'var(--color-carpet-gold)',
            }}
          >
            {isMe ? 'Your Turn' : 'Playing...'}
          </span>
        )}
      </div>
      
      <div className="player-seat-subtitle" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', whiteSpace: 'nowrap' }}>
        Seat {seat + 1} &bull; Team {team} {isDealer && <>&bull; D</>}
        {isBot && <>&bull; <span style={{ color: '#f59e0b' }}>Bot</span></>}
      </div>

      {/* Countdown Timer Bar */}
      {isMyTurn && secondsLeft !== null && !isGameOver && (
        <div style={{
          width: '100%',
          height: '3px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '2px',
          marginBottom: '0.4rem',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${timerFraction * 100}%`,
            height: '100%',
            background: isUrgent 
              ? 'linear-gradient(90deg, #ff4444, #ff6b6b)' 
              : 'linear-gradient(90deg, var(--color-carpet-gold), #e6c675)',
            borderRadius: '2px',
            transition: 'width 0.25s linear, background 0.3s ease',
          }} />
        </div>
      )}

      {/* Countdown Number */}
      {isMyTurn && secondsLeft !== null && !isGameOver && (
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 'bold',
          color: isUrgent ? '#ff4444' : 'var(--color-carpet-gold)',
          marginBottom: '0.3rem',
          fontVariantNumeric: 'tabular-nums',
          transition: 'color 0.3s ease',
        }}>
          {secondsLeft}s
        </div>
      )}

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
