/**
 * POST /api/game/chat
 *
 * Broadcasts a chat message to all players in the lobby.
 * Messages are HTML-escaped and truncated server-side.
 * Private messaging is prohibited — all messages go to all players.
 *
 * Rate limit: 10 per player per minute
 *
 * Body: { message: string }
 * Headers: Authorization: Bearer {jwt}
 * Response: { timestamp: number }
 */

import { NextRequest } from 'next/server';
import { getLobby } from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import { checkRateLimit, chatLimiter } from '@/lib/rate-limit';
import { sanitizeChatMessage } from '@turuf/game-engine';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Rate limit by playerId ────────────────────────────────────────────────
  const limited = await checkRateLimit(chatLimiter, token.playerId);
  if (limited) return limited;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return Errors.unprocessable('INVALID_BODY', 'Request body must be valid JSON');
  }

  const rawMessage = typeof body.message === 'string' ? body.message : '';
  const message = sanitizeChatMessage(rawMessage);

  if (!message) {
    return Errors.unprocessable('EMPTY_MESSAGE', 'Message cannot be empty');
  }

  // ── Load lobby to get player name ─────────────────────────────────────────
  const lobby = await getLobby(token.lobbyId);
  if (!lobby) return Errors.notFound('Lobby');

  const player = lobby.players.find((p) => p.id === token.playerId);
  if (!player) return Errors.forbidden('You are not a member of this lobby');

  const timestamp = Date.now();

  // ── Broadcast to all players ──────────────────────────────────────────────
  await publishToLobby(token.lobbyId, {
    type: 'CHAT_MESSAGE',
    payload: {
      seat: token.seat,
      name: player.name,
      message,
      timestamp,
    },
  });

  return successResponse({ timestamp });
}
