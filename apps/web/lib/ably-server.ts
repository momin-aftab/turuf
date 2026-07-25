/**
 * Ably server-side client for publishing real-time events.
 *
 * Uses the Ably REST client (no persistent connection) which is
 * compatible with Vercel serverless functions.
 *
 * Channel architecture:
 *   lobby:{ID}        — public channel (all 4 players subscribe)
 *   player:{playerID} — private channel (one player; hand cards, reconnect state)
 */

import Ably from 'ably';
import type { ServerEvent } from '@/types';

// Lazy singleton — created once on first use, avoids module-level initialization
let _client: Ably.Rest | null = null;

function getClient(): Ably.Rest {
  if (!_client) {
    const apiKey = process.env['ABLY_API_KEY'];
    if (!apiKey) throw new Error('ABLY_API_KEY environment variable is not set');
    _client = new Ably.Rest({ key: apiKey });
  }
  return _client;
}

// ─── Channel name helpers ─────────────────────────────────────────────────────

export const channels = {
  lobby: (lobbyId: string) => `lobby:${lobbyId}`,
  player: (playerId: string) => `player:${playerId}`,
} as const;

// ─── Publish helpers ──────────────────────────────────────────────────────────

/**
 * Publish an event to the public lobby channel.
 * All 4 players in the lobby receive this message.
 */
export async function publishToLobby(lobbyId: string, event: ServerEvent): Promise<void> {
  const channel = getClient().channels.get(channels.lobby(lobbyId));
  await channel.publish(event.type, event.payload);
}

/**
 * Publish a private event to a single player's channel.
 * Used for: HAND_DEALT, HAND_UPDATED, RECONNECT_STATE
 */
export async function publishToPlayer(playerId: string, event: ServerEvent): Promise<void> {
  const channel = getClient().channels.get(channels.player(playerId));
  await channel.publish(event.type, event.payload);
}

/**
 * Publish the same event to multiple private player channels simultaneously.
 * Used when dealing initial hands (each player gets their own private set of cards).
 */
export async function publishToPlayers(
  events: Array<{ playerId: string; event: ServerEvent }>
): Promise<void> {
  await Promise.all(events.map(({ playerId, event }) => publishToPlayer(playerId, event)));
}

// ─── Ably token request (capability-scoped) ───────────────────────────────────

export interface AblyTokenResult {
  token: string;
  expires: number;
  capability: string;
}

/**
 * Issue an Ably capability token for a specific player.
 *
 * Capabilities granted:
 *   lobby:{lobbyId}     → subscribe, presence (read-only — clients never publish)
 *   player:{playerId}   → subscribe, history  (private hand delivery + reconnect)
 *
 * The clientId is set to playerId so Ably can authenticate presence entries.
 */
export async function createAblyToken(
  lobbyId: string,
  playerId: string
): Promise<Ably.TokenRequest> {
  const capability: Record<string, string[]> = {
    [channels.lobby(lobbyId)]: ['subscribe', 'presence'],
    [channels.player(playerId)]: ['subscribe', 'history'],
  };

  return getClient().auth.createTokenRequest({
    capability: JSON.stringify(capability),
    clientId: playerId,
    ttl: 24 * 60 * 60 * 1000, // 24h in milliseconds
  });
}
