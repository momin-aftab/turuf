/**
 * GET /api/game/state
 *
 * Returns the full game state for the authenticated player.
 * Used during reconnection to restore the client's view.
 *
 * The response includes:
 *   - Full public game view (round, scores, trump, current turn, played cards)
 *   - This player's private hand (myHand)
 *
 * Clients should call this after reconnecting and re-subscribing to Ably channels.
 *
 * Headers: Authorization: Bearer {jwt}
 */

import { NextRequest } from 'next/server';
import { getGameState, getLobby } from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToPlayer } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import { toPlayerView } from '@turuf/game-engine';
import type { PlayerRecord } from '@/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Load state ────────────────────────────────────────────────────────────
  const [lobby, gameState] = await Promise.all([
    getLobby(token.lobbyId),
    getGameState(token.lobbyId),
  ]);

  if (!lobby) return Errors.notFound('Lobby');

  // Verify player is in this lobby
  const player = lobby.players.find((p: PlayerRecord) => p.id === token.playerId);
  if (!player) return Errors.forbidden('You are not a member of this lobby');

  // If game hasn't started yet, return lobby state only
  if (!gameState) {
    return successResponse({
      phase: 'waiting',
      lobby: {
        id: lobby.id,
        status: lobby.status,
        playerCount: lobby.players.length,
        players: lobby.players.map((p: PlayerRecord) => ({
          seat: p.seat,
          name: p.name,
          team: p.team,
          status: p.status,
        })),
      },
    });
  }

  // ── Build player view ─────────────────────────────────────────────────────
  const view = toPlayerView(gameState, token.seat);
  const myHand = gameState.hands[token.seat];

  // Also re-send the RECONNECT_STATE event to the player's private channel
  // so Ably history consumers get a reliable checkpoint
  await publishToPlayer(token.playerId, {
    type: 'RECONNECT_STATE',
    payload: { view, myHand },
  });

  return successResponse({ view, myHand });
}
