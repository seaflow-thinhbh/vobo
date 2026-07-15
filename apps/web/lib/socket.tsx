'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RoomSnapshot, Ack, Difficulty, OpenRoom, ChatMessage, InteractionEvent } from './types';

interface BombTriggeredEvent {
  callerId: string;
  callerName: string;
  number: number;
}

/**
 * Where the realtime server lives. Priority:
 *  1. NEXT_PUBLIC_SERVER_URL (explicit override, e.g. production).
 *  2. The same host that served this page, on port 3001 — so opening the app
 *     via a LAN IP (http://192.168.x.y:3000) auto-connects to that host's
 *     server (http://192.168.x.y:3001) instead of the visitor's own localhost.
 *  3. localhost:3001 as a last resort (SSR/build; the socket only opens in the browser).
 */
function resolveServerUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:3001`;
  return 'http://localhost:3001';
}

type Ok = Ack<Record<string, never>>;

interface SocketContextValue {
  connected: boolean;
  snapshot: RoomSnapshot | null;
  clearSnapshot: () => void;
  createRoom: (name: string, turnMs?: number, gridSize?: number, gameMode?: string, bombsEnabled?: boolean) => Promise<Ack<{ code: string; playerId: string; token: string }>>;
  joinRoom: (code: string, name: string) => Promise<Ack<{ playerId: string; token: string; nameChanged?: boolean; newName?: string }>>;
  resume: (code: string, token: string) => Promise<Ack<{ playerId: string }>>;
  addBot: (d: Difficulty) => Promise<Ok>;
  fillCard: (card: number[]) => Promise<Ok>;
  placeBomb: (n: number) => Promise<Ok>;
  ready: () => Promise<Ok>;
  start: () => Promise<Ok>;
  call: (n: number) => Promise<Ok>;
  leave: () => Promise<Ok>;
  openRooms: OpenRoom[];
  subscribeRooms: () => Promise<OpenRoom[]>;
  unsubscribeRooms: () => Promise<void>;
  newGame: () => Promise<Ok>;
  kickPlayer: (targetPlayerId: string) => Promise<Ok>;
  readyToReplay: () => Promise<Ok>;
  sendChat: (text: string) => Promise<Ok>;
  sendInteraction: (targetPlayerId: string, type: string) => Promise<Ok>;
  messages: ChatMessage[];
  interactions: InteractionEvent[];
  bombTriggered: BombTriggeredEvent | null;
  clearBombTriggered: () => void;
  joining: boolean;
}

const Ctx = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocket must be used within <SocketProvider>');
  return v;
}

function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(`vobo:token:${code}`, token);
  } catch {
    /* ignore storage errors */
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interactions, setInteractions] = useState<InteractionEvent[]>([]);
  const [bombTriggered, setBombTriggered] = useState<BombTriggeredEvent | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const socket = io(resolveServerUrl());
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:state', (s: RoomSnapshot) => setSnapshot(s));
    socket.on('rooms:list', (rooms: OpenRoom[]) => setOpenRooms(rooms));
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });
    socket.on('kicked', () => {
      setSnapshot(null);
      setMessages([]);
      window.location.href = '/';
    });
    socket.on('interaction:receive', (ev: InteractionEvent) => {
      setInteractions((prev) => [...prev.slice(-49), ev]);
    });
    socket.on('bomb:triggered', (ev: BombTriggeredEvent) => {
      setBombTriggered(ev);
    });
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  function emit<T>(event: string, payload?: unknown): Promise<T> {
    return new Promise((resolve) => {
      const s = socketRef.current;
      if (!s) {
        resolve({ ok: false, code: 'no_socket', message: 'Chưa kết nối máy chủ' } as T);
        return;
      }
      if (payload === undefined) s.emit(event, resolve);
      else s.emit(event, payload, resolve);
    });
  }

  const value: SocketContextValue = {
    connected,
    snapshot,
    clearSnapshot: () => { setSnapshot(null); setMessages([]); },
    createRoom: async (name, turnMs, gridSize, gameMode, bombsEnabled) => {
      setJoining(true);
      const r = await emit<Ack<{ code: string; playerId: string; token: string }>>('room:create', { name, turnMs, gridSize, gameMode, bombsEnabled });
      setJoining(false);
      if (r.ok) saveToken(r.code, r.token);
      return r;
    },
    joinRoom: async (code, name) => {
      setJoining(true);
      const r = await emit<Ack<{ playerId: string; token: string }>>('room:join', { code, name });
      setJoining(false);
      if (r.ok) saveToken(code, r.token);
      return r;
    },
    resume: (code, token) => emit('room:resume', { code, token }),
    addBot: (d) => emit('room:addBot', { difficulty: d }),
    fillCard: (card) => emit('player:fillCard', { card }),
    placeBomb: (n) => emit('player:placeBomb', { n }),
    ready: () => emit('player:ready'),
    start: () => emit('room:start'),
    call: (n) => emit('game:call', { n }),
    leave: () => emit('room:leave'),
    openRooms,
    subscribeRooms: async () => {
      const rooms = await emit<OpenRoom[]>('rooms:subscribe');
      setOpenRooms(rooms);
      return rooms;
    },
    unsubscribeRooms: async () => {
      await emit('rooms:unsubscribe');
    },
    newGame: () => emit('room:newGame'),
    kickPlayer: (targetPlayerId) => emit('room:kick', { targetPlayerId }),
    readyToReplay: () => emit('room:readyToReplay'),
    sendChat: (text) => emit('chat:send', { text }),
    sendInteraction: (targetPlayerId, type) => emit('interaction:send', { targetPlayerId, type }),
    messages,
    interactions,
    bombTriggered,
    clearBombTriggered: () => setBombTriggered(null),
    joining,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
