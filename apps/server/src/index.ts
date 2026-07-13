import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { InMemoryRoomStore } from './roomStore';
import { RoomManager } from './roomManager';
import { attachSocketServer } from './socketServer';
import { DEFAULT_CONFIG } from './config';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

export interface RunningServer {
  http: HttpServer;
  port: number;
  stop: () => Promise<void>;
}

export async function startServer(port = Number(process.env.PORT ?? 3001)): Promise<RunningServer> {
  const http = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: '*' },
  });
  const store = new InMemoryRoomStore();
  const manager = new RoomManager(store, DEFAULT_CONFIG);
  attachSocketServer(io, manager, store, DEFAULT_CONFIG);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  const stop = async (): Promise<void> => {
    io.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { http, port: actualPort, stop };
}

// Boot when run directly (tsx src/index.ts).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  startServer()
    .then(({ port }) => console.log(`[vobo] server listening on :${port}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
