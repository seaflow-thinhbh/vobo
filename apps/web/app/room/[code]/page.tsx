'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/socket';
import { RoomView, type RoomActions } from '@/components/RoomView';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const s = useSocket();

  const inThisRoom = s.snapshot?.code === code;

  // Fresh load / refresh (no snapshot yet): try to reclaim the seat with the stored token.
  useEffect(() => {
    if (inThisRoom || !s.connected) return;
    let token: string | null = null;
    try {
      token = localStorage.getItem(`vobo:token:${code}`);
    } catch {
      token = null;
    }
    if (token) {
      void s.resume(code, token).then((r) => {
        if (!r.ok) router.replace('/');
      });
    } else {
      router.replace('/');
    }
  }, [inThisRoom, s.connected, s, code, router]);

  if (!inThisRoom || !s.snapshot) {
    return <main className="p-6 text-center text-slate-500">Đang vào phòng {code}…</main>;
  }

  const actions: RoomActions = {
    addBot: s.addBot,
    start: s.start,
    fillCard: s.fillCard,
    placeBomb: s.placeBomb,
    ready: s.ready,
    call: s.call,
    newGame: s.newGame,
    kickPlayer: s.kickPlayer,
    readyToReplay: s.readyToReplay,
    sendChat: s.sendChat,
    sendInteraction: s.sendInteraction,
    leave: async () => {
      const r = await s.leave();
      s.clearSnapshot();
      router.push('/');
      return r;
    },
  };

  return (
    <main className="p-4">
      <RoomView snapshot={s.snapshot} actions={actions} messages={s.messages} interactions={s.interactions} />
    </main>
  );
}
