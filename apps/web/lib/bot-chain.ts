/**
 * Bot auto-play helper — chains card plays for consecutive inactive (bot-controlled) seats.
 *
 * Used by both `/api/game/action` (after a human play) and `/api/game/timeout` (after a timeout).
 * Executes up to 3 consecutive bot turns in a single request to avoid function timeout limits.
 *
 * All bot plays use `selectRandomLegalCard()` from the game engine, which follows suit when possible.
 */

import {
  applyCardPlay,
  selectRandomLegalCard,
  computeGameWinner,
} from '@turuf/game-engine';
import type { GameState, Seat, Card } from '@turuf/game-engine';
import { setGameState, setLobby } from '@/lib/redis';
import { publishToLobby } from '@/lib/ably-server';
import type { LobbyRecord, PlayerRecord } from '@/types';

// Maximum consecutive bot plays per request to stay within Vercel function timeout
const MAX_BOT_CHAIN = 3;

/**
 * Check if a seat is currently bot-controlled (inactive) in the lobby.
 */
function isBotSeat(lobby: LobbyRecord, seat: Seat): boolean {
  const player = lobby.players.find((p: PlayerRecord) => p.seat === seat);
  return player?.status === 'inactive';
}

/**
 * After a card play (human or timeout), check if the next seat(s) are bot-controlled.
 * If so, auto-play their cards immediately (up to MAX_BOT_CHAIN consecutive bot turns).
 *
 * @param state    - The game state AFTER the triggering card play has been applied and saved.
 * @param lobby    - The lobby record (for checking player statuses).
 * @param lobbyId  - The lobby ID for publishing events.
 * @returns The final game state after all bot plays.
 */
export async function chainBotPlays(
  state: GameState,
  lobby: LobbyRecord,
  lobbyId: string
): Promise<GameState> {
  let currentState = state;
  let botPlays = 0;

  while (
    botPlays < MAX_BOT_CHAIN &&
    currentState.phase === 'playing' &&
    isBotSeat(lobby, currentState.currentTurn)
  ) {
    const botSeat = currentState.currentTurn;
    const botPlayer = lobby.players.find((p: PlayerRecord) => p.seat === botSeat);
    if (!botPlayer) break;

    // Pick a random legal card for the bot
    const card = selectRandomLegalCard(currentState.hands[botSeat], currentState.roundSuit);
    if (!card) break;

    // Apply the play
    const prevRoundCount = currentState.roundHistory.length;
    currentState = applyCardPlay(currentState, botSeat, card);
    await setGameState(currentState);

    const isRoundComplete = currentState.roundHistory.length > prevRoundCount;
    const isGameOver = currentState.phase === 'complete';

    // Publish CARD_PLAYED (same as the normal action route)
    await publishToLobby(lobbyId, {
      type: 'CARD_PLAYED',
      payload: {
        seat: botSeat,
        card,
        nextTurn: isRoundComplete ? null : currentState.currentTurn,
        seq: currentState.actionSequence,
      },
    });

    // Publish PLAYER_TIMEOUT for the bot play so clients know it was automatic
    await publishToLobby(lobbyId, {
      type: 'PLAYER_TIMEOUT',
      payload: {
        seat: botSeat,
        name: botPlayer.name,
        cardPlayed: card,
      },
    });

    if (isGameOver) {
      // Update lobby status
      await setLobby({ ...lobby, status: 'post_game', endedAt: Date.now() });

      const result = computeGameWinner(currentState);
      await publishToLobby(lobbyId, {
        type: 'GAME_ENDED',
        payload: {
          winner: result.winner,
          scores: result.scores,
          history: currentState.roundHistory,
        },
      });
      break;
    } else if (isRoundComplete) {
      const lastRound = currentState.roundHistory[currentState.roundHistory.length - 1]!;

      await publishToLobby(lobbyId, {
        type: 'ROUND_COMPLETE',
        payload: {
          result: lastRound,
          scores: currentState.scores,
          nextLeader: currentState.currentLeader,
        },
      });

      await publishToLobby(lobbyId, {
        type: 'ROUND_START',
        payload: {
          roundNumber: currentState.currentRound,
          leader: currentState.currentLeader,
        },
      });
    }

    botPlays++;
  }

  return currentState;
}
