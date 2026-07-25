/**
 * Card dealing logic for Turuf.
 *
 * Turuf has a two-phase deal:
 *  Phase 1: Player 1 (seat 0) receives 5 cards → selects trump suit
 *  Phase 2: Player 1 receives remaining 8 cards; Players 1–3 each receive 13 cards
 *
 * All dealing happens server-side. The shuffled deck is consumed linearly.
 */

import {
  type Card,
  type GameState,
  type Seat,
  type Suit,
  CARDS_PER_PLAYER,
  INITIAL_DEAL_COUNT,
  PLAYER_COUNT,
  SEAT_TEAM,
  TOTAL_ROUNDS,
} from './types';

// ─── Phase 1: Initial partial deal to Player 1 ───────────────────────────────

export interface InitialDealResult {
  /** The 5 cards dealt to Player 1 */
  readonly player1Hand: Card[];
  /** The remaining 47 cards (to be dealt after trump selection) */
  readonly remainingDeck: Card[];
}

/**
 * Deal the first 5 cards to Player 1 from a shuffled deck.
 * The remaining 47 cards are held server-side until trump is selected.
 */
export function dealInitial(shuffledDeck: Card[]): InitialDealResult {
  if (shuffledDeck.length !== 52) {
    throw new Error(`dealInitial: expected 52 cards, got ${shuffledDeck.length}`);
  }
  return {
    player1Hand: shuffledDeck.slice(0, INITIAL_DEAL_COUNT),
    remainingDeck: shuffledDeck.slice(INITIAL_DEAL_COUNT),
  };
}

// ─── Phase 2: Full deal after trump selection ─────────────────────────────────

export interface FullDealResult {
  /** All 4 players' complete 13-card hands */
  readonly hands: Record<Seat, Card[]>;
}

/**
 * Complete the deal after trump selection.
 *
 * Distributes the remaining 47 cards:
 *  - Player 1 (seat 0): receives 8 more cards (completing their 13-card hand)
 *  - Players 2, 3, 4 (seats 1, 2, 3): each receives all 13 cards
 *
 * @param player1InitialHand - The 5 cards already dealt to Player 1
 * @param remainingDeck - The 47 remaining cards (from dealInitial)
 */
export function dealFull(player1InitialHand: Card[], remainingDeck: Card[]): FullDealResult {
  if (player1InitialHand.length !== INITIAL_DEAL_COUNT) {
    throw new Error(
      `dealFull: player1 initial hand must have ${INITIAL_DEAL_COUNT} cards, got ${player1InitialHand.length}`
    );
  }
  if (remainingDeck.length !== 52 - INITIAL_DEAL_COUNT) {
    throw new Error(
      `dealFull: remaining deck must have ${52 - INITIAL_DEAL_COUNT} cards, got ${remainingDeck.length}`
    );
  }

  const remaining = [...remainingDeck];

  // Player 1 gets 8 more to complete their 13
  const player1Extra = remaining.splice(0, CARDS_PER_PLAYER - INITIAL_DEAL_COUNT);

  // Players 2, 3, 4 each get 13
  const player2Hand = remaining.splice(0, CARDS_PER_PLAYER);
  const player3Hand = remaining.splice(0, CARDS_PER_PLAYER);
  const player4Hand = remaining.splice(0, CARDS_PER_PLAYER);

  if (remaining.length !== 0) {
    throw new Error(`dealFull: ${remaining.length} cards left over after dealing — logic error`);
  }

  return {
    hands: {
      0: [...player1InitialHand, ...player1Extra],
      1: player2Hand,
      2: player3Hand,
      3: player4Hand,
    },
  };
}

// ─── Auto-play (timeout fallback) ────────────────────────────────────────────

/**
 * Select a random legal card from the player's hand.
 * Used when a player times out during their turn.
 *
 * Prefers following suit if possible; falls back to any card.
 */
export function selectRandomLegalCard(hand: Card[], roundSuit: Suit | null): Card | null {
  if (hand.length === 0) return null;

  if (roundSuit !== null) {
    const suitCards = hand.filter((c) => c.suit === roundSuit);
    if (suitCards.length > 0) {
      return suitCards[Math.floor(Math.random() * suitCards.length)]!;
    }
  }

  return hand[Math.floor(Math.random() * hand.length)]!;
}

// ─── Build initial GameState after trump selection ────────────────────────────

/**
 * Create a minimal GameState skeleton for game start.
 * Called by the API layer after trump is selected and full deal is complete.
 */
export function buildInitialGameState(
  lobbyId: string,
  hands: Record<Seat, Card[]>,
  trumpSuit: Suit
): Omit<GameState, 'actionSequence' | 'lastActionAt'> {
  return {
    lobbyId,
    phase: 'playing',
    trumpSuit,
    roundSuit: null,
    currentRound: 1,
    currentLeader: 0 as Seat,
    currentTurn: 0 as Seat,
    hands,
    deckRemaining: [],
    played: {},
    roundHistory: [],
    scores: { A: 0, B: 0 },
  };
}

// ─── PlayerView projection ────────────────────────────────────────────────────

/**
 * Project the full server GameState into a filtered PlayerView for a specific seat.
 * SECURITY: This is the only function that should be used when sending state to a client.
 * It ensures no player can see another player's hand.
 */
export function toPlayerView(state: GameState, seat: Seat) {
  const handSizes = Object.fromEntries(
    ([0, 1, 2, 3] as Seat[]).map((s) => [s, state.hands[s].length])
  ) as Record<Seat, number>;

  return {
    phase: state.phase,
    trumpSuit: state.trumpSuit,
    roundSuit: state.roundSuit,
    currentRound: state.currentRound,
    currentTurn: state.currentTurn,
    myHand: state.hands[seat],
    handSizes,
    played: state.played,
    scores: state.scores,
    roundHistory: state.roundHistory,
    actionSequence: state.actionSequence,
  };
}
