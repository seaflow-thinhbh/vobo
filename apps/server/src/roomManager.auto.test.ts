import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

// Human 'a' + one bot, driven to the playing phase.
function humanVsBot() {
  const store = new InMemoryRoomStore();
  // deterministic rand so autoCall is reproducible
  let seed = 0.1;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
  const m = new RoomManager(store, DEFAULT_CONFIG, rand);
  const { code, playerId: a } = m.createRoom('An');
  m.addBot(code, a, 'medium');
  m.startGame(code, a);
  m.fillCard(code, a, ordered);
  m.setReady(code, a); // bot already ready -> transitions to playing
  return { store, m, code, a };
}

describe('RoomManager automated turns', () => {
  it('currentPlayer reports whose turn it is in the playing phase', () => {
    const { store, m, code } = humanVsBot();
    const room = store.get(code)!;
    const cur = m.currentPlayer(room)!;
    expect(cur.id).toBe(room.state!.turnOrder[room.state!.currentTurn]); // turn order is shuffled
  });

  it('autoCall appends a legal number and advances the turn', () => {
    const { store, m, code } = humanVsBot();
    const before = store.get(code)!.state!.calledNumbers.length;
    const r = m.autoCall(code);
    expect(r.ok).toBe(true);
    const state = store.get(code)!.state!;
    expect(state.calledNumbers.length).toBe(before + 1);
  });

  it('botCall makes a move when it is the bot turn', () => {
    const { store, m, code } = humanVsBot();
    // Turn order is shuffled: advance one turn only if the human is first, so it is the bot's turn.
    if (!m.currentPlayer(store.get(code)!)!.isBot) m.autoCall(code);
    expect(m.currentPlayer(store.get(code)!)!.isBot).toBe(true);
    const before = store.get(code)!.state!.calledNumbers.length;
    const r = m.botCall(code);
    expect(r.ok).toBe(true);
    expect(store.get(code)!.state!.calledNumbers.length).toBe(before + 1);
  });
});
