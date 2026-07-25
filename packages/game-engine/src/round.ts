/**
 * Round resolution logic for Turuf.
 *
 * Implements the trump (cutting) and round suit winning rules:
 *
 *  - Every card has an effective value:
 *      trump card  → 14 + rank  (so Trump-2 = 16, Trump-A = 28)
 *      round suit  → rank       (2–14)
 *      other suit  → 0          (out-of-suit, non-trump cards are worthless)
 *
 *  - If exactly one player cuts (plays trump): they win automatically.
 *  - If multiple players cut: highest trump wins.
 *  - If no trump played: highest round-suit card wins.
 */

import {
  type Card,
  type GameState,
  type RoundResult,
  type Seat,
  type Suit,
  SEAT_TEAM,
} from './types';

// ─── Effective card value ─────────────────────────────────────────────────────

/**
 * Calculate the effective winning value of a card in the context of a round.
 *
 * @param card       - The card being evaluated
 * @param trumpSuit  - The master suit for this game
 * @param roundSuit  - The suit of the first card played this round
 */
export function effectiveValue(card: Card, trumpSuit: Suit, roundSuit: Suit): number {
  if (card.suit === trumpSuit) {
    // Trump card: 14 + rank to ensure all trumps beat all non-trumps
    return 14 + card.rank;
  }
  if (card.suit === roundSuit) {
    return card.rank;
  }
  // Off-suit, non-trump: cannot win
  return 0;
}

// ─── Round winner calculation ─────────────────────────────────────────────────

/**
 * Determine the winner of a completed round.
 *
 * @param played     - All 4 cards played this round, keyed by seat
 * @param trumpSuit  - The game's master suit
 * @param roundSuit  - The suit of the first card played this round
 * @returns The seat number of the round winner
 */
export function computeRoundWinner(
  played: Record<Seat, Card>,
  trumpSuit: Suit,
  roundSuit: Suit
): Seat {
  const seats: Seat[] = [0, 1, 2, 3];

  return seats.reduce<Seat>((champion, challenger) => {
    const champValue = effectiveValue(played[champion], trumpSuit, roundSuit);
    const challValue = effectiveValue(played[challenger], trumpSuit, roundSuit);
    return challValue > champValue ? challenger : champion;
  }, 0);
}

// ─── Round completion check ───────────────────────────────────────────────────

/**
 * Check whether all 4 players have played a card in the current round.
 */
export function isRoundComplete(played: Partial<Record<Seat, Card>>): played is Record<Seat, Card> {
  return (
    played[0] !== undefined &&
    played[1] !== undefined &&
    played[2] !== undefined &&
    played[3] !== undefined
  );
}

// ─── Round result builder ─────────────────────────────────────────────────────

/**
 * Build a RoundResult record after all 4 players have played.
 * Encapsulates winner calculation and trump detection.
 */
export function buildRoundResult(
  roundNumber: number,
  played: Record<Seat, Card>,
  trumpSuit: Suit,
  roundSuit: Suit
): RoundResult {
  const winner = computeRoundWinner(played, trumpSuit, roundSuit);
  const cutOccurred = Object.values(played).some((c) => c.suit === trumpSuit);

  return {
    roundNumber,
    roundSuit,
    played,
    winner,
    winningTeam: SEAT_TEAM[winner],
    cutOccurred,
  };
}

// ─── State transition after a card is played ──────────────────────────────────

export interface ApplyMoveResult {
  /** Updated hands (card removed from active player's hand) */
  readonly hands: Record<Seat, Card[]>;
  /** Updated played map (card added for this seat) */
  readonly played: Partial<Record<Seat, Card>>;
  /** Round suit (set from first card if this was first play of the round) */
  readonly roundSuit: Suit;
  /** Whether this card play completed the round */
  readonly roundComplete: boolean;
  /** Round result (only present when roundComplete is true) */
  readonly roundResult: RoundResult | null;
  /** The next player to act (null if round is complete — next leader sets currentTurn) */
  readonly nextTurn: Seat | null;
}

/**
 * Apply a validated card play to the current game state.
 * Returns a pure delta — does NOT mutate state.
 *
 * Called by the API route AFTER validateMove() passes.
 */
export function applyMove(state: GameState, seat: Seat, card: Card): ApplyMoveResult {
  // Remove card from hand
  const newHand = state.hands[seat].filter((c) => c.id !== card.id);
  const newHands: Record<Seat, Card[]> = { ...state.hands, [seat]: newHand };

  // Add card to played map
  const newPlayed: Partial<Record<Seat, Card>> = { ...state.played, [seat]: card };

  // Determine round suit (first card played sets it)
  const roundSuit: Suit = state.roundSuit ?? card.suit;

  // Check if round is now complete
  if (isRoundComplete(newPlayed)) {
    const trumpSuit = state.trumpSuit!; // Always set when phase === 'playing'
    const roundResult = buildRoundResult(state.currentRound, newPlayed, trumpSuit, roundSuit);

    return {
      hands: newHands,
      played: newPlayed,
      roundSuit,
      roundComplete: true,
      roundResult,
      nextTurn: null,
    };
  }

  // Round not yet complete — advance turn to the next seat
  const nextTurn: Seat = ((seat + 1) % 4) as Seat;

  return {
    hands: newHands,
    played: newPlayed,
    roundSuit,
    roundComplete: false,
    roundResult: null,
    nextTurn,
  };
}
