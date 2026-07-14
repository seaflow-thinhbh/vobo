import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

// Two humans, game started (setup phase).
function twoHumanGame() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const { code, playerId: a } = m.createRoom('An');
  const b = (m.joinRoom(code, 'Bình') as { ok: true; playerId: string }).playerId;
  m.startGame(code, a);
  return { store, m, code, a, b };
}

describe('RoomManager game moves', () => {
  it('rejects an invalid card', () => {
    const { m, code, a } = twoHumanGame();
    expect(m.fillCard(code, a, [1, 2, 3])).toMatchObject({ ok: false });
  });

  it('fill + ready for both players transitions the game to playing', () => {
    const { store, m, code, a, b } = twoHumanGame();
    expect(m.fillCard(code, a, ordered).ok).toBe(true);
    expect(m.setReady(code, a).ok).toBe(true);
    expect(m.fillCard(code, b, ordered).ok).toBe(true);
    expect(m.setReady(code, b).ok).toBe(true);
    expect(store.get(code)!.state!.phase).toBe('playing');
  });

  it('rejects calling out of turn', () => {
    const { store, m, code, a, b } = twoHumanGame();
    m.fillCard(code, a, ordered); m.setReady(code, a);
    m.fillCard(code, b, ordered); m.setReady(code, b);
    // turn order is shuffled — derive who is actually on turn
    const state = store.get(code)!.state!;
    const current = state.turnOrder[state.currentTurn]!;
    const other = current === a ? b : a;
    expect(m.callNumber(code, other, 7)).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(m.callNumber(code, current, 7).ok).toBe(true);
  });
});
