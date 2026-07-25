/**
 * GET /api/lobby/[id]/status
 *
 * Returns the public state of a lobby for initial page load and reconnects.
 * No authentication required — just the lobby ID.
 *
 * Returns 404 if the lobby doesn't exist or has expired.
 */

import { NextRequest } from 'next/server';
import { getLobby } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { successResponse, Errors } from '@/lib/response';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lobbyId = normalizeLobbyId(id);

  if (!isValidLobbyIdFormat(lobbyId)) {
    return Errors.notFound('Lobby');
  }

  const lobby = await getLobby(lobbyId);
  if (!lobby) {
    return Errors.notFound('Lobby');
  }

  // Return public lobby state (no private game state, no hands)
  return successResponse({
    id: lobby.id,
    status: lobby.status,
    playerCount: lobby.players.length,
    players: lobby.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      name: p.name,
      team: p.team,
      status: p.status,
    })),
    createdAt: lobby.createdAt,
    isAdmin: !!lobby.isAdmin,
  });
}
