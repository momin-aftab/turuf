/**
 * Upstash Redis client singleton.
 *
 * Uses the HTTP-based @upstash/redis client which works in both
 * Edge Runtime and Node.js Runtime (no TCP sockets required).
 *
 * Environment variables required:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis';
import type { GameState } from '@turuf/game-engine';
import type { LobbyRecord } from '@/types';

// Singleton Redis client — created once and reused across requests
export const redis = new Redis({
  url: process.env['UPSTASH_REDIS_REST_URL']!,
  token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
});

// ─── Key constants ────────────────────────────────────────────────────────────

export const LOBBY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const GAME_TTL_SECONDS = 24 * 60 * 60;  // 24 hours
export const LOCK_TTL_SECONDS = 5;

export const keys = {
  lobby: (id: string) => `lobby:${id}`,
  game: (id: string) => `game:${id}`,
  lock: (id: string) => `game:${id}:lock`,
  rateLimit: (prefix: string, identifier: string) => `rl:${prefix}:${identifier}`,
};

// ─── Lobby helpers ────────────────────────────────────────────────────────────

export async function getLobby(id: string): Promise<LobbyRecord | null> {
  const raw = await redis.get<LobbyRecord>(keys.lobby(id));
  return raw;
}

export async function setLobby(lobby: LobbyRecord): Promise<void> {
  await redis.set(keys.lobby(lobby.id), JSON.stringify(lobby), { ex: LOBBY_TTL_SECONDS });
}

export async function refreshLobbyTTL(id: string): Promise<void> {
  await redis.expire(keys.lobby(id), LOBBY_TTL_SECONDS);
}

// ─── Game state helpers ───────────────────────────────────────────────────────

export async function getGameState(lobbyId: string): Promise<GameState | null> {
  const raw = await redis.get<GameState>(keys.game(lobbyId));
  return raw;
}

export async function setGameState(state: GameState): Promise<void> {
  await redis.set(keys.game(state.lobbyId), JSON.stringify(state), {
    ex: GAME_TTL_SECONDS,
  });
}

// ─── Distributed lock for game action atomicity ───────────────────────────────

/**
 * Acquire a distributed lock for a game action.
 * Returns true if the lock was acquired, false if already held.
 *
 * The lock prevents two simultaneous card plays from both succeeding.
 */
export async function acquireGameLock(lobbyId: string): Promise<boolean> {
  const result = await redis.set(keys.lock(lobbyId), '1', {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });
  return result === 'OK';
}

export async function releaseGameLock(lobbyId: string): Promise<void> {
  await redis.del(keys.lock(lobbyId));
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function deleteLobby(lobbyId: string): Promise<void> {
  await redis.del(keys.lobby(lobbyId));
  await redis.del(keys.game(lobbyId));
  await redis.del(keys.lock(lobbyId));
}
