import { describe, it, expect } from 'vitest';
import { updateScores, isGameOver, computeGameWinner, resolveRound } from '../src/scoring.js';
import { createInitialGameState, applyTrumpSelection, applyCardPlay } from '../src/state.js';
import { generateShuffledDeck } from '../src/deck.js';
import { dealInitial, dealFull } from '../src/deal.js';
import type { GameState, RoundResult, Seat } from '../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRoundResult(winner: Seat, round = 1): RoundResult {
  return {
    roundNumber: round,
    roundSuit: 'H',
    played: {
      0: { id: '14H', rank: 14, suit: 'H' },
      1: { id: '2H', rank: 2, suit: 'H' },
      2: { id: '3H', rank: 3, suit: 'H' },
      3: { id: '4H', rank: 4, suit: 'H' },
    },
    winner,
    winningTeam: winner === 0 || winner === 2 ? 'A' : 'B',
    cutOccurred: false,
  };
}

function buildPlayingState(): GameState {
  const deck = generateShuffledDeck();
  const { player1Hand, remainingDeck } = dealInitial(deck);
  const initial = createInitialGameState('SCORE01', player1Hand, remainingDeck);
  const { hands } = dealFull(player1Hand, remainingDeck);
  return applyTrumpSelection(initial, 'S', hands);
}

// ─── updateScores ─────────────────────────────────────────────────────────────

describe('updateScores', () => {
  it('increments Team A when seat 0 wins', () => {
    const scores = updateScores({ A: 0, B: 0 }, 0);
    expect(scores.A).toBe(1);
    expect(scores.B).toBe(0);
  });

  it('increments Team A when seat 2 wins', () => {
    const scores = updateScores({ A: 5, B: 3 }, 2);
    expect(scores.A).toBe(6);
    expect(scores.B).toBe(3);
  });

  it('increments Team B when seat 1 wins', () => {
    const scores = updateScores({ A: 0, B: 0 }, 1);
    expect(scores.A).toBe(0);
    expect(scores.B).toBe(1);
  });

  it('increments Team B when seat 3 wins', () => {
    const scores = updateScores({ A: 2, B: 4 }, 3);
    expect(scores.A).toBe(2);
    expect(scores.B).toBe(5);
  });

  it('does not mutate the original scores object', () => {
    const original = { A: 3, B: 3 };
    updateScores(original, 0);
    expect(original.A).toBe(3);
  });
});

// ─── isGameOver ───────────────────────────────────────────────────────────────

describe('isGameOver', () => {
  it('returns false when fewer than 13 rounds played', () => {
    const history = Array.from({ length: 12 }, (_, i) => buildRoundResult(0, i + 1));
    expect(isGameOver(history)).toBe(false);
  });

  it('returns true when exactly 13 rounds played', () => {
    const history = Array.from({ length: 13 }, (_, i) => buildRoundResult(0, i + 1));
    expect(isGameOver(history)).toBe(true);
  });

  it('returns false for empty history', () => {
    expect(isGameOver([])).toBe(false);
  });
});

// ─── computeGameWinner ────────────────────────────────────────────────────────

describe('computeGameWinner', () => {
  it('declares Team A winner when A wins 7, B wins 6', () => {
    const history = Array.from({ length: 13 }, (_, i) => buildRoundResult(0, i + 1));
    const state = buildPlayingState();
    const finalState: GameState = {
      ...state,
      roundHistory: history,
      scores: { A: 7, B: 6 },
      phase: 'complete',
    };
    const result = computeGameWinner(finalState);
    expect(result.winner).toBe('A');
    expect(result.scores.A).toBe(7);
    expect(result.scores.B).toBe(6);
  });

  it('declares Team B winner when B wins 9, A wins 4', () => {
    const history = Array.from({ length: 13 }, (_, i) => buildRoundResult(1, i + 1));
    const state = buildPlayingState();
    const finalState: GameState = {
      ...state,
      roundHistory: history,
      scores: { A: 4, B: 9 },
      phase: 'complete',
    };
    const result = computeGameWinner(finalState);
    expect(result.winner).toBe('B');
  });

  it('throws if game is not yet over', () => {
    const state = buildPlayingState();
    expect(() => computeGameWinner(state)).toThrow();
  });
});

// ─── resolveRound ─────────────────────────────────────────────────────────────

describe('resolveRound', () => {
  it('increments round count and updates scores', () => {
    const state = buildPlayingState();
    const roundResult = buildRoundResult(0, 1);
    const post = resolveRound(state, roundResult);

    expect(post.scores.A).toBe(1);
    expect(post.nextRound).toBe(2);
    expect(post.nextLeader).toBe(0);
    expect(post.roundHistory).toHaveLength(1);
  });

  it('sets gameOver=true after round 13', () => {
    const existingHistory = Array.from({ length: 12 }, (_, i) => buildRoundResult(0, i + 1));
    const state = buildPlayingState();
    const stateWith12Rounds: GameState = {
      ...state,
      currentRound: 13,
      roundHistory: existingHistory,
      scores: { A: 7, B: 5 },
    };
    const roundResult = buildRoundResult(0, 13);
    const post = resolveRound(stateWith12Rounds, roundResult);

    expect(post.gameOver).toBe(true);
    expect(post.roundHistory).toHaveLength(13);
  });
});

// ─── Full game simulation ─────────────────────────────────────────────────────

describe('Full game simulation (13 rounds)', () => {
  it('completes a game and reaches phase=complete', () => {
    let state = buildPlayingState();

    // Play through all 13 rounds by having each player play their first card
    for (let round = 0; round < 13; round++) {
      // Each of the 4 players plays one card in turn order
      for (let i = 0; i < 4; i++) {
        const seat = state.currentTurn as Seat;

        // Find a valid card (follow suit if possible)
        const hand = state.hands[seat];
        const roundSuit = state.roundSuit;
        let card = roundSuit ? (hand.find((c) => c.suit === roundSuit) ?? hand[0]!) : hand[0]!;

        state = applyCardPlay(state, seat, card);
      }
    }

    expect(state.phase).toBe('complete');
    expect(state.roundHistory).toHaveLength(13);
    expect(state.scores.A + state.scores.B).toBe(13);
    // One team must have won more
    expect(state.scores.A !== state.scores.B).toBe(true);
  });
});
