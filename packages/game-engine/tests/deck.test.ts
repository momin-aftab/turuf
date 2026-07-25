import { describe, it, expect } from 'vitest';
import { generateDeck, generateShuffledDeck, shuffle, cardId, parseCardId } from '../src/deck.js';
import { ALL_RANKS, ALL_SUITS } from '../src/types.js';

describe('generateDeck', () => {
  it('produces exactly 52 cards', () => {
    expect(generateDeck()).toHaveLength(52);
  });

  it('contains all 4 suits × 13 ranks', () => {
    const deck = generateDeck();
    for (const suit of ALL_SUITS) {
      for (const rank of ALL_RANKS) {
        expect(deck.some((c) => c.suit === suit && c.rank === rank)).toBe(true);
      }
    }
  });

  it('contains no duplicate card IDs', () => {
    const deck = generateDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(52);
  });

  it('assigns correct IDs matching rank+suit', () => {
    const deck = generateDeck();
    for (const card of deck) {
      expect(card.id).toBe(`${card.rank}${card.suit}`);
    }
  });
});

describe('cardId', () => {
  it('formats Ace of Spades correctly', () => {
    expect(cardId(14, 'S')).toBe('14S');
  });

  it('formats 2 of Hearts correctly', () => {
    expect(cardId(2, 'H')).toBe('2H');
  });

  it('formats Jack of Diamonds correctly', () => {
    expect(cardId(11, 'D')).toBe('11D');
  });
});

describe('parseCardId', () => {
  it('parses a valid Ace of Spades', () => {
    const card = parseCardId('14S');
    expect(card).not.toBeNull();
    expect(card!.rank).toBe(14);
    expect(card!.suit).toBe('S');
  });

  it('parses 2 of Hearts', () => {
    const card = parseCardId('2H');
    expect(card!.rank).toBe(2);
    expect(card!.suit).toBe('H');
  });

  it('parses 10 of Clubs', () => {
    const card = parseCardId('10C');
    expect(card!.rank).toBe(10);
    expect(card!.suit).toBe('C');
  });

  it('returns null for invalid suit', () => {
    expect(parseCardId('14X')).toBeNull();
  });

  it('returns null for invalid rank', () => {
    expect(parseCardId('1S')).toBeNull();
    expect(parseCardId('15S')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCardId('')).toBeNull();
  });

  it('returns null for completely invalid string', () => {
    expect(parseCardId('garbage')).toBeNull();
  });
});

describe('shuffle', () => {
  it('returns an array of the same length', () => {
    const deck = generateDeck();
    expect(shuffle(deck)).toHaveLength(52);
  });

  it('contains the same set of cards (no duplicates, no missing)', () => {
    const deck = generateDeck();
    const shuffled = shuffle(deck);
    const originalIds = new Set(deck.map((c) => c.id));
    const shuffledIds = new Set(shuffled.map((c) => c.id));
    expect(shuffledIds).toEqual(originalIds);
  });

  it('does not mutate the original array', () => {
    const deck = generateDeck();
    const original = [...deck];
    shuffle(deck);
    expect(deck).toEqual(original);
  });

  it('produces different orderings across multiple shuffles (probabilistic)', () => {
    // The probability of two 52-card shuffles being identical is 1/52! ≈ 10^-67
    const deck = generateDeck();
    const s1 = shuffle(deck)
      .map((c) => c.id)
      .join(',');
    const s2 = shuffle(deck)
      .map((c) => c.id)
      .join(',');
    const s3 = shuffle(deck)
      .map((c) => c.id)
      .join(',');
    // At least two should differ (astronomically unlikely to be all equal)
    const allSame = s1 === s2 && s2 === s3;
    expect(allSame).toBe(false);
  });
});

describe('generateShuffledDeck', () => {
  it('returns 52 cards', () => {
    expect(generateShuffledDeck()).toHaveLength(52);
  });

  it('contains all 52 unique card IDs', () => {
    const deck = generateShuffledDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });
});
