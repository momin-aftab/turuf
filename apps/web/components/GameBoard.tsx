'use client';

import React, { useState, useEffect } from 'react';
import { Seat, computeRoundWinner } from '@turuf/game-engine';
import { CardView } from './CardView';
import { useGameStore } from '@/store/game';
import { PlayerSeat } from './PlayerSeat';

export function GameBoard() {
  const { view, players, mySeat, botSeats, turnDeadline } = useGameStore();
  const [showHighlight, setShowHighlight] = useState(false);

  // Effect to delay highlight by 2.5 seconds when a round completes
  const isRoundComplete = view ? Object.keys(view.played).length === 4 : false;
  
  useEffect(() => {
    if (isRoundComplete) {
      const timer = setTimeout(() => {
        setShowHighlight(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowHighlight(false);
    }
  }, [isRoundComplete]);

  if (!view) return null;

  // Render seats relative to 'mySeat' being at the bottom.
  // 0: Bottom (Me), 1: Left, 2: Top (Partner), 3: Right
  const getRelativeSeat = (absoluteSeat: Seat): number => {
    if (mySeat === null) return absoluteSeat; // Spectator view
    return (absoluteSeat - mySeat + 4) % 4;
  };

  // Find player data for a seat
  const getPlayer = (seat: Seat) => players.find(p => p.seat === seat);

  // Position styles for the 4 relative positions
  const seatStyles: Record<number, React.CSSProperties> = {
    0: { bottom: '0', left: '50%', transform: 'translateX(-50%)', position: 'absolute', zIndex: 10 }, // Me
    1: { left: '0', top: '50%', transform: 'translateY(-50%)', position: 'absolute', zIndex: 10 }, // Left
    2: { top: '0', left: '50%', transform: 'translateX(-50%)', position: 'absolute', zIndex: 10 }, // Top
    3: { right: '0', top: '50%', transform: 'translateY(-50%)', position: 'absolute', zIndex: 10 }, // Right
  };

  // Position styles for the cards played in the center
  const cardStyles: Record<number, React.CSSProperties> = {
    0: { top: '50%', left: '50%', transform: 'translate(-50%, -50%) translateY(45px)', position: 'absolute', zIndex: 4 },
    1: { top: '50%', left: '50%', transform: 'translate(-50%, -50%) translateX(-45px)', position: 'absolute', zIndex: 3 },
    2: { top: '50%', left: '50%', transform: 'translate(-50%, -50%) translateY(-45px)', position: 'absolute', zIndex: 1 },
    3: { top: '50%', left: '50%', transform: 'translate(-50%, -50%) translateX(45px)', position: 'absolute', zIndex: 2 },
  };

  const suitSymbols: Record<string, string> = {
    'S': '♠', 'C': '♣', 'H': '♥', 'D': '♦',
  };

  const isGameOver = view.phase === 'complete';
  const winningTeam = isGameOver ? (view.scores.A > view.scores.B ? 'A' : (view.scores.B > view.scores.A ? 'B' : null)) : null;

  // Compute winning card if round is complete (4 cards played)
  let winningCardSeat: Seat | null = null;
  if (isRoundComplete && view.trumpSuit && view.roundSuit) {
    winningCardSeat = computeRoundWinner(view.played as any, view.trumpSuit, view.roundSuit);
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: '800px',
      maxHeight: 'calc(100vh - 280px)',
      aspectRatio: '1/1',
      margin: '0 auto',
      padding: '1rem'
    }}>
      
      {/* The Visual Circular Table */}
      <div style={{
        position: 'absolute',
        top: '15%',
        bottom: '15%',
        left: '15%',
        right: '15%',
        background: 'var(--color-panel-bg)',
        border: '2px solid var(--color-panel-border)',
        borderRadius: '50%',
        boxShadow: 'var(--shadow-panel)',
        zIndex: 0
      }} />

      {/* Position 1: Round Number */}
      <div style={{
        position: 'absolute',
        top: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        zIndex: 1,
        opacity: isGameOver ? 0 : 0.8,
        transition: 'opacity 0.5s'
      }}>
        <div style={{ color: 'var(--color-carpet-gold)', fontWeight: 'bold', fontSize: '1.25rem' }}>
          Round {view.currentRound} / 13
        </div>
      </div>

      {/* Position 2: Trump Info */}
      <div style={{
        position: 'absolute',
        bottom: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        zIndex: 1,
        opacity: isGameOver ? 0 : 0.8,
        transition: 'opacity 0.5s'
      }}>
        {view.trumpSuit && (
          <div style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
            <span>Trump:</span> 
            <span style={{ color: ['H', 'D'].includes(view.trumpSuit) ? '#ff4444' : '#fff' }}>
              {suitSymbols[view.trumpSuit]}
            </span>
          </div>
        )}
      </div>

      {/* Game Over Overlay */}
      {isGameOver && (
        <div style={{
          position: 'absolute',
          top: '25%', left: '25%', right: '25%', bottom: '25%',
          background: 'var(--color-panel-bg)',
          border: '2px solid var(--color-carpet-gold)',
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          boxShadow: '0 0 30px rgba(0,0,0,0.8)',
          animation: 'fadeIn 0.5s ease-out'
        }}>
          <h2 style={{ fontSize: '2rem', color: 'var(--color-carpet-gold)', marginBottom: '1rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            Team {winningTeam} Wins!
          </h2>
          <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: winningTeam === 'A' ? 'var(--color-carpet-gold)' : '#fff' }}>
            Team A: {view.scores.A}
          </div>
          <div style={{ fontSize: '1.25rem', marginBottom: '2rem', color: winningTeam === 'B' ? 'var(--color-carpet-gold)' : '#fff' }}>
            Team B: {view.scores.B}
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.href = '/'}
            style={{ width: 'auto', padding: '0.5rem 1.5rem' }}
          >
            Back to Lobby
          </button>
        </div>
      )}

      {/* Players and Played Cards */}
      {[0, 1, 2, 3].map((absoluteSeat) => {
        const seat = absoluteSeat as Seat;
        const relativePos = getRelativeSeat(seat);
        const player = getPlayer(seat);
        
        if (!player) return null;

        const playedCard = view.played[seat];
        const roundsWon = view.roundHistory.filter(r => r.winner === seat).length;

        return (
          <React.Fragment key={seat}>
            {/* Seat Info */}
            <div style={seatStyles[relativePos]}>
              <PlayerSeat 
                name={player.name}
                seat={seat}
                team={player.team}
                isMyTurn={!isGameOver && view.currentTurn === seat}
                isConnected={!botSeats.has(seat)}
                isMe={seat === mySeat}
                isDealer={seat === 0}
                roundsWon={roundsWon}
                isGameOver={isGameOver}
                winningTeam={winningTeam}
                isBot={botSeats.has(seat)}
                turnDeadline={view.currentTurn === seat ? turnDeadline : null}
              />
            </div>
            
            {/* Played Card */}
            {playedCard && (
              <div style={cardStyles[relativePos]}>
                <div style={{
                  transition: 'all 0.3s ease',
                  boxShadow: (showHighlight && winningCardSeat === seat) ? '0 0 25px 5px var(--color-carpet-gold)' : 'none',
                  borderRadius: '6px',
                  transform: (showHighlight && winningCardSeat === seat) ? 'scale(1.15)' : 'scale(1)',
                  opacity: (showHighlight && winningCardSeat !== seat) ? 0.4 : 1,
                  filter: (showHighlight && winningCardSeat !== seat) ? 'brightness(0.6)' : 'none',
                  zIndex: (showHighlight && winningCardSeat === seat) ? 10 : 'inherit'
                }}>
                  <CardView card={playedCard} />
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
