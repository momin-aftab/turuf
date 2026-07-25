/**
 * Core type definitions for the Turuf card game engine.
 * These types are shared across all engine modules and the API layer.
 */

// ─── Card Types ──────────────────────────────────────────────────────────────

/** The four suits in a standard deck */
export type Suit = 'S' | 'H' | 'D' | 'C';

/**
 * Card ranks: 2–10 are face value, J=11, Q=12, K=13, A=14
 * Stored as numbers for easy comparison arithmetic.
 */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** A single playing card */
export interface Card {
  /** Unique identifier, e.g. "14S" (Ace of Spades), "11H" (Jack of Hearts) */
  readonly id: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

// ─── Player / Team Types ─────────────────────────────────────────────────────

/** Seat positions 0–3, assigned in join order, immutable after game start */
export type Seat = 0 | 1 | 2 | 3;

/** Team A = seats 0+2, Team B = seats 1+3 */
export type Team = 'A' | 'B';

/** Map a seat number to its team */
export const SEAT_TEAM: Record<Seat, Team> = {
  0: 'A',
  1: 'B',
  2: 'A',
  3: 'B',
};

// ─── Game Phase ───────────────────────────────────────────────────────────────

export type GamePhase =
  | 'initial_deal' // P1 has received 5 cards; awaiting trump selection
  | 'trump_selection' // P1 must choose the master suit
  | 'full_deal' // Remaining cards being dealt (transient, < 1s)
  | 'playing' // Active gameplay: rounds 1–13
  | 'complete'; // Game over, final scores available

// ─── Round Types ──────────────────────────────────────────────────────────────

/** One card played by one player in the current round */
export interface PlayedCard {
  readonly seat: Seat;
  readonly card: Card;
}

/** The historical record of a completed round */
export interface RoundResult {
  readonly roundNumber: number;
  readonly roundSuit: Suit;
  readonly played: Record<Seat, Card>;
  readonly winner: Seat;
  readonly winningTeam: Team;
  readonly cutOccurred: boolean; // true if any trump card was played
}

// ─── Game State (server-side, full) ──────────────────────────────────────────

/**
 * The canonical game state. Lives exclusively on the server (in Redis).
 * Never sent to clients in full — clients receive a filtered PlayerView.
 */
export interface GameState {
  readonly lobbyId: string;
  readonly phase: GamePhase;
  readonly trumpSuit: Suit | null;
  readonly roundSuit: Suit | null;
  readonly currentRound: number; // 1–13
  readonly currentLeader: Seat; // who leads the current round
  readonly currentTurn: Seat; // whose turn it currently is
  /** PRIVATE — each player's hand. Never expose another player's hand to a client. */
  readonly hands: Record<Seat, Card[]>;
  /** Undealt cards remaining in the deck (only non-empty during initial deal phase) */
  readonly deckRemaining: Card[];
  /** Cards played so far in the current round (keyed by seat) */
  readonly played: Partial<Record<Seat, Card>>;
  readonly roundHistory: RoundResult[];
  readonly scores: Record<Team, number>; // rounds won per team
  /** Monotonically increasing counter — used to prevent replay attacks */
  readonly actionSequence: number;
  readonly lastActionAt: number; // unix ms timestamp
}

// ─── Player View (what a specific client receives) ────────────────────────────

/**
 * The filtered game state sent to a specific player.
 * Contains only what that player is allowed to see.
 */
export interface PlayerView {
  readonly phase: GamePhase;
  readonly trumpSuit: Suit | null;
  readonly roundSuit: Suit | null;
  readonly currentRound: number;
  readonly currentTurn: Seat;
  /** This player's own hand */
  readonly myHand: Card[];
  /** How many cards each seat holds (not which cards — for displaying opponent hand sizes) */
  readonly handSizes: Record<Seat, number>;
  readonly played: Partial<Record<Seat, Card>>;
  readonly scores: Record<Team, number>;
  readonly roundHistory: RoundResult[];
  readonly actionSequence: number;
}

// ─── Validation Result ────────────────────────────────────────────────────────

export type ValidationError =
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'WRONG_PHASE'
  | 'INVALID_CARD_ID'
  | 'INVALID_SUIT';

export type ValidationResult =
  { ok: true } | { ok: false; error: ValidationError; message: string };

// ─── All available suits (for validation) ────────────────────────────────────

export const ALL_SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const ALL_RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export const RANK_NAMES: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/** Number of rounds in a full game */
export const TOTAL_ROUNDS = 13 as const;

/** Cards dealt to Player 1 before trump selection */
export const INITIAL_DEAL_COUNT = 5 as const;

/** Total cards per player */
export const CARDS_PER_PLAYER = 13 as const;

/** Number of players */
export const PLAYER_COUNT = 4 as const;
