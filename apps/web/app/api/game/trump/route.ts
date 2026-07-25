/**
 * POST /api/game/trump
 *
 * Player 1 (seat 0) selects the Master Suit (trump).
 * Only callable once per game, during the 'trump_selection' phase.
 *
 * Actions:
 *   1. Validate JWT (must be seat 0)
 *   2. Validate game phase is 'trump_selection'
 *   3. Complete the full deal (give P1 their remaining 8 cards; deal 13 to P2/P3/P4)
 *   4. Transition game state to 'playing'
 *   5. Publish TRUMP_SELECTED to lobby channel
 *   6. Send HAND_UPDATED privately to P1 (their 8 new cards)
 *   7. Send HAND_DEALT privately to P2, P3, P4
 *
 * Body: { suit: 'S' | 'H' | 'D' | 'C' }
 * Headers: Authorization: Bearer {jwt}
 * Response: { trumpSuit: string }
 */

import { NextRequest } from 'next/server';
import { getLobby, getGameState, setGameState, acquireGameLock, releaseGameLock } from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToLobby, publishToPlayer } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import {
  validateTrumpSelection,
  dealFull,
  applyTrumpSelection,
  toPlayerView,
} from '@turuf/game-engine';
import type { Suit, Seat } from '@turuf/game-engine';
import type { PlayerRecord, ServerEvent } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { suit?: unknown };
  try {
    body = await req.json();
  } catch {
    return Errors.unprocessable('INVALID_BODY', 'Request body must be valid JSON');
  }

  const suit = typeof body.suit === 'string' ? body.suit : '';

  // ── Load game state ───────────────────────────────────────────────────────
  const [lobby, gameState] = await Promise.all([
    getLobby(token.lobbyId),
    getGameState(token.lobbyId),
  ]);

  if (!lobby || !gameState) return Errors.notFound('Game');

  // ── Validate trump selection ──────────────────────────────────────────────
  // Temporarily set phase to trump_selection if initial_deal (first trump call)
  const stateForValidation =
    gameState.phase === 'initial_deal'
      ? { ...gameState, phase: 'trump_selection' as const }
      : gameState;

  const validation = validateTrumpSelection(stateForValidation, token.seat, suit);
  if (!validation.ok) {
    return Errors.unprocessable(validation.error, validation.message);
  }

  // ── Acquire lock ──────────────────────────────────────────────────────────
  const locked = await acquireGameLock(token.lobbyId);
  if (!locked) {
    return Errors.serviceUnavailable('Server is processing another action. Please retry.');
  }

  try {
    // ── Complete the full deal ────────────────────────────────────────────
    const { hands } = dealFull(gameState.hands[0], gameState.deckRemaining);

    // ── Apply trump selection + transition to playing ─────────────────────
    const newState = applyTrumpSelection(gameState, suit as Suit, hands);
    await setGameState(newState);

    // ── Build views ───────────────────────────────────────────────────────
    const publicView = toPlayerView(newState, 0 as Seat); // no hand info in public view

    // ── Publish TRUMP_SELECTED to lobby ───────────────────────────────────
    await publishToLobby(token.lobbyId, {
      type: 'TRUMP_SELECTED',
      payload: { trumpSuit: suit as Suit, view: publicView },
    });

    // ── Send private hands to each player ────────────────────────────────
    const handEvents: Array<{ playerId: string; event: ServerEvent }> = lobby.players.map(
      (player: PlayerRecord) => ({
        playerId: player.id,
        // P1 gets HAND_UPDATED (their extra 8 cards completing their 13)
        // P2/P3/P4 get HAND_DEALT (their full 13 cards)
        event:
          player.seat === 0
            ? ({
                type: 'HAND_UPDATED' as const,
                payload: { cards: hands[player.seat] },
              } satisfies ServerEvent)
            : ({
                type: 'HAND_DEALT' as const,
                payload: { cards: hands[player.seat] },
              } satisfies ServerEvent),
      })
    );

    await Promise.all(
      handEvents.map(({ playerId, event }: { playerId: string; event: ServerEvent }) =>
        publishToPlayer(playerId, event)
      )
    );

    return successResponse({ trumpSuit: suit });
  } finally {
    await releaseGameLock(token.lobbyId);
  }
}
