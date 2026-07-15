import type { BingoState, BingoView } from './types';
import { markedMask } from './rules';

export function projectStateFor(state: BingoState, playerId: string): BingoView {
  const you = state.players.find((p) => p.id === playerId);
  if (!you) throw new Error(`player ${playerId} not in state`);

  const called = new Set(state.calledNumbers);
  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      completedLines: p.completedLines,
      connected: p.connected,
      ready: p.ready,
    }));

  return {
    gridSize: state.gridSize,
    phase: state.phase,
    you: {
      id: you.id,
      card: [...you.card],
      marked: markedMask(you.card, called),
      completedLines: you.completedLines,
      ready: you.ready,
    },
    opponents,
    calledNumbers: [...state.calledNumbers],
    currentPlayerId: state.phase === 'playing' ? (state.turnOrder[state.currentTurn] ?? null) : null,
    winners: [...state.winners],
  };
}
