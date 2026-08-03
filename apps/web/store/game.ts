import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Card, PlayerView, RoundResult, Seat, Team } from '@turuf/game-engine';
import type { PublicPlayerInfo, ServerEvent, LobbyStatus } from '@/types';

// ─── State Definition ─────────────────────────────────────────────────────────

export interface GameStoreState {
  // ── Session ──
  lobbyId: string | null;
  jwt: string | null;
  myPlayerId: string | null;
  mySeat: Seat | null;
  
  // ── Lobby State ──
  lobbyStatus: LobbyStatus;
  isAdmin: boolean;
  players: PublicPlayerInfo[];
  
  // ── Game State ──
  view: PlayerView | null;
  myHand: Card[];
  
  // ── Connection Status ──
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;

  // ── Timeout & Bot Status ──
  /** Unix ms timestamp deadline for the current turn (null = no active timer) */
  turnDeadline: number | null;
  /** Seats that are currently bot-controlled (player disconnected/inactive) */
  botSeats: Set<Seat>;
}

export interface GameStoreActions {
  // Session management
  setSession: (lobbyId: string, jwt: string, myPlayerId: string, mySeat: Seat) => void;
  setLobbyState: (status: LobbyStatus, players: PublicPlayerInfo[], isAdmin?: boolean) => void;
  setConnectionStatus: (isConnected: boolean, isReconnecting?: boolean) => void;
  setError: (error: string | null) => void;
  clearSession: () => void;

  // Real-time Event Reducer
  applyServerEvent: (event: ServerEvent) => void;
  
  // Local optimistic updates (optional, for immediate UI feedback before server confirms)
  optimisticPlayCard: (card: Card) => void;

  // Turn timer
  setTurnDeadline: (deadline: number | null) => void;
}

export type GameStore = GameStoreState & GameStoreActions;

