import { NextRequest } from 'next/server';
import { getLobby, setLobby, deleteLobby, refreshLobbyTTL } from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import type { Seat } from '@turuf/game-engine';

export const runtime = 'nodejs';

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

  if (lobby.status === 'in_game' || lobby.status === 'post_game') {
    return Errors.conflict('Cannot leave a game that is in progress');
  }

  const playerIndex = lobby.players.findIndex(p => p.id === payload.playerId);
  if (playerIndex === -1) {
    return successResponse({ success: true }); // already left
  }

  const leavingPlayer = lobby.players[playerIndex];

  // Remove player
  lobby.players.splice(playerIndex, 1);

  if (lobby.players.length === 0) {
    // Everyone left, delete the lobby
    await deleteLobby(lobbyId);
  } else {
    // Reassign host if necessary
    if (lobby.hostPlayerId === payload.playerId) {
      lobby.hostPlayerId = lobby.players[0].id;
    }
    
    // Status goes back to waiting if it was ready
    lobby.status = 'waiting';

    // To prevent seat gaps, we should reassign seats to the remaining players
    // so they are always 0, 1, 2 sequentially.
    lobby.players.forEach((p, index) => {
      p.seat = index as Seat;
      p.team = index % 2 === 0 ? 'A' : 'B';
    });

    await setLobby(lobby);
    await refreshLobbyTTL(lobbyId);

    // Broadcast leave event
    await publishToLobby(lobbyId, {
      type: 'PLAYER_LEFT',
      payload: {
        seat: leavingPlayer.seat,
        name: leavingPlayer.name
      }
    });
  }

  return successResponse({ success: true });
}
