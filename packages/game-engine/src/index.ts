/**
 * Public API for the @turuf/game-engine package.
 *
 * Import from this module only — do not import individual sub-modules
 * from outside this package.
 *
 * @example
 * import { generateShuffledDeck, validateMove, applyCardPlay } from '@turuf/game-engine';
 */

// Types
export type {
  Card,
  Suit,
  Rank,
  Seat,
  Team,
  GamePhase,
  GameState,
  PlayerView,
  PlayedCard,
  RoundResult,
  ValidationError,
  ValidationResult,
} from './types';

export {
  SEAT_TEAM,
  ALL_SUITS,
  ALL_RANKS,
  SUIT_NAMES,
  RANK_NAMES,
  TOTAL_ROUNDS,
  INITIAL_DEAL_COUNT,
  CARDS_PER_PLAYER,
  PLAYER_COUNT,
} from './types';

// Deck
export { generateDeck, generateShuffledDeck, shuffle, cardId, parseCardId } from './deck';

// Deal
export {
  dealInitial,
  dealFull,
  selectRandomLegalCard,
  buildInitialGameState,
  toPlayerView,
} from './deal';

// Rules / Validation
export {
  validateMove,
  validateTrumpSelection,
  validateGameStart,
  sanitizeChatMessage,
} from './rules';

// Round
export {
  effectiveValue,
  computeRoundWinner,
  isRoundComplete,
  buildRoundResult,
  applyMove,
} from './round';

// Scoring
export { updateScores, isGameOver, computeGameWinner, resolveRound } from './scoring';

// State reducers
export {
  createInitialGameState,
  transitionToTrumpSelection,
  applyTrumpSelection,
  applyCardPlay,
} from './state';
