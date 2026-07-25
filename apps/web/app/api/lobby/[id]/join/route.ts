/**
 * POST /api/lobby/[id]/join
 *
 * A player joins a lobby by choosing a display name.
 * Assigns a seat number (0–3 in join order).
 * Issues a signed JWT and an Ably capability token.
 *
 * Body: { name: string }
 *
 * Rate limit: 20 per IP per minute
 *
 * Response: {
 *   jwt: string,            -- Player session token (include in all game API calls)
 *   ablyTokenRequest: {...} -- Ably token request for client-side subscription
 *   seat: number,           -- Assigned seat (0–3)
 *   playerId: string,
 *   lobby: { ... }          -- Public lobby snapshot
 * }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby, refreshLobbyTTL } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { signPlayerToken } from '@/lib/auth';
import { createAblyToken, publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors } from '@/lib/response';
import { checkRateLimit, lobbyJoinLimiter, getClientIdentifier } from '@/lib/rate-limit';
import { SEAT_TEAM } from '@turuf/game-engine';
import type { Seat } from '@turuf/game-engine';
import type { PlayerRecord } from '@/types';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs'; // needs crypto.randomUUID

const MAX_NAME_LENGTH = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const limited = await checkRateLimit(lobbyJoinLimiter, getClientIdentifier(req));
  if (limited) return limited;

  // ── Parse & validate request body ─────────────────────────────────────────
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Errors.unprocessable('INVALID_BODY', 'Request body must be valid JSON');
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!rawName) {
    return Errors.unprocessable('MISSING_NAME', 'A display name is required');
  }
  if (rawName.length > MAX_NAME_LENGTH) {
    return Errors.unprocessable(
      'NAME_TOO_LONG',
      `Display name must be ${MAX_NAME_LENGTH} characters or fewer`
    );
  }
  // HTML-escape the name
  const name = rawName.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );

  try {
    // ── Load and validate lobby ───────────────────────────────────────────────
    const { id } = await params;
    const lobbyId = normalizeLobbyId(id);

    if (!isValidLobbyIdFormat(lobbyId)) {
      return Errors.notFound('Lobby');
    }

    const lobby = await getLobby(lobbyId);
    if (!lobby) {
      return Errors.notFound('Lobby');
    }

    if (lobby.status === 'in_game' || lobby.status === 'post_game') {
      return Errors.conflict('A game is already in progress in this lobby');
    }

    if (lobby.players.length >= 4) {
      return Errors.conflict('This lobby is full (4/4 players)');
    }

    // ── Assign seat ───────────────────────────────────────────────────────────
    const seat = lobby.players.length as Seat; // seats filled in join order
    const playerId = randomUUID();
    const team = SEAT_TEAM[seat];

    const player: PlayerRecord = {
      id: playerId,
      name,
      seat,
      team,
      status: 'connected',
    };

    // ── Persist ───────────────────────────────────────────────────────────────
    const updatedLobby = {
      ...lobby,
      hostPlayerId: lobby.players.length === 0 ? playerId : lobby.hostPlayerId,
      status: lobby.players.length === 3 ? ('ready' as const) : ('waiting' as const),
      players: [...lobby.players, player],
    };

    await setLobby(updatedLobby);

    // ── Issue JWT + Ably token ────────────────────────────────────────────────
    const [jwt, ablyTokenRequest] = await Promise.all([
      signPlayerToken({ lobbyId, playerId, seat }),
      createAblyToken(lobbyId, playerId),
    ]);

    // ── Broadcast join event ──────────────────────────────────────────────────
    await publishToLobby(lobbyId, {
      type: 'PLAYER_JOINED',
      payload: {
        player: { id: playerId, name, seat, team },
        playerCount: updatedLobby.players.length,
      },
    });

    // ── Refresh Redis TTL ─────────────────────────────────────────────────────
    await refreshLobbyTTL(lobbyId);

    return successResponse({
      jwt,
      ablyTokenRequest,
      seat,
      playerId,
      lobby: {
        id: updatedLobby.id,
        status: updatedLobby.status,
        playerCount: updatedLobby.players.length,
        players: updatedLobby.players.map((p) => ({
          seat: p.seat,
          name: p.name,
          team: p.team,
          status: p.status,
        })),
      },
    });
  } catch (err: any) {
    console.error('JOIN ERROR:', err);
    return new Response(JSON.stringify({ error: err.message || String(err), stack: err.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
