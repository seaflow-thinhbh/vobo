import type { PlayerSeat, Rng } from '../types';
import type { BingoState, BingoPlayer } from './types';
import { randomCard } from './setup';

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function createInitialState(
  players: PlayerSeat[],
  rng: Rng,
  opts?: { firstPlayerId?: string },
): BingoState {
  const bingoPlayers: BingoPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    botDifficulty: p.botDifficulty,
    card: p.isBot ? randomCard(rng) : [],
    ready: p.isBot,
    completedLines: 0,
    connected: true,
  }));

  let turnOrder = shuffle(
    players.map((p) => p.id),
    rng,
  );
  const first = opts?.firstPlayerId;
  if (first && turnOrder.includes(first)) {
    turnOrder = [first, ...turnOrder.filter((id) => id !== first)];
  }

  return {
    phase: 'setup',
    players: bingoPlayers,
    turnOrder,
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}
