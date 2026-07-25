import { describe, it, expect } from 'vitest';
import {
  effectiveValue,
  computeRoundWinner,
  isRoundComplete,
  buildRoundResult,
  applyMove,
} from '../src/round.js';
import type { Card, Seat } from '../src/types.js';
import { generateShuffledDeck } from '../src/deck.js';
import { dealInitial, dealFull } from '../src/deal.js';
import { createInitialGameState, applyTrumpSelection } from '../src/state.js';

// ─── Card factory helpers ─────────────────────────────────────────────────────
const c = (rank: number, suit: string): Card => ({
  id: `${rank}${suit}`,
  rank: rank as Card['rank'],
  suit: suit as Card['suit'],
});

describe('effectiveValue', () => {
  it('trump card = 14 + rank', () => {
    expect(effectiveValue(c(2, 'S'), 'S', 'H')).toBe(16); // Trump-2
    expect(effectiveValue(c(14, 'S'), 'S', 'H')).toBe(28); // Trump-Ace
    expect(effectiveValue(c(11, 'S'), 'S', 'H')).toBe(25); // Trump-Jack
  });

  it('round suit card = rank', () => {
    expect(effectiveValue(c(14, 'H'), 'S', 'H')).toBe(14); // Ace of round suit
    expect(effectiveValue(c(7, 'H'), 'S', 'H')).toBe(7);
  });

  it('off-suit non-trump = 0', () => {
    expect(effectiveValue(c(14, 'D'), 'S', 'H')).toBe(0);
    expect(effectiveValue(c(13, 'C'), 'S', 'H')).toBe(0);
  });

  it('when trump == round suit, trump value takes precedence', () => {
    // Both suit = trump; value should be 14 + rank
    expect(effectiveValue(c(10, 'S'), 'S', 'S')).toBe(24);
  });
});

describe('computeRoundWinner — no trump played', () => {
  it('highest round-suit card wins', () => {
    const played: Record<Seat, Card> = {
      0: c(10, 'H'),
      1: c(7, 'H'),
      2: c(14, 'H'), // winner
      3: c(3, 'H'),
    };
    expect(computeRoundWinner(played, 'S', 'H')).toBe(2);
  });

  it('only round-suit cards can win (off-suit cards lose)', () => {
    const played: Record<Seat, Card> = {
      0: c(14, 'H'), // winner (round suit)
      1: c(13, 'D'), // off-suit, value = 0
      2: c(12, 'C'), // off-suit, value = 0
      3: c(2, 'H'), // round suit
    };
    expect(computeRoundWinner(played, 'S', 'H')).toBe(0);
  });

  it('ace beats king in round suit', () => {
    const played: Record<Seat, Card> = {
      0: c(13, 'H'),
      1: c(14, 'H'), // winner
      2: c(12, 'H'),
      3: c(11, 'H'),
    };
    expect(computeRoundWinner(played, 'S', 'H')).toBe(1);
  });
});

describe('computeRoundWinner — exactly one trump played', () => {
  it('the single trump player wins regardless of trump rank', () => {
    const played: Record<Seat, Card> = {
      0: c(14, 'H'), // Ace of round suit
      1: c(13, 'H'), // King of round suit
      2: c(2, 'S'), // Trump-2 (lowest trump) → wins
      3: c(12, 'H'),
    };
    expect(computeRoundWinner(played, 'S', 'H')).toBe(2);
  });
});

describe('computeRoundWinner — multiple trumps played', () => {
  it('highest trump wins', () => {
    const played: Record<Seat, Card> = {
      0: c(14, 'H'), // round suit ace
      1: c(5, 'S'), // trump-5 = 19
      2: c(14, 'S'), // trump-Ace = 28 → wins
      3: c(10, 'S'), // trump-10 = 24
    };
    expect(computeRoundWinner(played, 'S', 'H')).toBe(2);
  });

  it('all four players play trump — highest wins', () => {
    const played: Record<Seat, Card> = {
      0: c(2, 'S'), // 16
      1: c(14, 'S'), // 28 → wins
      2: c(9, 'S'), // 23
      3: c(13, 'S'), // 27
    };
    expect(computeRoundWinner(played, 'S', 'S')).toBe(1);
  });
});

