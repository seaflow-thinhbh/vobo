import type { BingoState, BingoMove } from './types';

export function applyMove(state: BingoState, playerId: string, move: BingoMove): BingoState {
  switch (move.type) {
    case 'FillCard':
      return fillCard(state, playerId, move.card);
    case 'SetReady':
      return setReady(state, playerId);
    case 'CallNumber':
      // Implemented in Task 11.
      throw new Error('CallNumber not implemented yet');
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
    turnOrder: players.map((p) => p.id),
    currentTurn: 0,
  };
}
