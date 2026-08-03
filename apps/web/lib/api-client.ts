import type { ApiError, ApiSuccess } from '@/types';
import { useGameStore } from '@/store/game';

class APIError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Generic fetch wrapper for API calls that throws typed errors on failure.
 */
async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const jwt = useGameStore.getState().jwt;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorData = data as ApiError;
      throw new APIError(
        errorData.error?.code || 'UNKNOWN_ERROR',
        errorData.error?.message || 'An unknown error occurred'
      );
    }

    return (data as ApiSuccess<T>).data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError('NETWORK_ERROR', 'Failed to connect to the server');
  }
}

// ─── API Methods ──────────────────────────────────────────────────────────────
import { devEngine } from './dev-engine';
import { Suit } from '@turuf/game-engine';

export const apiClient = {
  lobby: {
    create: (options?: { admin?: boolean; customId?: string }) => 
      fetchApi<{ lobbyId: string; joinUrl: string }>('/api/lobby/create', { 
        method: 'POST',
        body: options ? JSON.stringify(options) : undefined
      }),
      
    status: (lobbyId: string) => 
      fetchApi<any>(`/api/lobby/${lobbyId}/status`),
      
    join: (lobbyId: string, name: string) => 
      fetchApi<any>(`/api/lobby/${lobbyId}/join`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
      
    leave: (lobbyId: string) => 
      fetchApi<{ success: boolean }>(`/api/lobby/${lobbyId}/leave`, { method: 'POST' }),

    start: (lobbyId: string) => 
      fetchApi<{ status: string }>(`/api/lobby/${lobbyId}/start`, { method: 'POST' }),

    rename: (lobbyId: string, playerId: string, newName: string) =>
      fetchApi<{ success: boolean }>(`/api/lobby/${lobbyId}/rename`, {
        method: 'POST',
        body: JSON.stringify({ playerId, newName }),
      }),

    heartbeat: (lobbyId: string) =>
      fetchApi<{ ok: boolean }>(`/api/lobby/${lobbyId}/heartbeat`, { method: 'POST' }),

    rejoin: (lobbyId: string, playerId: string, name: string) =>
      fetchApi<any>(`/api/lobby/${lobbyId}/rejoin`, {
        method: 'POST',
        body: JSON.stringify({ playerId, name }),
      }),

    restart: (lobbyId: string) =>
      fetchApi<{ status: string }>(`/api/lobby/${lobbyId}/restart`, { method: 'POST' }),
  },
  
  game: {
    state: async () => {
      if (devEngine.active) return; // DevEngine pushes state directly
      return fetchApi<any>('/api/game/state');
    },
      
    trump: async (suit: string) => {
      if (devEngine.active) {
        devEngine.handleTrump(suit as Suit);
        return { trumpSuit: suit };
      }
      return fetchApi<{ trumpSuit: string }>('/api/game/trump', {
        method: 'POST',
        body: JSON.stringify({ suit }),
      });
    },
      
    action: async (cardId: string, seq: number) => {
      if (devEngine.active) {
        devEngine.handleAction(cardId, seq);
        return { seq, roundComplete: false, gameOver: false }; // Handled by broadcast
      }
      return fetchApi<{ seq: number; roundComplete: boolean; gameOver: boolean }>('/api/game/action', {
        method: 'POST',
        body: JSON.stringify({ cardId, seq }),
      });
    },
      
    chat: async (message: string) => {
      if (devEngine.active) {
        // Dev mode chat could push a message immediately, but we can just ignore or mock
        return { timestamp: Date.now() }; 
      }
      return fetchApi<{ timestamp: number }>('/api/game/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    },

    timeout: async () => {
      if (devEngine.active) {
        return { alreadyHandled: true };
      }
      return fetchApi<any>('/api/game/timeout', { method: 'POST' });
    },
  }
};
