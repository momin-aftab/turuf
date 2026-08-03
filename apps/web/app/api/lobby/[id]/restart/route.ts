/**
 * POST /api/lobby/[id]/restart
 *
 * Resets a completed game back to the waiting room with the same lobby and players.
 * Only callable when the game is in 'post_game' status.
 *
 * Actions:
 *   1. Verify the caller is in this lobby
 *   2. Reset lobby status to 'waiting' (or 'ready' if 4 players remain)
 *   3. Delete the old game state from Redis
 *   4. Reset all player statuses to 'connected'
 *   5. Broadcast LOBBY_RESET event to all players
 *
 * Headers: Authorization: Bearer {jwt}
 * Response: { status: 'reset' }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby, redis, keys } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { requireAuth } from '@/lib/auth';
import { publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import type { PlayerRecord } from '@/types';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Validate lobby ID ─────────────────────────────────────────────────────
  const { id } = await params;
  const lobbyId = normalizeLobbyId(id);

  if (!isValidLobbyIdFormat(lobbyId) || token.lobbyId !== lobbyId) {
    return Errors.notFound('Lobby');
  }

  // ── Load lobby ────────────────────────────────────────────────────────────
  const lobby = await getLobby(lobbyId);
  if (!lobby) return Errors.notFound('Lobby');

  if (lobby.status !== 'post_game') {
    return Errors.conflict('Can only restart a completed game');
  }

  // Verify player is in this lobby
  const player = lobby.players.find((p: PlayerRecord) => p.id === token.playerId);
  if (!player) return Errors.forbidden('You are not a member of this lobby');

  // ── Reset lobby ───────────────────────────────────────────────────────────

  // Keep only connected/active players (remove inactive bots that were disconnected)
  // Reset all remaining player statuses to 'connected'
  const activePlayers = lobby.players.map((p: PlayerRecord) => ({
    ...p,
    status: 'connected' as const,
    disconnectedAt: undefined,
    lastHeartbeatAt: Date.now(),
  }));

  const updatedLobby = {
    ...lobby,
    status: (activePlayers.length >= 4 ? 'ready' : 'waiting') as typeof lobby.status,
    players: activePlayers,
    startedAt: undefined,
    endedAt: undefined,
  };

  await setLobby(updatedLobby);

  // ── Delete old game state ─────────────────────────────────────────────────
  await redis.del(keys.game(lobbyId));

  // ── Broadcast reset ───────────────────────────────────────────────────────
  await publishToLobby(lobbyId, {
    type: 'LOBBY_RESET' as any,
    payload: {
      status: updatedLobby.status,
      playerCount: activePlayers.length,
    },
  });

  return successResponse({ status: 'reset' });
}
