'use client';

import { useState } from 'react';

export function GlobalOverlay() {
  const [showHelp, setShowHelp] = useState(false);
  const [showDonate, setShowDonate] = useState(true);

  return (
    <>
      {/* Help button + modal */}
      <button
        type="button"
        onClick={() => setShowHelp(true)}
        className="fixed left-3 top-12 z-50 rounded-full bg-white px-2.5 py-1 text-sm font-bold text-slate-800 shadow"
        title="Hướng dẫn"
      >
        ?
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowHelp(false)}>
          <div className="mx-4 max-w-sm rounded-xl bg-slate-800 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Cách chơi Bingo</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>• Mỗi người có 1 vé 5x5 chứa các số 1-25.</li>
              <li>• Đến lượt mình, hô 1 số chưa được gọi.</li>
              <li>• Nếu số đó có trên vé của bạn, ô đó được đánh dấu.</li>
              <li>• Ai hoàn thành <strong>5 đường</strong> (hàng/cột/chéo) trước sẽ thắng!</li>
            </ul>
            <button onClick={() => setShowHelp(false)} className="mt-4 w-full rounded bg-slate-700 py-2 text-sm text-slate-100">
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Donate button + QR */}
      <button
        type="button"
        onClick={() => setShowDonate(!showDonate)}
        className="fixed left-3 bottom-16 z-50 rounded-full bg-amber-500 p-2 text-white shadow"
        title="Donate"
      >
        ☕
      </button>

      {showDonate && (
        <div className="fixed left-3 bottom-28 z-50 rounded-xl bg-slate-800 p-3 shadow-lg">
          <p className="mb-1 text-center text-xs text-slate-400">Ủng hộ tác giả</p>
          <img src="/donation/qr.png" alt="QR Donate" className="h-36 w-36" />
          <button
            type="button"
            onClick={() => setShowDonate(false)}
            className="mt-1 w-full rounded bg-slate-700 py-1 text-xs text-slate-300 hover:bg-slate-600"
          >
            Đóng
          </button>
        </div>
      )}
    </>
  );
}
