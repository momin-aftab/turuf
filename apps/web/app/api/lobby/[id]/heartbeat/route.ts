/**
 * POST /api/lobby/[id]/heartbeat
 *
 * Called periodically by connected clients to signal they are still online.
 * Updates the player's `lastHeartbeatAt` timestamp and `status` to 'connected'.
 *
 * The timeout endpoint checks `lastHeartbeatAt` to determine if a player
 * is still connected when deciding whether to substitute a bot.
 *
 * Headers: Authorization: Bearer {jwt}
 * Response: { ok: true }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { requireAuth } from '@/lib/auth';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import type { PlayerRecord } from '@/types';

export const runtime = 'edge';

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

  // ── Find player and update heartbeat ──────────────────────────────────────
  const player = lobby.players.find((p: PlayerRecord) => p.id === token.playerId);
  if (!player) return Errors.forbidden('You are not a member of this lobby');

  player.lastHeartbeatAt = Date.now();

  // If the player was disconnected (but not inactive/bot), mark them connected again
  if (player.status === 'disconnected') {
    player.status = 'connected';
    delete player.disconnectedAt;
  }

  await setLobby(lobby);

  return successResponse({ ok: true });
}
