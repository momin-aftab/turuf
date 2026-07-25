/**
 * GET /api/ably/token
 *
 * Issues a scoped Ably capability token for an authenticated player.
 * Called by the client after joining a lobby to set up WebSocket subscriptions.
 *
 * The token grants:
 *   - subscribe + presence on lobby:{lobbyId}
 *   - subscribe + history on player:{playerId}
 *
 * Clients can NEVER publish via the token (server-authoritative design).
 *
 * Headers: Authorization: Bearer {jwt}
 * Response: { tokenRequest: Ably.TokenRequest }
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLobby } from '@/lib/redis';
import { createAblyToken } from '@/lib/ably-server';
import { successResponse, handleAuthError, Errors } from '@/lib/response';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Verify the lobby still exists ─────────────────────────────────────────
  const lobby = await getLobby(token.lobbyId);
  if (!lobby) {
    return Errors.notFound('Lobby');
  }

  // ── Verify the player is in this lobby ────────────────────────────────────
  const player = lobby.players.find((p) => p.id === token.playerId);
  if (!player) {
    return Errors.forbidden('You are not a member of this lobby');
  }

  // ── Issue Ably token ──────────────────────────────────────────────────────
  const tokenRequest = await createAblyToken(token.lobbyId, token.playerId);

  return successResponse({ tokenRequest });
}
