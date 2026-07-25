/**
 * POST /api/lobby/create
 *
 * Creates a new lobby with a unique 6-character alphanumeric ID.
 * The first caller becomes the host (seat 0).
 *
 * Rate limit: 5 per IP per minute
 *
 * Response: { lobbyId: string, joinUrl: string }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby } from '@/lib/redis';
import { generateLobbyId } from '@/lib/lobby-id';
import { successResponse, errorResponse, Errors } from '@/lib/response';
import { checkRateLimit, lobbyCreateLimiter, getClientIdentifier } from '@/lib/rate-limit';
import type { LobbyRecord } from '@/types';

export const runtime = 'edge';

const MAX_RETRIES = 5;

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const limited = await checkRateLimit(lobbyCreateLimiter, getClientIdentifier(req));
  if (limited) return limited;

  let isAdmin = false;
  let customId: string | undefined = undefined;

  try {
    const text = await req.text();
    if (text) {
      const body = JSON.parse(text);
      isAdmin = !!body.admin;
      if (body.customId && typeof body.customId === 'string' && body.customId.trim().length > 0) {
        customId = body.customId.trim().toUpperCase();
      }
    }
  } catch (e) {
    // Body is empty or invalid, ignore
  }

  // Generate or use unique lobby ID
  let lobbyId: string | null = null;
  
  if (customId) {
    const existing = await getLobby(customId);
    if (existing) {
      return errorResponse('BAD_REQUEST', `Lobby ID ${customId} is already in use.`);
    }
    lobbyId = customId;
  } else {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidate = generateLobbyId();
      const existing = await getLobby(candidate);
      if (!existing) {
        lobbyId = candidate;
        break;
      }
    }
  }

  if (!lobbyId) {
    return Errors.serviceUnavailable('Could not generate a unique lobby ID. Please try again.');
  }

  // Create the lobby record
  const lobby: LobbyRecord = {
    id: lobbyId,
    status: 'waiting',
    hostPlayerId: '', // set when host joins
    createdAt: Date.now(),
    players: [],
    isAdmin,
  };

  await setLobby(lobby);

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const joinUrl = `${appUrl}/${lobbyId}`;

  return successResponse({ lobbyId, joinUrl }, 201);
}
