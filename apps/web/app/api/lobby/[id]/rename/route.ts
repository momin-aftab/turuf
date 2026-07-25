import { NextRequest } from 'next/server';
import { getLobby, setLobby } from '@/lib/redis';
import { publishToLobby } from '@/lib/ably-server';
import { requireAuth } from '@/lib/auth';
import { successResponse, errorResponse, handleAuthError, Errors } from '@/lib/response';

export const runtime = 'edge';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const lobbyId = resolvedParams.id;
  
  let payload;
  try {
    payload = await requireAuth(req);
  } catch (e) {
    return handleAuthError(e);
  }

  if (payload.lobbyId !== lobbyId) {
    return Errors.unauthorized('Invalid token');
  }

  const lobby = await getLobby(lobbyId);
  if (!lobby) return Errors.notFound('Lobby not found');

  // Verify Admin Permissions
  if (!lobby.isAdmin) {
    return Errors.forbidden('Lobby is not in Admin mode');
  }
  if (lobby.hostPlayerId !== payload.playerId) {
    return Errors.forbidden('Only the Host can rename players');
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body');
  }

  const { playerId, newName } = body;
  if (!playerId || typeof playerId !== 'string') {
    return errorResponse('BAD_REQUEST', 'Missing playerId');
  }
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return errorResponse('BAD_REQUEST', 'Missing or empty newName');
  }

  const sanitizedName = newName.trim().substring(0, 20);

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) {
    return Errors.notFound('Player not found in lobby');
  }

  player.name = sanitizedName;

  await setLobby(lobby);

  // Broadcast event to all clients
  await publishToLobby(lobbyId, {
    type: 'PLAYER_RENAMED',
    payload: {
      seat: player.seat,
      newName: sanitizedName
    }
  });

  return successResponse({ success: true });
}
