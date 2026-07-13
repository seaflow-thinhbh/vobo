'use client';

export function CallPanel({
  calledNumbers,
  isYourTurn,
  onCall,
}: {
  calledNumbers: number[];
  isYourTurn: boolean;
  onCall: (n: number) => void;
}) {
  const called = new Set(calledNumbers);
  return (
    <div>
      <p className="mb-1 text-center text-xs text-slate-500">
        {isYourTurn ? 'Chọn số để hô:' : 'Chờ tới lượt bạn…'}
      </p>
      <div className="flex flex-wrap justify-center gap-1">
        {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => {
          const done = called.has(n);
          return (
            <button
              key={n}
              type="button"
              disabled={!isYourTurn || done}
              onClick={() => onCall(n)}
              className={`h-9 w-9 rounded border text-sm font-semibold disabled:opacity-40 ${
                done ? 'border-slate-200 text-slate-300 line-through' : 'border-sky-500 text-sky-700'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
