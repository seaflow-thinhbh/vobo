'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/socket';
import { RoomList } from '@/components/RoomList';

export default function LandingPage() {
  const router = useRouter();
  const { createRoom, joinRoom, connected, openRooms, subscribeRooms, unsubscribeRooms, joining } = useSocket();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [turnSec, setTurnSec] = useState(20);
  const [gridSize, setGridSize] = useState<number>(5);
  const [gameMode, setGameMode] = useState<'fun' | 'casual'>('fun');
  const [bombsEnabled, setBombsEnabled] = useState(false);

  useEffect(() => {
    if (!connected) return;
    void subscribeRooms();
    return () => {
      void unsubscribeRooms();
    };
  }, [connected, subscribeRooms, unsubscribeRooms]);

  async function onCreate() {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const r = await createRoom(name.trim(), turnSec * 1000, gridSize, gameMode, bombsEnabled);
    if (r.ok) router.push(`/room/${r.code}`);
    else setError(r.message);
  }

  async function joinCode(raw: string) {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const c = raw.trim().toUpperCase();
    if (!c) return setError('Nhập mã phòng');
    const r = await joinRoom(c, name.trim());
    if (r.ok) {
      if (r.nameChanged) setError(`Tên "${name.trim()}" bị trùng, đã đổi thành "${r.newName}"`);
      router.push(`/room/${c}`);
    } else setError(r.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Vobo · Bingo</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên hiển thị"
        className="mb-3 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500"
      />
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-400">Chế độ</div>
        <div className="flex gap-1">
          {[5, 6, 7].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setGridSize(s)}
              className={`flex-1 rounded py-1.5 text-sm font-medium ${
                gridSize === s ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {s}x{s}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-400">Kiểu chơi</div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setGameMode('fun')}
            className={`flex-1 rounded py-1.5 text-sm font-medium ${
              gameMode === 'fun' ? 'bg-rose-700 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            🔥 Fun
          </button>
          <button
            type="button"
            onClick={() => setGameMode('casual')}
            className={`flex-1 rounded py-1.5 text-sm font-medium ${
              gameMode === 'casual' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            😌 Casual
          </button>
        </div>
        {gameMode === 'casual' && (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={bombsEnabled}
              onChange={(e) => setBombsEnabled(e.target.checked)}
              className="rounded"
            />
            💣 Bật bomb
          </label>
        )}
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-400">Thời gian mỗi lượt</div>
        <div className="flex gap-1">
          {[15, 20, 30, 45, 60].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTurnSec(s)}
              className={`flex-1 rounded py-1.5 text-sm font-medium ${
                turnSec === s ? 'bg-slate-800 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onCreate}
        disabled={!connected || joining || !name.trim()}
        className="mb-4 w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
      >
        {joining ? 'Đang xử lý…' : 'Tạo phòng'}
      </button>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Mã phòng"
          className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 uppercase text-slate-100 placeholder:text-slate-500"
        />
        <button
          onClick={() => joinCode(code)}
          disabled={!connected || joining || !name.trim()}
          className="rounded bg-sky-600 px-4 font-medium text-white disabled:opacity-40"
        >
          Vào
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {!connected && <p className="mt-3 text-xs text-slate-500">Đang kết nối máy chủ…</p>}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">Phòng đang chờ</h2>
      <RoomList rooms={openRooms} onJoin={(c) => joinCode(c)} disabled={!name.trim() || joining} />
    </main>
  );
}
