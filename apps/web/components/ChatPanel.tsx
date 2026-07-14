'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

export function ChatPanel({
  messages,
  onSend,
  youId,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  youId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed right-3 top-3 z-50 rounded-full bg-slate-800 p-2 text-white shadow"
        title="Chat"
      >
        💬
      </button>

      {open && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-72 flex-col border-l bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-semibold">Chat</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-500">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400">Chưa có tin nhắn</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="mb-1">
                <span className={`text-xs font-medium ${m.playerId === youId ? 'text-emerald-600' : 'text-sky-600'}`}>
                  {m.playerName}
                </span>
                <span className="ml-1 text-sm">{m.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex border-t p-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập tin nhắn..."
              maxLength={500}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="ml-1 rounded bg-emerald-600 px-3 py-1 text-sm text-white"
            >
              Gửi
            </button>
          </form>
        </div>
      )}
    </>
  );
}
