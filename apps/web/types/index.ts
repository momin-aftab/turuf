/**
 * Shared type definitions for the web layer.
 * These types represent data stored in Redis and events sent over Ably.
 */

import type { Card, GameState, PlayerView, RoundResult, Seat, Suit, Team } from '@turuf/game-engine';

// ─── Redis Records ─────────────────────────────────────────────────────────────

export type LobbyStatus = 'waiting' | 'ready' | 'in_game' | 'post_game';

/** Stored in Redis as JSON at key `lobby:{ID}` */
export interface LobbyRecord {
  id: string;
  status: LobbyStatus;
  hostPlayerId: string;
  createdAt: number; // unix ms
  startedAt?: number;
  endedAt?: number;
  players: PlayerRecord[];
  isAdmin?: boolean;
}

/** Stored inline inside LobbyRecord.players */
export interface PlayerRecord {
  id: string; // UUID v4
  name: string; // display name (max 20 chars, HTML-escaped)
  seat: Seat;
  team: 'A' | 'B';
  status: 'connected' | 'disconnected';
  disconnectedAt?: number;
}

// ─── JWT Payload ───────────────────────────────────────────────────────────────

export interface TurufJWT {
  lobbyId: string;
  playerId: string;
  seat: Seat;
}

// ─── Ably Events (Server → Client) ────────────────────────────────────────────

export type ServerEvent =
  | { type: 'PLAYER_JOINED'; payload: { player: PublicPlayerInfo; playerCount: number } }
  | { type: 'PLAYER_LEFT'; payload: { seat: Seat; name: string } }
  | { type: 'PLAYER_RECONNECTED'; payload: { seat: Seat; name: string } }
  | { type: 'PLAYER_RENAMED'; payload: { seat: Seat; newName: string } }
  | { type: 'GAME_STARTED'; payload: { view: PlayerView } }
  | { type: 'HAND_DEALT'; payload: { cards: Card[] } } // private channel only
  | { type: 'TRUMP_SELECTED'; payload: { trumpSuit: Suit; view: PlayerView } }
  | { type: 'HAND_UPDATED'; payload: { cards: Card[] } } // private channel only (P1 after full deal)
  | { type: 'CARD_PLAYED'; payload: { seat: Seat; card: Card; nextTurn: Seat | null; seq: number } }
  | { type: 'ROUND_COMPLETE'; payload: { result: RoundResult; scores: Record<Team, number>; nextLeader: Seat } }
  | { type: 'ROUND_START'; payload: { roundNumber: number; leader: Seat } }
  | { type: 'GAME_ENDED'; payload: { winner: Team; scores: Record<Team, number>; history: RoundResult[] } }
  | { type: 'RECONNECT_STATE'; payload: { view: PlayerView; myHand: Card[] } }
  | { type: 'PLAYER_TIMEOUT'; payload: { seat: Seat; name: string; cardPlayed: Card } }
  | { type: 'CHAT_MESSAGE'; payload: { seat: Seat; name: string; message: string; timestamp: number } };

export interface PublicPlayerInfo {
  id: string;
  name: string;
  seat: Seat;
  team: 'A' | 'B';
}

// ─── API Response Envelope ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
