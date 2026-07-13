import type { PlayerSeat, Rng } from '../types';
import type { BingoState, BingoPlayer } from './types';
import { randomCard } from './setup';

export function createInitialState(players: PlayerSeat[], rng: Rng): BingoState {
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
  return {
    phase: 'setup',
    players: bingoPlayers,
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}
