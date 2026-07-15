import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { InMemoryRoomStore } from './roomStore';
import { RoomManager } from './roomManager';
import { attachSocketServer } from './socketServer';
import { DEFAULT_CONFIG } from './config';
import { ChatManager } from './chatManager';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

export interface RunningServer {
  http: HttpServer;
  port: number;
  stop: () => Promise<void>;
}

/**
 * Allowed CORS origin(s) for the web client. Set WEB_ORIGIN in production to the
 * deployed web URL (comma-separated for several), e.g. "https://vobo.vercel.app".
 * Unset (local/LAN dev) falls back to "*".
 */
function corsOrigin(): string | string[] {
  const raw = process.env.WEB_ORIGIN;
  if (!raw) return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function startServer(port = Number(process.env.PORT ?? 3001)): Promise<RunningServer> {
  const http = createServer((req, res) => {
    // Health check + a friendly response for a plain browser hit; Socket.IO handles /socket.io/*.
    if (req.url === '/' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('vobo-server ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: corsOrigin() },
  });
  const store = new InMemoryRoomStore();
  const manager = new RoomManager(store, DEFAULT_CONFIG);
  const chat = new ChatManager();
  attachSocketServer(io, manager, store, DEFAULT_CONFIG, chat);

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
