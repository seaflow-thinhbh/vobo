import type { BingoState, BingoMove } from './types';
import { countCompletedLines } from './rules';
import type { GameEnd } from '../engine';

export function applyMove(state: BingoState, playerId: string, move: BingoMove): BingoState {
  switch (move.type) {
    case 'FillCard':
      return fillCard(state, playerId, move.card);
    case 'SetReady':
      return setReady(state, playerId);
    case 'CallNumber':
      return callNumber(state, playerId, move.n);
  }
}

function fillCard(state: BingoState, playerId: string, card: number[]): BingoState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, card: [...card] } : p)),
  };
}

function setReady(state: BingoState, playerId: string): BingoState {
  const players = state.players.map((p) => (p.id === playerId ? { ...p, ready: true } : p));
  const allReady = players.every((p) => p.ready);
  if (!allReady) return { ...state, players };
  return {
    ...state,
    players,
    phase: 'playing',
  };
}

function callNumber(state: BingoState, callerId: string, n: number): BingoState {
  const calledNumbers = [...state.calledNumbers, n];
  const called = new Set(calledNumbers);
  const players = state.players.map((p) => ({
    ...p,
    completedLines: countCompletedLines(p.card, called),
  }));

  const winnersSet = players.filter((p) => p.completedLines >= 5).map((p) => p.id);
  if (winnersSet.length > 0) {
    const winnerId = resolveWinner(state.turnOrder, callerId, winnersSet);
    return { ...state, calledNumbers, players, phase: 'finished', winners: [winnerId] };
  }

  const currentTurn = (state.currentTurn + 1) % state.turnOrder.length;
  return { ...state, calledNumbers, players, currentTurn };
}

/**
 * Caller-priority tie-break (spec §3): the caller wins if they reached 5 lines;
 * otherwise the first winner scanning turnOrder forward from the caller.
 */
function resolveWinner(turnOrder: string[], callerId: string, winnersSet: string[]): string {
  if (winnersSet.includes(callerId)) return callerId;
  const start = turnOrder.indexOf(callerId);
  for (let i = 0; i < turnOrder.length; i++) {
    const cand = turnOrder[(start + i) % turnOrder.length]!;
    if (winnersSet.includes(cand)) return cand;
  }
  return winnersSet[0]!; // unreachable when winnersSet is non-empty
}

export function checkGameEnd(state: BingoState): GameEnd {
  return { finished: state.phase === 'finished', winners: [...state.winners] };
}
