'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/socket';

export default function LandingPage() {
  const router = useRouter();
  const { createRoom, joinRoom, connected } = useSocket();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function onCreate() {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const r = await createRoom(name.trim());
    if (r.ok) router.push(`/room/${r.code}`);
    else setError(r.message);
  }

  async function onJoin() {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const c = code.trim().toUpperCase();
    if (!c) return setError('Nhập mã phòng');
    const r = await joinRoom(c, name.trim());
    if (r.ok) router.push(`/room/${c}`);
    else setError(r.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Vobo · Bingo</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên hiển thị"
        className="mb-3 w-full rounded border border-slate-300 px-3 py-2"
      />
      <button
        onClick={onCreate}
        disabled={!connected}
        className="mb-4 w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
      >
        Tạo phòng
      </button>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Mã phòng"
          className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
        />
        <button
          onClick={onJoin}
          disabled={!connected}
          className="rounded bg-sky-600 px-4 font-medium text-white disabled:opacity-40"
        >
          Vào
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {!connected && <p className="mt-3 text-xs text-slate-400">Đang kết nối máy chủ…</p>}
    </main>
  );
}
