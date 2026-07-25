import { 
  GameState, 
  PlayerView, 
  Seat, 
  Suit,
  Card,
  createInitialGameState,
  applyTrumpSelection, 
  applyCardPlay, 
  toPlayerView, 
  selectRandomLegalCard, 
  generateShuffledDeck, 
  dealInitial, 
  dealFull,
  applyMove,
  resolveRound
} from '@turuf/game-engine';
import { useGameStore } from '@/store/game';

class DevEngine {
  public active = false;
  private state: GameState | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  
  // Need to hold onto remaining deck before trump is selected
  private remainingDeck: any[] = [];
  private player1InitialHand: any[] = [];

  startDevGame() {
    this.active = true;
    
    // 1. Initialize State (Phase 1)
    const deck = generateShuffledDeck();
    const { player1Hand, remainingDeck } = dealInitial(deck);
    
    this.player1InitialHand = player1Hand;
    this.remainingDeck = remainingDeck;
    
    this.state = createInitialGameState('dev-lobby', player1Hand, remainingDeck);
    
    // Set mock session in the main store so UI renders properly
    const store = useGameStore.getState();
    store.setSession('DEV', 'dev-jwt', 'p1', 0);
    store.setLobbyState('in_game', [
      { id: 'p1', name: 'You (Dev)', seat: 0, team: 'A' },
      { id: 'b1', name: 'Bot 1', seat: 1, team: 'B' },
      { id: 'b2', name: 'Bot 2', seat: 2, team: 'A' },
      { id: 'b3', name: 'Bot 3', seat: 3, team: 'B' },
    ]);
    
    store.setConnectionStatus(true, false);
    
    // Broadcast initial state
    this.broadcastState();
    
    // The state is in initial_deal. 
    // We should transition to trump_selection.
    // However, our UI expects "trump_selection" phase to show the modal.
    // The engine's transitionToTrumpSelection is basically just changing the phase string.
    this.state = {
      ...this.state,
      phase: 'trump_selection'
    };
    this.broadcastState();
  }

  stopDevGame() {
    this.active = false;
    this.state = null;
    if (this.botTimer) clearTimeout(this.botTimer);
    useGameStore.getState().clearSession();
  }

  handleTrump(suit: Suit) {
    if (!this.state) throw new Error('No game running');
    if (this.state.phase !== 'trump_selection') throw new Error('Not trump selection phase');

    // 1. Deal full
    const fullDeal = dealFull(this.player1InitialHand, this.remainingDeck);
    
    // 2. Apply trump selection
    this.state = applyTrumpSelection(this.state, suit, fullDeal.hands);
    
    // 3. Trigger bots if P1 is not the first to play (though P1 is always first in Turuf)
    this.broadcastState();
    this.scheduleBotTurn();
  }

  handleAction(cardId: string, seq: number) {
    if (!this.state) throw new Error('No game running');
    if (seq !== this.state.actionSequence) throw new Error('Invalid sequence');
    if (Object.keys(this.state.played).length === 4) return; // Ignore input during cooldown

    const card = this.state.hands[0].find(c => c.id === cardId);
    if (!card) throw new Error('Card not found in hand');

    this.applyPlayWithPause(0, card);
  }

  private broadcastState() {
    if (!this.state) return;
    
    const view = toPlayerView(this.state, 0);
    const store = useGameStore.getState();

    store.applyServerEvent({
      type: 'RECONNECT_STATE',
      payload: {
        view,
        myHand: this.state.hands[0]
      }
    });
  }

  private applyPlayWithPause(seat: Seat, card: Card) {
    if (!this.state) return;

    // Use applyMove to get intermediate state
    const moveResult = applyMove(this.state, seat, card);

    // Build the intermediate GameState
    const intermediateState: GameState = {
      ...this.state,
      hands: moveResult.hands,
      played: moveResult.played,
      roundSuit: moveResult.roundSuit,
      actionSequence: this.state.actionSequence + 1,
      lastActionAt: Date.now(),
    };

    if (!moveResult.roundComplete || moveResult.roundResult === null) {
      // Round not complete, just advance turn and schedule bot
      this.state = {
        ...intermediateState,
        currentTurn: moveResult.nextTurn!,
      };
      this.broadcastState();
      this.scheduleBotTurn();
      return;
    }

    // Round is complete!
    // 1. Broadcast the intermediate state so UI sees all 4 cards
    // We set currentTurn to the winner temporarily, or just leave it so the UI doesn't think it's someone's turn
    this.state = {
      ...intermediateState,
      currentTurn: moveResult.roundResult.winner, 
    };
    this.broadcastState();

    // 2. Pause for 2.5 seconds
    if (this.botTimer) clearTimeout(this.botTimer);
    
    this.botTimer = setTimeout(() => {
      if (!this.state) return;
      
      // 3. Resolve the round and broadcast the advanced state
      const postRound = resolveRound(this.state, moveResult.roundResult!);

      if (postRound.gameOver) {
        this.state = {
          ...this.state,
          scores: postRound.scores,
          roundHistory: postRound.roundHistory,
          phase: 'complete',
          played: {},
          roundSuit: null,
        };
      } else {
        this.state = {
          ...this.state,
          scores: postRound.scores,
          roundHistory: postRound.roundHistory,
          currentRound: postRound.nextRound,
          currentLeader: postRound.nextLeader,
          currentTurn: postRound.nextLeader,
          played: {},
          roundSuit: null,
        };
      }

      this.broadcastState();
      this.scheduleBotTurn();
    }, 5000);
  }

  private scheduleBotTurn() {
    if (!this.state) return;
    if (this.state.phase === 'complete') return;
    
    const turn = this.state.currentTurn;
    if (turn === 0) return; // Human's turn

    if (this.botTimer) clearTimeout(this.botTimer);
    
    this.botTimer = setTimeout(() => {
      this.executeBotTurn(turn);
    }, 1000); // 1 second delay for realism
  }

  private executeBotTurn(seat: Seat) {
    if (!this.state) return;
    if (this.state.currentTurn !== seat) return;
    if (Object.keys(this.state.played).length === 4) return; // Prevent bot from playing during cooldown

    // Pick a random legal card
    const cardToPlay = selectRandomLegalCard(this.state.hands[seat], this.state.roundSuit);
    if (!cardToPlay) return;

    this.applyPlayWithPause(seat, cardToPlay);
  }
}

export const devEngine = new DevEngine();