const initialState: GameStoreState = {
  lobbyId: null,
  jwt: null,
  myPlayerId: null,
  mySeat: null,
  lobbyStatus: 'waiting',
  isAdmin: false,
  players: [],
  view: null,
  myHand: [],
  isConnected: false,
  isReconnecting: false,
  error: null,
  turnDeadline: null,
  botSeats: new Set(),
};

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,

  setSession: (lobbyId, jwt, myPlayerId, mySeat) => 
    set({ lobbyId, jwt, myPlayerId, mySeat, error: null }),
    
  setLobbyState: (status, players, isAdmin = false) => 
    set({ lobbyStatus: status, players, isAdmin }),
    
  setConnectionStatus: (isConnected, isReconnecting = false) => 
    set({ isConnected, isReconnecting }),
    
  setError: (error) => set({ error }),
  
  clearSession: () => set(initialState),

  setTurnDeadline: (deadline) => set({ turnDeadline: deadline }),

  optimisticPlayCard: (card: Card) => {
    const { myHand, view, mySeat } = get();
    if (!view || mySeat === null) return;
    
    // Remove card from hand
    const newHand = myHand.filter(c => c.id !== card.id);
    
    // Optimistically add to played cards
    const newPlayed = { ...view.played, [mySeat]: card };
    
    set({
      myHand: newHand,
      view: {
        ...view,
        played: newPlayed,
        // Don't change turn yet, wait for server confirmation to avoid glitches
      }
    });
  },

  applyServerEvent: (event: ServerEvent) => {
    set((state) => {
      switch (event.type) {
        case 'PLAYER_JOINED': {
          const newPlayers = [...state.players];
          const exists = newPlayers.findIndex(p => p.id === event.payload.player.id);
          if (exists === -1) {
            newPlayers.push(event.payload.player);
          }
          return {
            players: newPlayers,
            lobbyStatus: newPlayers.length === 4 ? 'ready' : 'waiting'
          };
        }
        
        case 'PLAYER_RENAMED': {
          const newPlayers = state.players.map(p => {
            if (p.seat === event.payload.seat) {
              return { ...p, name: event.payload.newName };
            }
            return p;
          });
          return { players: newPlayers };
        }
        
        case 'PLAYER_LEFT': {
          const newPlayers = state.players.filter(p => p.seat !== event.payload.seat);
          return { 
            players: newPlayers,
            lobbyStatus: newPlayers.length < 4 && state.lobbyStatus === 'ready' ? 'waiting' : state.lobbyStatus
          }; 
        }

        case 'PLAYER_RECONNECTED': {
          // For now, we don't handle online/offline presence in UI deeply, 
          // but we could update a status flag on the player.
          return state; 
        }

        case 'GAME_STARTED':
          return {
            lobbyStatus: 'in_game',
            view: event.payload.view,
          };

        case 'HAND_DEALT':
        case 'HAND_UPDATED':
          return { myHand: event.payload.cards };

        case 'TRUMP_SELECTED': {
          if (!state.view) return state;
          return {
            view: event.payload.view,
          };
        }

        case 'CARD_PLAYED': {
          if (!state.view) return state;
          const { seat, card, nextTurn, seq } = event.payload;
          
          return {
            view: {
              ...state.view,
              played: { ...state.view.played, [seat]: card },
              currentTurn: nextTurn as Seat,
              actionSequence: seq,
              // If it's the first card of the round, set the round suit
              roundSuit: Object.keys(state.view.played).length === 0 ? card.suit : state.view.roundSuit
            },
            // If it was my card (and I didn't optimistically update, or even if I did),
            // ensure it's removed from myHand.
            myHand: state.mySeat === seat 
              ? state.myHand.filter(c => c.id !== card.id)
              : state.myHand
          };
        }

        case 'ROUND_COMPLETE': {
          if (!state.view) return state;
          const { result, scores, nextLeader } = event.payload;
          
          return {
            view: {
              ...state.view,
              scores,
              roundHistory: [...state.view.roundHistory, result],
              currentLeader: nextLeader,
            }
          };
        }
        
        case 'ROUND_START': {
          if (!state.view) return state;
          const { roundNumber, leader } = event.payload;
          
          // Delay clearing the table for 3 seconds to show round winner animation
          setTimeout(() => {
            useGameStore.setState((s) => {
              if (!s.view) return s;
              // Only clear if the round is actually complete (4 cards). 
              // This prevents bugs if multiple rounds somehow start rapidly.
              if (Object.keys(s.view.played).length === 4) {
                return {
                  view: {
                    ...s.view,
                    played: {},
                    roundSuit: null
                  }
                };
              }
              return s;
            });
          }, 3000);

          return {
            view: {
              ...state.view,
              currentRound: roundNumber,
              currentTurn: leader,
              // DO NOT clear played or roundSuit yet
            }
          };
        }

        case 'GAME_ENDED': {
          if (!state.view) return state;
          const { winner, scores, history } = event.payload;
          return {
            lobbyStatus: 'post_game',
            view: {
              ...state.view,
              phase: 'complete',
              scores,
              roundHistory: history
            },
          };
        }

        case 'RECONNECT_STATE': {
          return {
            view: event.payload.view,
            myHand: event.payload.myHand,
            lobbyStatus: event.payload.view.phase === 'complete' ? 'post_game' : 'in_game'
          };
        }

        case 'PLAYER_TIMEOUT': {
          // The card was already applied via CARD_PLAYED — this is just a notification.
          // We could show a toast here in the future.
          return state;
        }

        case 'BOT_SUBSTITUTED': {
          // A player has been replaced by a bot
          const newBotSeats = new Set(state.botSeats);
          newBotSeats.add(event.payload.seat);
          return { botSeats: newBotSeats };
        }

        case 'PLAYER_RETURNED': {
          // A player has rejoined and taken back control from the bot
          const newBotSeats = new Set(state.botSeats);
          newBotSeats.delete(event.payload.seat);
          return { botSeats: newBotSeats };
        }

        case 'LOBBY_RESET': {
          return {
            lobbyStatus: event.payload.status as any,
            view: null,
            myHand: [],
            turnDeadline: null,
            botSeats: new Set(),
            error: null,
          };
        }

        default:
          return state;
      }
    });
  }
    }),
    {
      name: 'turuf-game-storage',
      storage: createJSONStorage(() => sessionStorage),
      // We only want to persist session and connection info, not the entire transient game state
      partialize: (state) => ({
        lobbyId: state.lobbyId,
        jwt: state.jwt,
        myPlayerId: state.myPlayerId,
        mySeat: state.mySeat,
      }),
    }
  )
);
