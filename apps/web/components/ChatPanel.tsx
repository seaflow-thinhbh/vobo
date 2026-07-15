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
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const prevLen = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (!open && messages.length > prevLen) {
      const newMsgs = messages.slice(prevLen);
      const fromOthers = newMsgs.filter((m) => m.playerId !== youId).length;
      if (fromOthers > 0) setUnread((u) => u + fromOthers);
    }
  }, [messages, open, youId]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setUnread(0); }}
          className="fixed right-3 bottom-3 z-50 rounded-full bg-slate-800 p-2 text-white shadow"
          title="Chat"
        >
          💬
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-72 flex-col border-l border-slate-700 bg-slate-800 text-slate-100 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <span className="font-semibold">Chat</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-500">Chưa có tin nhắn</p>
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
            className="flex border-t border-slate-700 p-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập tin nhắn..."
              maxLength={500}
              className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500"
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