describe('isRoundComplete', () => {
  it('returns true when all 4 seats have played', () => {
    const played: Partial<Record<Seat, Card>> = {
      0: c(5, 'H'),
      1: c(6, 'H'),
      2: c(7, 'H'),
      3: c(8, 'H'),
    };
    expect(isRoundComplete(played)).toBe(true);
  });

  it('returns false when only 3 seats have played', () => {
    const played: Partial<Record<Seat, Card>> = {
      0: c(5, 'H'),
      1: c(6, 'H'),
      2: c(7, 'H'),
    };
    expect(isRoundComplete(played)).toBe(false);
  });

  it('returns false for empty played map', () => {
    expect(isRoundComplete({})).toBe(false);
  });
});

describe('buildRoundResult', () => {
  it('detects cut (trump played)', () => {
    const played: Record<Seat, Card> = {
      0: c(14, 'H'),
      1: c(13, 'H'),
      2: c(2, 'S'), // trump played
      3: c(12, 'H'),
    };
    const result = buildRoundResult(1, played, 'S', 'H');
    expect(result.cutOccurred).toBe(true);
    expect(result.winner).toBe(2);
    expect(result.winningTeam).toBe('A'); // seat 2 = team A
  });

  it('no cut when no trump played', () => {
    const played: Record<Seat, Card> = {
      0: c(14, 'H'),
      1: c(7, 'H'),
      2: c(9, 'H'),
      3: c(4, 'H'),
    };
    const result = buildRoundResult(1, played, 'S', 'H');
    expect(result.cutOccurred).toBe(false);
    expect(result.winner).toBe(0); // Ace wins
  });

  it('assigns correct winningTeam — seat 1 wins → team B', () => {
    const played: Record<Seat, Card> = {
      0: c(2, 'H'),
      1: c(14, 'H'), // wins
      2: c(3, 'H'),
      3: c(4, 'H'),
    };
    const result = buildRoundResult(3, played, 'S', 'H');
    expect(result.winningTeam).toBe('B');
  });
});

describe('applyMove', () => {
  function buildState() {
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    const initial = createInitialGameState('TESTAPPLY', player1Hand, remainingDeck);
    const { hands } = dealFull(player1Hand, remainingDeck);
    return applyTrumpSelection(initial, 'S', hands);
  }

  it("removes the played card from the player's hand", () => {
    const state = buildState();
    const card = state.hands[0][0]!;
    const result = applyMove(state, 0, card);
    expect(result.hands[0]).not.toContainEqual(card);
    expect(result.hands[0]).toHaveLength(12);
  });

  it('adds the card to the played map', () => {
    const state = buildState();
    const card = state.hands[0][0]!;
    const result = applyMove(state, 0, card);
    expect(result.played[0]).toEqual(card);
  });

  it('sets the round suit from the first card', () => {
    const state = buildState();
    const card = state.hands[0][0]!;
    const result = applyMove(state, 0, card);
    expect(result.roundSuit).toBe(card.suit);
  });

  it('round is not complete after first card', () => {
    const state = buildState();
    const card = state.hands[0][0]!;
    const result = applyMove(state, 0, card);
    expect(result.roundComplete).toBe(false);
    expect(result.nextTurn).toBe(1);
  });

  it('round is complete after 4th card', () => {
    let state = buildState();
    const seats: Seat[] = [0, 1, 2, 3];
    let current = state;

    for (let i = 0; i < 3; i++) {
      const seat = seats[i]!;
      const card = current.hands[seat][0]!;
      const moveResult = applyMove(current, seat, card);
      current = {
        ...current,
        hands: moveResult.hands,
        played: moveResult.played,
        roundSuit: moveResult.roundSuit,
        currentTurn: moveResult.nextTurn!,
      };
    }

    // 4th card
    const lastSeat = 3 as Seat;
    const lastCard = current.hands[lastSeat][0]!;
    const finalResult = applyMove(current, lastSeat, lastCard);
    expect(finalResult.roundComplete).toBe(true);
    expect(finalResult.roundResult).not.toBeNull();
  });
});
