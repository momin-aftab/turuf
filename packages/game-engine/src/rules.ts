/**
 * Move validation — the security core of the game engine.
 *
 * All validation is server-side only. These functions never trust
 * any value that originated from a client.
 *
 * SECURITY: Every client action must pass through validateMove() before
 * any state mutation occurs. validateTrumpSelection() guards trump choice.
 */

import {
  type Card,
  type GameState,
  type Seat,
  type Suit,
  type ValidationResult,
  ALL_SUITS,
} from './types';
import { parseCardId } from './deck';

// ─── Card play validation ─────────────────────────────────────────────────────

/**
 * Validate a player's attempted card play.
 *
 * Checks (in order):
 *  1. Game is in the 'playing' phase
 *  2. The card ID is syntactically valid
 *  3. It is this player's turn
 *  4. The player actually holds this card
 *  5. Round suit compliance (must follow suit if able)
 *
 * @param state  - Current full game state (server-side)
 * @param seat   - The seat attempting the action (from verified JWT)
 * @param cardId - The card ID string sent by the client
 */
export function validateMove(state: GameState, seat: Seat, cardId: string): ValidationResult {
  // 1. Phase check
  if (state.phase !== 'playing') {
    return {
      ok: false,
      error: 'WRONG_PHASE',
      message: 'Game is not in an active playing phase.',
    };
  }

  // 2. Parse card ID
  const card = parseCardId(cardId);
  if (card === null) {
    return {
      ok: false,
      error: 'INVALID_CARD_ID',
      message: `"${cardId}" is not a valid card identifier.`,
    };
  }

  // 3. Turn check
  if (state.currentTurn !== seat) {
    return {
      ok: false,
      error: 'NOT_YOUR_TURN',
      message: `It is seat ${state.currentTurn}'s turn, not seat ${seat}.`,
    };
  }

  // 4. Card ownership check
  const hand = state.hands[seat];
  const ownsCard = hand.some((c) => c.id === card.id);
  if (!ownsCard) {
    return {
      ok: false,
      error: 'CARD_NOT_IN_HAND',
      message: `Card "${cardId}" is not in seat ${seat}'s hand.`,
    };
  }

  // 5. Round suit compliance
  if (state.roundSuit !== null && card.suit !== state.roundSuit) {
    const hasRoundSuit = hand.some((c) => c.suit === state.roundSuit);
    if (hasRoundSuit) {
      return {
        ok: false,
        error: 'MUST_FOLLOW_SUIT',
        message: `You must play a ${state.roundSuit} card — you have one in your hand.`,
      };
    }
  }

  return { ok: true };
}

// ─── Trump selection validation ───────────────────────────────────────────────

/**
 * Validate the trump suit selection made by Player 1 (seat 0).
 *
 * Checks:
 *  1. Game is in 'trump_selection' phase
 *  2. The requesting player is seat 0
 *  3. The suit is a valid Suit value
 */
export function validateTrumpSelection(
  state: GameState,
  seat: Seat,
  suit: string
): ValidationResult {
  if (state.phase !== 'trump_selection') {
    return {
      ok: false,
      error: 'WRONG_PHASE',
      message: 'Trump selection is only allowed in the trump_selection phase.',
    };
  }

  if (seat !== 0) {
    return {
      ok: false,
      error: 'NOT_YOUR_TURN',
      message: 'Only Player 1 (seat 0) may select the trump suit.',
    };
  }

  if (!ALL_SUITS.includes(suit as Suit)) {
    return {
      ok: false,
      error: 'INVALID_SUIT',
      message: `"${suit}" is not a valid suit. Must be one of: S, H, D, C.`,
    };
  }

  return { ok: true };
}

// ─── Game start validation ────────────────────────────────────────────────────

/**
 * Validate that the game can be started by the requesting player.
 * Only the host (seat 0) can start; all 4 seats must be filled.
 */
export function validateGameStart(seat: Seat, playerCount: number): ValidationResult {
  if (seat !== 0) {
    return {
      ok: false,
      error: 'NOT_YOUR_TURN',
      message: 'Only the host (seat 0) can start the game.',
    };
  }

  if (playerCount !== 4) {
    return {
      ok: false,
      error: 'WRONG_PHASE',
      message: `Need 4 players to start — currently have ${playerCount}.`,
    };
  }

  return { ok: true };
}

// ─── Chat message validation ──────────────────────────────────────────────────

const MAX_CHAT_LENGTH = 200;
const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Sanitize a chat message: truncate and HTML-escape.
 * Returns null if the message is empty after trimming.
 */
export function sanitizeChatMessage(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_CHAT_LENGTH);
  if (trimmed.length === 0) return null;
  return trimmed.replace(/[&<>"']/g, (ch) => HTML_ENTITY_MAP[ch] ?? ch);
}
