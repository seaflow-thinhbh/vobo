import type { GameModule } from '../engine';
import type { BingoState, BingoMove, BingoView } from './types';
import { createInitialState } from './state';
import { validateMove } from './validate';
import { applyMove, checkGameEnd } from './apply';
import { botMove } from './bot';
import { projectStateFor } from './project';

export const bingoModule: GameModule<BingoState, BingoMove, BingoView> = {
  id: 'bingo',
  createInitialState,
  validateMove,
  applyMove,
  checkGameEnd,
  botMove,
  projectStateFor,
};

export * from './types';
