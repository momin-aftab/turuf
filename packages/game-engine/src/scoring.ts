/**
 * Game scoring and winner calculation.
 *
 * The team with the most rounds won wins the game.
 * With 13 rounds, there is always a winner (no draws possible).
 */

import {
  type GameState,
  type RoundResult,
  type Seat,
  type Team,
  SEAT_TEAM,
  TOTAL_ROUNDS,
} from './types';

// ─── Score update ─────────────────────────────────────────────────────────────

/**
 * Update team scores by adding the round winner's team win.
 * Returns a new scores record — does not mutate the input.
 */
export function updateScores(
  scores: Record<Team, number>,
  roundWinner: Seat
): Record<Team, number> {
  const winningTeam = SEAT_TEAM[roundWinner];
  return {
    ...scores,
    [winningTeam]: scores[winningTeam] + 1,
  };
}

// ─── Game completion ──────────────────────────────────────────────────────────

/**
 * Determine whether the game is over.
 * The game ends after TOTAL_ROUNDS (13) completed rounds.
 */
export function isGameOver(roundHistory: RoundResult[]): boolean {
  return roundHistory.length >= TOTAL_ROUNDS;
}

// ─── Winner calculation ───────────────────────────────────────────────────────

export interface GameResult {
  readonly winner: Team;
  readonly scores: Record<Team, number>;
  /** Number of rounds won by each team */
  readonly roundsWon: Record<Team, number>;
}

/**
 * Compute the final game winner from the completed round history.
 *
 * Since there are 13 rounds (odd number), a tie is mathematically impossible.
 * The team with more rounds won takes the match.
 */
export function computeGameWinner(state: GameState): GameResult {
  if (!isGameOver(state.roundHistory)) {
    throw new Error(
      `computeGameWinner: game not over yet (${state.roundHistory.length}/${TOTAL_ROUNDS} rounds played)`
    );
  }

  const scores = state.scores;

  // 13 rounds — one team MUST have more wins
  const winner: Team = scores.A >= scores.B ? 'A' : 'B';

  return {
    winner,
    scores,
    roundsWon: { A: scores.A, B: scores.B },
  };
}

// ─── Game state transition after round completion ─────────────────────────────

export interface PostRoundState {
  /** Updated scores */
  readonly scores: Record<Team, number>;
  /** Updated round history */
  readonly roundHistory: RoundResult[];
  /** Whether the game is now over */
  readonly gameOver: boolean;
  /** Next round number (only meaningful if !gameOver) */
  readonly nextRound: number;
  /** Who leads the next round (the winner of this round) */
  readonly nextLeader: Seat;
}

/**
 * Compute the state after a round completes.
 * Increments scores, appends to history, checks for game over.
 */
export function resolveRound(state: GameState, roundResult: RoundResult): PostRoundState {
  const updatedScores = updateScores(state.scores, roundResult.winner);
  const updatedHistory = [...state.roundHistory, roundResult];
  const gameOver = isGameOver(updatedHistory);

  return {
    scores: updatedScores,
    roundHistory: updatedHistory,
    gameOver,
    nextRound: state.currentRound + 1,
    nextLeader: roundResult.winner,
  };
}
