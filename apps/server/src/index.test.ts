import { describe, it, expect, afterEach } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer } from './index';

let stop: (() => Promise<void>) | undefined;
const clients: Socket[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  if (stop) await stop();
  stop = undefined;
});

describe('startServer', () => {
  it('boots and accepts a connection that can create a room', async () => {
    const started = await startServer(0);
    stop = started.stop;

    const c = ioClient(`http://localhost:${started.port}`);
    clients.push(c);

    const created = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      c.emit('room:create', { name: 'An' }, resolve);
    });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
  });
});
