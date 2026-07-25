/**
 * Deck generation and cryptographically secure shuffling.
 *
 * SECURITY: shuffle() uses the Web Crypto API (crypto.getRandomValues) for
 * unpredictable card ordering. Never use Math.random() for game-critical randomness.
 */

import { type Card, type Rank, type Suit, ALL_RANKS, ALL_SUITS } from './types';

// ─── Card ID helpers ──────────────────────────────────────────────────────────

/**
 * Build a canonical card ID from rank and suit.
 * Format: "{rank}{suit}", e.g. "14S" (Ace of Spades), "11H" (Jack of Hearts)
 */
export function cardId(rank: Rank, suit: Suit): string {
  return `${rank}${suit}`;
}

/**
 * Parse a card ID string back into rank + suit.
 * Returns null if the ID is invalid (unknown rank or suit).
 */
export function parseCardId(id: string): Card | null {
  const suit = id.slice(-1) as Suit;
  const rankStr = id.slice(0, -1);
  const rank = parseInt(rankStr, 10) as Rank;

  if (!ALL_SUITS.includes(suit)) return null;
  if (!ALL_RANKS.includes(rank)) return null;

  return { id, rank, suit };
}

// ─── Deck generation ──────────────────────────────────────────────────────────

/**
 * Generate a full, ordered 52-card deck.
 * Order is deterministic (suits × ranks) before shuffling.
 */
export function generateDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({ id: cardId(rank, suit), rank, suit });
    }
  }
  return deck;
}

// ─── Cryptographically secure shuffle ────────────────────────────────────────

/**
 * Generate a cryptographically secure random integer in [0, max).
 *
 * Uses rejection sampling to eliminate modulo bias — critical for fair shuffling.
 * The range [0, max) must satisfy max <= 2^32.
 */
function cryptoRandomInt(max: number): number {
  if (max <= 0 || max > 2 ** 32) {
    throw new RangeError(`cryptoRandomInt: max must be in (0, 2^32], got ${max}`);
  }

  // Rejection threshold to eliminate modulo bias
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buf = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= limit);

  return value % max;
}

/**
 * Fisher-Yates shuffle using cryptographically secure randomness.
 * Returns a NEW array — does not mutate the original.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    // Non-null assertion safe: i and j are always within bounds
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/**
 * Generate and shuffle a full 52-card deck in one step.
 * This is the entry point used by the game start flow.
 */
export function generateShuffledDeck(): Card[] {
  return shuffle(generateDeck());
}
