/**
 * GameState reducers — pure functions that produce the next state from
 * the current state + an action.
 *
 * These are used by the API route handlers after validation passes.
 * All functions are pure: no side effects, no I/O, no mutation.
 */

import { type Card, type GameState, type RoundResult, type Seat, type Suit } from './types';
import { applyMove } from './round';
import { resolveRound } from './scoring';

// ─── After trump is selected ──────────────────────────────────────────────────

/**
 * Transition state from 'initial_deal' to 'trump_selection'.
 * Called immediately after Player 1 receives their initial 5 cards.
 */
export function transitionToTrumpSelection(state: GameState): GameState {
  return {
    ...state,
    phase: 'trump_selection',
    lastActionAt: Date.now(),
  };
}

/**
 * Apply trump selection and transition to playing phase.
 * Called after Player 1 selects a suit and the full deal is complete.
 *
 * @param state   - Current state (phase must be 'trump_selection')
 * @param suit    - The selected master suit
 * @param hands   - Complete 13-card hands for all 4 players (post full-deal)
 */
export function applyTrumpSelection(
  state: GameState,
  suit: Suit,
  hands: Record<Seat, Card[]>
): GameState {
  return {
    ...state,
    phase: 'playing',
    trumpSuit: suit,
    hands,
    deckRemaining: [],
    actionSequence: state.actionSequence + 1,
    lastActionAt: Date.now(),
  };
}

// ─── After a card is played ───────────────────────────────────────────────────

/**
 * Apply a validated card play and return the new full game state.
 *
 * Handles:
 *  - Removing the card from the player's hand
 *  - Setting the round suit from the first card played
 *  - Completing a round (if this was the 4th card)
 *  - Transitioning to the next round or ending the game
 *
 * PRECONDITION: validateMove() must have returned { ok: true } before calling this.
 */
export function applyCardPlay(state: GameState, seat: Seat, card: Card): GameState {
  const moveResult = applyMove(state, seat, card);

  const baseState: GameState = {
    ...state,
    hands: moveResult.hands,
    played: moveResult.played,
    roundSuit: moveResult.roundSuit,
    actionSequence: state.actionSequence + 1,
    lastActionAt: Date.now(),
  };

  if (!moveResult.roundComplete || moveResult.roundResult === null) {
    // Round still in progress — advance the turn
    return {
      ...baseState,
      currentTurn: moveResult.nextTurn!,
    };
  }

  // Round is complete — resolve and transition
  const postRound = resolveRound(baseState, moveResult.roundResult);

  if (postRound.gameOver) {
    return {
      ...baseState,
      scores: postRound.scores,
      roundHistory: postRound.roundHistory,
      phase: 'complete',
      // Clear round-specific state
      played: {},
      roundSuit: null,
    };
  }

  // Start the next round
  return {
    ...baseState,
    scores: postRound.scores,
    roundHistory: postRound.roundHistory,
    currentRound: postRound.nextRound,
    currentLeader: postRound.nextLeader,
    currentTurn: postRound.nextLeader,
    played: {},
    roundSuit: null,
  };
}

// ─── Build the very first GameState (game just started) ───────────────────────

/**
 * Create the initial GameState at the moment the game starts.
 * Phase is 'initial_deal' — Player 1 has 5 cards, trump not yet selected.
 */
export function createInitialGameState(
  lobbyId: string,
  player1InitialHand: Card[],
  remainingDeck: Card[]
): GameState {
  return {
    lobbyId,
    phase: 'initial_deal',
    trumpSuit: null,
    roundSuit: null,
    currentRound: 1,
    currentLeader: 0,
    currentTurn: 0,
    hands: {
      0: player1InitialHand,
      1: [],
      2: [],
      3: [],
    },
    deckRemaining: remainingDeck,
    played: {},
    roundHistory: [],
    scores: { A: 0, B: 0 },
    actionSequence: 0,
    lastActionAt: Date.now(),
  };
}
