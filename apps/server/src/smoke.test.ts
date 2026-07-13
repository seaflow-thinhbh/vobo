import { describe, it, expect } from 'vitest';
import { bingoModule } from '@vobo/game-engine';

describe('smoke', () => {
  it('can import the game engine', () => {
    expect(bingoModule.id).toBe('bingo');
  });
});
