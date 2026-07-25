import { describe, it, expect } from 'vitest';
import {
  validateMove,
  validateTrumpSelection,
  validateGameStart,
  sanitizeChatMessage,
} from '../src/rules.js';
import { createInitialGameState, applyTrumpSelection } from '../src/state.js';
import { generateShuffledDeck } from '../src/deck.js';
import { dealInitial, dealFull } from '../src/deal.js';
import type { GameState, Seat } from '../src/types.js';

// ─── Helper: build a valid 'playing' state for testing ───────────────────────

function buildPlayingState(): GameState {
  const deck = generateShuffledDeck();
  const { player1Hand, remainingDeck } = dealInitial(deck);
  const initial = createInitialGameState('TESTXX', player1Hand, remainingDeck);
  const { hands } = dealFull(player1Hand, remainingDeck);
  return applyTrumpSelection(initial, 'S', hands);
}

describe('validateMove — phase check', () => {
  it('rejects moves when phase is not playing', () => {
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    const state = createInitialGameState('TEST01', player1Hand, remainingDeck);
    // phase is 'initial_deal'
    const result = validateMove(state, 0, player1Hand[0]!.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('WRONG_PHASE');
  });
});

describe('validateMove — turn check', () => {
  it('rejects move from wrong seat', () => {
    const state = buildPlayingState();
    // currentTurn is 0; try to play as seat 1
    const card = state.hands[1][0]!;
    const result = validateMove(state, 1, card.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_YOUR_TURN');
  });

  it('accepts move from correct seat', () => {
    const state = buildPlayingState();
    const card = state.hands[0][0]!;
    const result = validateMove(state, 0, card.id);
    expect(result.ok).toBe(true);
  });
});

describe('validateMove — card ownership', () => {
  it("rejects a card not in the player's hand", () => {
    const state = buildPlayingState();
    // Use a card ID from seat 1's hand while acting as seat 0
    const opponentCard = state.hands[1][0]!;
    const result = validateMove(state, 0, opponentCard.id);
    // Could be NOT_YOUR_TURN or CARD_NOT_IN_HAND depending on turn —
    // here it's seat 0's turn so it should be CARD_NOT_IN_HAND
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CARD_NOT_IN_HAND');
  });

  it('rejects a syntactically invalid card ID', () => {
    const state = buildPlayingState();
    const result = validateMove(state, 0, 'BOGUS');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_CARD_ID');
  });
});

describe('validateMove — round suit compliance', () => {
  it('rejects off-suit play when player has round suit', () => {
    // Build a state with a specific round suit and force the player to have that suit
    const state = buildPlayingState();
    // Find a card in seat 0's hand, use its suit as round suit
    const firstCard = state.hands[0][0]!;
    const roundSuit = firstCard.suit;

    // Manufacture a state mid-round where seat 1 must follow suit
    // and seat 1 has a card of roundSuit
    const cardsOfRoundSuit = state.hands[1].filter((c) => c.suit === roundSuit);
    if (cardsOfRoundSuit.length === 0) return; // Skip if seat 1 has no round suit cards (rare)

    const stateWithRound: GameState = {
      ...state,
      roundSuit,
      currentTurn: 1,
      played: { 0: firstCard },
    };

    // Seat 1 tries to play a non-round-suit card
    const offSuitCard = state.hands[1].find((c) => c.suit !== roundSuit);
    if (!offSuitCard) return; // Skip if seat 1 has only round suit cards

    const result = validateMove(stateWithRound, 1, offSuitCard.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('MUST_FOLLOW_SUIT');
  });

  it('allows off-suit play when player has no round suit cards', () => {
    const state = buildPlayingState();
    const firstCard = state.hands[0][0]!;
    const roundSuit = firstCard.suit;

    // Force seat 1 to have zero cards of roundSuit
    const purgedHand = state.hands[1].filter((c) => c.suit !== roundSuit);
    if (purgedHand.length === 0) return; // Skip edge case

    const stateWithRound: GameState = {
      ...state,
      roundSuit,
      currentTurn: 1,
      played: { 0: firstCard },
      hands: { ...state.hands, 1: purgedHand },
    };

    const offSuitCard = purgedHand[0]!;
    const result = validateMove(stateWithRound, 1, offSuitCard.id);
    expect(result.ok).toBe(true);
  });
});

describe('validateTrumpSelection', () => {
  it('accepts a valid trump selection by seat 0', () => {
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    const initial = createInitialGameState('TEST02', player1Hand, remainingDeck);
    const state: GameState = { ...initial, phase: 'trump_selection' };
    const result = validateTrumpSelection(state, 0, 'H');
    expect(result.ok).toBe(true);
  });

  it('rejects trump selection by seat 1', () => {
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    const initial = createInitialGameState('TEST03', player1Hand, remainingDeck);
    const state: GameState = { ...initial, phase: 'trump_selection' };
    const result = validateTrumpSelection(state, 1, 'H');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_YOUR_TURN');
  });

  it('rejects invalid suit string', () => {
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    const initial = createInitialGameState('TEST04', player1Hand, remainingDeck);
    const state: GameState = { ...initial, phase: 'trump_selection' };
    const result = validateTrumpSelection(state, 0, 'X');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_SUIT');
  });

  it('rejects trump selection in wrong phase', () => {
    const state = buildPlayingState();
    const result = validateTrumpSelection(state, 0, 'S');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('WRONG_PHASE');
  });
});

describe('validateGameStart', () => {
  it('accepts seat 0 with 4 players', () => {
    expect(validateGameStart(0, 4).ok).toBe(true);
  });

  it('rejects non-host seat', () => {
    const result = validateGameStart(1, 4);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NOT_YOUR_TURN');
  });

  it('rejects fewer than 4 players', () => {
    const result = validateGameStart(0, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('WRONG_PHASE');
  });
});

describe('sanitizeChatMessage', () => {
  it('returns null for empty string', () => {
    expect(sanitizeChatMessage('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeChatMessage('   ')).toBeNull();
  });

  it('escapes HTML characters', () => {
    expect(sanitizeChatMessage('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('truncates to 200 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeChatMessage(long)!.length).toBe(200);
  });

  it('passes through normal messages', () => {
    expect(sanitizeChatMessage('Hello everyone!')).toBe('Hello everyone!');
  });

  it('escapes ampersands', () => {
    expect(sanitizeChatMessage('A & B')).toBe('A &amp; B');
  });
});
