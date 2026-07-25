'use client';

import React from 'react';
import type { Card } from '@turuf/game-engine';
import { CardView } from './CardView';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';

export function Hand() {
  const { myHand, view, mySeat, optimisticPlayCard, setError } = useGameStore();

  if (!view || mySeat === null) return null;

  const isRoundComplete = Object.keys(view.played).length === 4;
  const haveIPlayed = !!view.played[mySeat];
  const isMyTurn = view.currentTurn === mySeat && !haveIPlayed && !isRoundComplete;
  const isPlayingPhase = view.phase === 'playing';

  const handlePlayCard = async (card: Card) => {
    if (!isMyTurn || !isPlayingPhase) return;

    try {
      // Optimistically update the UI immediately
      optimisticPlayCard(card);
      // Send to server
      await apiClient.game.action(card.id, view.actionSequence);
    } catch (err: any) {
      setError(err.message || 'Failed to play card');
      // If it fails, the next state sync or error will reconcile
    }
  };

  const sortedHand = [...myHand].sort((a, b) => {
    const suitOrder = { S: 1, H: 2, D: 3, C: 4 };
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return b.rank - a.rank; // Descending rank
  });

  return (
    <div className="hand-container">
      {sortedHand.map((card) => {
        // Enforce round suit rules visually
        let isLegal = true;
        if (view.roundSuit) {
          const hasRoundSuit = myHand.some(c => c.suit === view.roundSuit);
          if (hasRoundSuit && card.suit !== view.roundSuit) {
            isLegal = false;
          }
        }

        const playable = isMyTurn && isPlayingPhase && isLegal;
        const isTurnState = isMyTurn && isPlayingPhase;
        
        let stateClass = "";
        if (isTurnState) {
          stateClass = playable ? "playable-card hover-lift" : "unplayable-card";
        }

        return (
          <div key={card.id} style={{
            cursor: playable ? 'pointer' : 'default',
          }}
          className={`hand-card-wrapper ${stateClass}`}
          >
            <CardView 
              card={card} 
              playable={playable} 
              onClick={() => handlePlayCard(card)} 
            />
          </div>
        );
      })}
    </div>
  );
}
