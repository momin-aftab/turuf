/**
 * POST /api/lobby/[id]/rejoin
 *
 * Allows a previously disconnected/inactive player to rejoin a game in progress.
 * The player keeps their original seat — they swap back in with the bot.
 *
 * Body: { playerId: string, name: string }
 *   - playerId: The player's original UUID (stored in their sessionStorage)
 *   - name: Their display name
 *
 * Response: {
 *   jwt: string,
 *   ablyTokenRequest: {...},
 *   seat: number,
 *   playerId: string,
 *   view: PlayerView,
 *   myHand: Card[]
 * }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby, getGameState } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { signPlayerToken } from '@/lib/auth';
import { createAblyToken, publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors } from '@/lib/response';
import { toPlayerView } from '@turuf/game-engine';
import type { PlayerRecord } from '@/types';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { playerId?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Errors.unprocessable('INVALID_BODY', 'Request body must be valid JSON');
  }

  if (typeof body.playerId !== 'string' || !body.playerId) {
    return Errors.unprocessable('MISSING_PLAYER_ID', 'playerId is required');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return Errors.unprocessable('MISSING_NAME', 'name is required');
  }

  const playerId = body.playerId as string;
  const name = (body.name as string).trim().slice(0, 20);

  // ── Validate lobby ────────────────────────────────────────────────────────
  const { id } = await params;
  const lobbyId = normalizeLobbyId(id);

  if (!isValidLobbyIdFormat(lobbyId)) {
    return Errors.notFound('Lobby');
  }

  const lobby = await getLobby(lobbyId);
  if (!lobby) return Errors.notFound('Lobby');

  // ── Find the player ───────────────────────────────────────────────────────
  const player = lobby.players.find((p: PlayerRecord) => p.id === playerId);
  if (!player) {
    return Errors.notFound('Player');
  }

  // Player must be inactive or disconnected to rejoin
  if (player.status === 'connected') {
    return Errors.conflict('Player is already connected');
  }

  // ── Reactivate the player ─────────────────────────────────────────────────
  player.status = 'connected';
  player.lastHeartbeatAt = Date.now();
  delete player.disconnectedAt;

  await setLobby(lobby);

  // ── Issue JWT + Ably token ────────────────────────────────────────────────
  const [jwt, ablyTokenRequest] = await Promise.all([
    signPlayerToken({ lobbyId, playerId, seat: player.seat }),
    createAblyToken(lobbyId, playerId),
  ]);

  // ── Broadcast PLAYER_RETURNED ─────────────────────────────────────────────
  await publishToLobby(lobbyId, {
    type: 'PLAYER_RETURNED',
    payload: {
      seat: player.seat,
      name: player.name,
    },
  });

  // ── Load game state for resync ────────────────────────────────────────────
  const gameState = await getGameState(lobbyId);
  if (!gameState) {
    // Game hasn't started or was deleted
    return successResponse({
      jwt,
      ablyTokenRequest,
      seat: player.seat,
      playerId,
    });
  }

  const view = toPlayerView(gameState, player.seat);
  const myHand = gameState.hands[player.seat];

  return successResponse({
    jwt,
    ablyTokenRequest,
    seat: player.seat,
    playerId,
    view,
    myHand,
  });
}
