/**
 * POST /api/game/action
 *
 * The central game action endpoint — a player plays a card.
 *
 * This is the most security-critical endpoint in the application.
 * Every security check must pass before state is mutated.
 *
 * Security checks (in order):
 *   1. JWT valid and not expired
 *   2. lobbyId from JWT matches game state
 *   3. Game is in 'playing' phase
 *   4. It is this player's turn (currentTurn === JWT.seat)
 *   5. Player owns the card (card is in their hand)
 *   6. Round suit compliance (must follow suit if able)
 *   7. Replay prevention (seq === state.actionSequence + 1)
 *
 * On success:
 *   - Remove card from hand, add to played map
 *   - If round complete: compute winner, update scores, start next round (or end game)
 *   - Publish events to Ably
 *
 * Body: { cardId: string, seq: number }
 * Headers: Authorization: Bearer {jwt}
 * Rate limit: 60 per player per minute
 */

import { NextRequest } from 'next/server';
import {
  getGameState,
  setGameState,
  getLobby,
  acquireGameLock,
  releaseGameLock,
  setLobby,
} from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import { checkRateLimit, gameActionLimiter } from '@/lib/rate-limit';
import { validateMove, applyCardPlay, parseCardId, toPlayerView, computeGameWinner } from '@turuf/game-engine';
import type { Seat } from '@turuf/game-engine';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ── Rate limit by playerId ────────────────────────────────────────────────
  // (can only rate-limit after auth — using token.playerId as identifier)

  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // Rate limit by playerId (more precise than IP for game actions)
  const limited = await checkRateLimit(gameActionLimiter, token.playerId);
  if (limited) return limited;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { cardId?: unknown; seq?: unknown };
  try {
    body = await req.json();
  } catch {
    return Errors.unprocessable('INVALID_BODY', 'Request body must be valid JSON');
  }

  if (typeof body.cardId !== 'string') {
    return Errors.unprocessable('MISSING_CARD', 'cardId is required');
  }

  if (typeof body.seq !== 'number') {
    return Errors.unprocessable('MISSING_SEQ', 'seq (action sequence number) is required');
  }

  const cardId = body.cardId as string;
  const clientSeq = body.seq as number;

  // ── Load game state ───────────────────────────────────────────────────────
  const gameState = await getGameState(token.lobbyId);
  if (!gameState) return Errors.notFound('Game');

  // ── Replay prevention ─────────────────────────────────────────────────────
  // The client sends the actionSequence of the state they are currently viewing.
  if (clientSeq !== gameState.actionSequence) {
    return Errors.conflict(
      'Action sequence mismatch. The game state may have changed — please refresh.'
    );
  }

  // ── Validate the move (pure game engine) ─────────────────────────────────
  const validation = validateMove(gameState, token.seat, cardId);
  if (!validation.ok) {
    return Errors.unprocessable(validation.error, validation.message);
  }

  // ── Parse the card (already validated above, so this won't be null) ───────
  const card = parseCardId(cardId)!;

  // ── Acquire distributed lock ──────────────────────────────────────────────
  const locked = await acquireGameLock(token.lobbyId);
  if (!locked) {
    return Errors.serviceUnavailable('Server is processing another action. Please retry.');
  }

  try {
    // ── Re-load state inside the lock (double-check seq hasn't changed) ────
    const freshState = await getGameState(token.lobbyId);
    if (!freshState) return Errors.notFound('Game');

    if (freshState.actionSequence !== gameState.actionSequence) {
      // State changed between our read and lock acquisition — reject
      return Errors.conflict('Action sequence mismatch. Please retry.');
    }

    // ── Apply the move ────────────────────────────────────────────────────
    const newState = applyCardPlay(freshState, token.seat, card);
    await setGameState(newState);

    // ── Determine what events to publish ─────────────────────────────────
    const isRoundComplete = newState.roundHistory.length > freshState.roundHistory.length;
    const isGameOver = newState.phase === 'complete';

    // Always publish CARD_PLAYED
    await publishToLobby(token.lobbyId, {
      type: 'CARD_PLAYED',
      payload: {
        seat: token.seat,
        card,
        nextTurn: isRoundComplete ? null : newState.currentTurn,
        seq: newState.actionSequence,
      },
    });

    if (isGameOver) {
      // Update lobby status
      const lobby = await getLobby(token.lobbyId);
      if (lobby) {
        await setLobby({ ...lobby, status: 'post_game', endedAt: Date.now() });
      }

      const result = computeGameWinner(newState);

      await publishToLobby(token.lobbyId, {
        type: 'GAME_ENDED',
        payload: {
          winner: result.winner,
          scores: result.scores,
          history: newState.roundHistory,
        },
      });
    } else if (isRoundComplete) {
      const lastRound = newState.roundHistory[newState.roundHistory.length - 1]!;

      await publishToLobby(token.lobbyId, {
        type: 'ROUND_COMPLETE',
        payload: {
          result: lastRound,
          scores: newState.scores,
          nextLeader: newState.currentLeader,
        },
      });

      await publishToLobby(token.lobbyId, {
        type: 'ROUND_START',
        payload: {
          roundNumber: newState.currentRound,
          leader: newState.currentLeader,
        },
      });
    }

    return successResponse({
      seq: newState.actionSequence,
      roundComplete: isRoundComplete,
      gameOver: isGameOver,
    });
  } finally {
    await releaseGameLock(token.lobbyId);
  }
}
