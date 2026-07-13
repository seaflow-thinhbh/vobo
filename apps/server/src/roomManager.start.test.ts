import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function setup(cfg = DEFAULT_CONFIG) {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, cfg);
  const { code, playerId } = m.createRoom('An');
  return { store, m, code, hostId: playerId };
}

describe('RoomManager addBot/startGame', () => {
  it('host can add a bot with a difficulty', () => {
    const { store, m, code, hostId } = setup();
    const r = m.addBot(code, hostId, 'hard');
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    const bot = room.roster.find((p) => p.isBot)!;
    expect(bot.botDifficulty).toBe('hard');
  });

  it('non-host cannot add a bot', () => {
    const { m, code } = setup();
    expect(m.addBot(code, 'someone-else', 'easy')).toMatchObject({ ok: false, code: 'not_host' });
  });

  it('startGame requires the minimum number of players', () => {
    const { m, code, hostId } = setup();
    expect(m.startGame(code, hostId)).toMatchObject({ ok: false, code: 'not_enough_players' });
  });

  it('startGame creates engine state in setup phase once minimum is met', () => {
    const { store, m, code, hostId } = setup();
    m.addBot(code, hostId, 'medium');
    const r = m.startGame(code, hostId);
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    expect(room.state?.phase).toBe('setup');
    // bot is auto-ready with a card; host (human) is not
    const bot = room.state!.players.find((p) => p.isBot)!;
    expect(bot.ready).toBe(true);
    expect(room.state!.players.find((p) => p.id === hostId)!.ready).toBe(false);
  });
});
