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
  const [text, setText] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const chatContent = (
    <div className="flex h-full w-full flex-col bg-slate-800 text-slate-100 md:w-72 md:border-l md:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <span className="font-semibold">Chat</span>
        <button type="button" onClick={() => setMobileOpen(false)} className="text-slate-400 md:hidden">
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
  );

  return (
    <>
      {/* Desktop: always visible, Mobile: bottom sheet */}
      <div className="hidden md:block fixed right-0 top-0 z-40 h-full">
        {chatContent}
      </div>

      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed right-3 bottom-3 z-50 rounded-full bg-slate-700 p-2 text-white shadow"
        title="Chat"
      >
        💬
      </button>

      {/* Mobile bottom sheet */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-[60vh]">
            {chatContent}
          </div>
        </>
      )}
    </>
  );
}
