import { create } from 'zustand';
import type { Card, PlayerView, RoundResult, Seat, Team } from '@turuf/game-engine';
import type { PublicPlayerInfo, ServerEvent, LobbyStatus } from '@/types';

// ─── State Definition ─────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string; // unique ID for React key (usually timestamp + seat)
  seat: Seat;
  name: string;
  message: string;
  timestamp: number;
}

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
  chatHistory: ChatMessage[];
  
  // ── Connection Status ──
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
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
  chatHistory: [],
  isConnected: false,
  isReconnecting: false,
  error: null,
};

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setSession: (lobbyId, jwt, myPlayerId, mySeat) => 
    set({ lobbyId, jwt, myPlayerId, mySeat, error: null }),
    
  setLobbyState: (status, players, isAdmin = false) => 
    set({ lobbyStatus: status, players, isAdmin }),
    
  setConnectionStatus: (isConnected, isReconnecting = false) => 
    set({ isConnected, isReconnecting }),
    
  setError: (error) => set({ error }),
  
  clearSession: () => set(initialState),

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
        
        case 'PLAYER_LEFT':
        case 'PLAYER_RECONNECTED': {
          // For now, we don't handle online/offline presence in UI deeply, 
          // but we could update a status flag on the player.
          return state; 
        }

        case 'GAME_STARTED':
          return {
            lobbyStatus: 'in_game',
            view: event.payload.view,
            chatHistory: [...state.chatHistory, {
              id: `sys-${Date.now()}`,
              seat: 0 as Seat, // system message
              name: 'System',
              message: 'Game started! Player 1 is selecting trump.',
              timestamp: Date.now()
            }]
          };

        case 'HAND_DEALT':
        case 'HAND_UPDATED':
          return { myHand: event.payload.cards };

        case 'TRUMP_SELECTED': {
          if (!state.view) return state;
          return {
            view: event.payload.view,
            chatHistory: [...state.chatHistory, {
              id: `sys-${Date.now()}`,
              seat: 0 as Seat,
              name: 'System',
              message: `Trump selected: ${event.payload.trumpSuit}`,
              timestamp: Date.now()
            }]
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
          return {
            view: {
              ...state.view,
              currentRound: roundNumber,
              currentTurn: leader,
              played: {}, // clear the table
              roundSuit: null
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
            chatHistory: [...state.chatHistory, {
              id: `sys-${Date.now()}`,
              seat: 0 as Seat,
              name: 'System',
              message: `Game over! Team ${winner} wins.`,
              timestamp: Date.now()
            }]
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
          // Can push a system chat message
          return state;
        }

        case 'CHAT_MESSAGE': {
          const { seat, name, message, timestamp } = event.payload;
          return {
            chatHistory: [...state.chatHistory, {
              id: `${timestamp}-${seat}`,
              seat,
              name,
              message,
              timestamp
            }]
          };
        }

        default:
          return state;
      }
    });
  }
}));
