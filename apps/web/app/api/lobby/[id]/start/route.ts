/**
 * POST /api/lobby/[id]/start
 *
 * Starts the game. Only the host (seat 0) may call this.
 * Requires all 4 players to be seated.
 *
 * Actions:
 *   1. Validate host + player count
 *   2. Shuffle deck (cryptographically secure)
 *   3. Deal 5 cards to Player 1 (seat 0)
 *   4. Create initial GameState in Redis
 *   5. Broadcast GAME_STARTED to the lobby channel
 *   6. Send each player's private HAND_DEALT event
 *
 * Headers: Authorization: Bearer {jwt}
 * Response: { status: 'started' }
 */

import { NextRequest } from 'next/server';
import { getLobby, setLobby, setGameState } from '@/lib/redis';
import { normalizeLobbyId, isValidLobbyIdFormat } from '@/lib/lobby-id';
import { requireAuth, AuthError } from '@/lib/auth';
import { publishToLobby, publishToPlayer, publishToPlayers } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import { toPlayerView } from '@turuf/game-engine';
import {
  generateShuffledDeck,
  dealInitial,
  createInitialGameState,
  validateGameStart,
} from '@turuf/game-engine';
import type { Seat } from '@turuf/game-engine';

export const runtime = 'nodejs'; // needs Node crypto for deck shuffle

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

  if (lobby.status === 'in_game') {
    return Errors.conflict('Game has already started');
  }

  // ── Validate game start conditions ────────────────────────────────────────
  const startValidation = validateGameStart(token.seat, lobby.players.length);
  if (!startValidation.ok) {
    return Errors.unprocessable(startValidation.error, startValidation.message);
  }

  // ── Shuffle + initial deal ────────────────────────────────────────────────
  const deck = generateShuffledDeck();
  const { player1Hand, remainingDeck } = dealInitial(deck);

  // ── Create initial game state ─────────────────────────────────────────────
  const gameState = createInitialGameState(lobbyId, player1Hand, remainingDeck);

  // ── Persist ───────────────────────────────────────────────────────────────
  await setGameState(gameState);

  const updatedLobby = { ...lobby, status: 'in_game' as const, startedAt: Date.now() };
  await setLobby(updatedLobby);

  // ── Build Player 1's view (they have 5 cards) ─────────────────────────────
  const player1View = toPlayerView(gameState, 0);

  // ── Broadcast GAME_STARTED to all players ────────────────────────────────
  await publishToLobby(lobbyId, {
    type: 'GAME_STARTED',
    payload: { view: player1View }, // public view (no hands — those come privately)
  });

  // ── Send private HAND_DEALT to each player ────────────────────────────────
  // Player 1 (seat 0) gets their 5 cards. Other players get empty hands
  // (they will receive their cards after trump selection via HAND_UPDATED)
  const seat0Player = lobby.players.find((p) => p.seat === 0);

  if (seat0Player) {
    await publishToPlayer(seat0Player.id, {
      type: 'HAND_DEALT',
      payload: { cards: player1Hand },
    });
  }

  return successResponse({ status: 'started' });
}
