/**
 * POST /api/game/timeout
 *
 * Called by any client when they believe the current player's turn has timed out.
 * The server validates the timeout (checks lastActionAt >= 20s ago) and auto-plays
 * a random legal card for the timed-out player.
 *
 * After auto-playing, the server checks if the player is still connected via
 * their heartbeat timestamp. If disconnected, the player is set to 'inactive'
 * (bot-controlled) and a BOT_SUBSTITUTED event is published.
 *
 * If the next seat(s) are also bot-controlled, their turns are chained immediately.
 *
 * Headers: Authorization: Bearer {jwt}
 * Response: { seq, roundComplete, gameOver, timedOutSeat }
 */

import { NextRequest } from 'next/server';
import {
  getGameState,
  setGameState,
  getLobby,
  setLobby,
  acquireGameLock,
  releaseGameLock,
} from '@/lib/redis';
import { requireAuth } from '@/lib/auth';
import { publishToLobby } from '@/lib/ably-server';
import { successResponse, Errors, handleAuthError } from '@/lib/response';
import {
  applyCardPlay,
  selectRandomLegalCard,
  computeGameWinner,
} from '@turuf/game-engine';
import type { Seat } from '@turuf/game-engine';
import type { PlayerRecord } from '@/types';
import { chainBotPlays } from '@/lib/bot-chain';

export const runtime = 'nodejs';

/** Turn timeout threshold in milliseconds */
const TIMEOUT_MS = 20_000;

/** Heartbeat staleness threshold — if no heartbeat for this long, player is considered disconnected */
const HEARTBEAT_STALE_MS = 15_000;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let token;
  try {
    token = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err);
  }

  // ── Load game state ───────────────────────────────────────────────────────
  const gameState = await getGameState(token.lobbyId);
  if (!gameState) return Errors.notFound('Game');

  // ── Validate timeout conditions ───────────────────────────────────────────
  if (gameState.phase !== 'playing') {
    return Errors.unprocessable('WRONG_PHASE', 'Game is not in an active playing phase.');
  }

  const elapsed = Date.now() - gameState.lastActionAt;
  if (elapsed < TIMEOUT_MS) {
    return Errors.unprocessable(
      'NOT_TIMED_OUT',
      `Only ${Math.floor(elapsed / 1000)}s have passed. Timeout is at ${TIMEOUT_MS / 1000}s.`
    );
  }

  // ── Acquire distributed lock ──────────────────────────────────────────────
  const locked = await acquireGameLock(token.lobbyId);
  if (!locked) {
    return Errors.serviceUnavailable('Server is processing another action. Please retry.');
  }

  try {
    // ── Re-load state inside the lock ─────────────────────────────────────
    const freshState = await getGameState(token.lobbyId);
    if (!freshState) return Errors.notFound('Game');

    if (freshState.phase !== 'playing') {
      return Errors.unprocessable('WRONG_PHASE', 'Game phase changed.');
    }

    // Re-check timeout with fresh state
    const freshElapsed = Date.now() - freshState.lastActionAt;
    if (freshElapsed < TIMEOUT_MS) {
      return successResponse({ alreadyHandled: true });
    }

    const timedOutSeat = freshState.currentTurn;

    // ── Auto-play: pick a random legal card ───────────────────────────────
    const card = selectRandomLegalCard(
      freshState.hands[timedOutSeat],
      freshState.roundSuit
    );

    if (!card) {
      return Errors.serverError();
    }

    // ── Apply the move ────────────────────────────────────────────────────
    const prevRoundCount = freshState.roundHistory.length;
    let newState = applyCardPlay(freshState, timedOutSeat, card);
    await setGameState(newState);

    const isRoundComplete = newState.roundHistory.length > prevRoundCount;
    const isGameOver = newState.phase === 'complete';

    // ── Load lobby for presence check ─────────────────────────────────────
    const lobby = await getLobby(token.lobbyId);
    if (!lobby) return Errors.notFound('Lobby');

    const timedOutPlayer = lobby.players.find(
      (p: PlayerRecord) => p.seat === timedOutSeat
    );

    // ── Publish CARD_PLAYED ───────────────────────────────────────────────
    await publishToLobby(token.lobbyId, {
      type: 'CARD_PLAYED',
      payload: {
        seat: timedOutSeat,
        card,
        nextTurn: isRoundComplete ? null : newState.currentTurn,
        seq: newState.actionSequence,
      },
    });

    // ── Publish PLAYER_TIMEOUT ────────────────────────────────────────────
    if (timedOutPlayer) {
      await publishToLobby(token.lobbyId, {
        type: 'PLAYER_TIMEOUT',
        payload: {
          seat: timedOutSeat,
          name: timedOutPlayer.name,
          cardPlayed: card,
        },
      });
    }

    // ── Presence check: is the timed-out player still connected? ──────────
    if (timedOutPlayer && timedOutPlayer.status !== 'inactive') {
      const lastHeartbeat = timedOutPlayer.lastHeartbeatAt ?? 0;
      const heartbeatStale = Date.now() - lastHeartbeat > HEARTBEAT_STALE_MS;

      if (heartbeatStale || timedOutPlayer.status === 'disconnected') {
        // Player is gone — substitute bot
        timedOutPlayer.status = 'inactive';
        timedOutPlayer.disconnectedAt = timedOutPlayer.disconnectedAt ?? Date.now();
        await setLobby(lobby);

        await publishToLobby(token.lobbyId, {
          type: 'BOT_SUBSTITUTED',
          payload: {
            seat: timedOutSeat,
            name: timedOutPlayer.name,
          },
        });
      }
    }

    // ── Handle round/game completion events ───────────────────────────────
    if (isGameOver) {
      await setLobby({ ...lobby, status: 'post_game', endedAt: Date.now() });

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

    // ── Chain bot plays if next seat(s) are inactive ──────────────────────
    if (!isGameOver) {
      // Re-load lobby (status may have been updated above)
      const freshLobby = await getLobby(token.lobbyId);
      if (freshLobby) {
        newState = await chainBotPlays(newState, freshLobby, token.lobbyId);
      }
    }

    return successResponse({
      seq: newState.actionSequence,
      roundComplete: isRoundComplete,
      gameOver: newState.phase === 'complete',
      timedOutSeat,
    });
  } finally {
    await releaseGameLock(token.lobbyId);
  }
}
