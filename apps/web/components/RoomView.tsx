'use client';

import { useEffect, useState } from 'react';
import type { RoomSnapshot, Difficulty, ChatMessage, InteractionEvent, InteractionType } from '@/lib/types';
import { Lobby } from './Lobby';
import { CardEditor } from './CardEditor';
import { GameBoard } from './GameBoard';
import { PlayerCarousel } from './PlayerCarousel';
import { ResultCelebration } from './ResultCelebration';
import { ResultOverlay } from './ResultOverlay';
import { TurnReveal } from './TurnReveal';
import { ChatPanel } from './ChatPanel';
import { Leaderboard } from './Leaderboard';
import { InteractionEffect } from './InteractionEffect';
import { InteractionBar } from './InteractionBar';

export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  placeBomb: (n: number) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
  newGame: () => Promise<unknown>;
  kickPlayer: (targetPlayerId: string) => Promise<unknown>;
  readyToReplay: () => Promise<unknown>;
  sendChat: (text: string) => Promise<unknown>;
  sendInteraction: (targetPlayerId: string, type: InteractionType) => Promise<unknown>;
}

export function RoomView({
  snapshot,
  actions,
  messages,
  interactions,
}: {
  snapshot: RoomSnapshot;
  actions: RoomActions;
  messages: ChatMessage[];
  interactions: InteractionEvent[];
}) {
  const isHost = snapshot.hostId === snapshot.youId;
  const gridSize = snapshot.gridSize || 5;

  const [activeEffects, setActiveEffects] = useState<InteractionEvent[]>([]);

  useEffect(() => {
    if (interactions.length === 0) return;
    const latest = interactions[interactions.length - 1];
    if (!latest) return;
    setActiveEffects((prev) => [...prev, latest]);
  }, [interactions]);

  function removeEffect(ev: InteractionEvent) {
    setActiveEffects((prev) => prev.filter((e) => e !== ev));
  }

  const backButton = (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          if (confirm('Bạn có chắc muốn rời phòng?')) await actions.leave();
        }}
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Quay lại
      </button>
      <div className="ml-auto text-xs text-slate-500">{snapshot.code}</div>
    </div>
  );

  const chat = <ChatPanel messages={messages} onSend={actions.sendChat} youId={snapshot.youId} />;

  if (snapshot.status === 'lobby') {
    return (
      <>
        {backButton}
        <Lobby snapshot={snapshot} isHost={isHost} onAddBot={actions.addBot} onStart={actions.start} onKick={actions.kickPlayer} />
        {chat}
      </>
    );
  }

  const view = snapshot.view;
  if (!view) return <p className="text-center text-slate-400">Đang tải…</p>;

  let readyList: { id: string; name: string; ready: boolean }[] | null = null;
  if (snapshot.status === 'setup') {
    const youName = snapshot.roster.find((r) => r.id === snapshot.youId)?.name ?? 'Bạn';
    readyList = [
      { id: view.you.id, name: youName, ready: view.you.ready },
      ...view.opponents.map((o) => ({ id: o.id, name: o.name, ready: o.ready })),
    ];
  }

  const sidebar = (
    <div className="hidden md:block fixed left-4 top-20 z-30 w-44">
      <Leaderboard roster={snapshot.roster} />
      {readyList && (
        <div className="mt-3 rounded border border-slate-600/60 bg-slate-800/95 p-2 text-xs backdrop-blur">
          <div className="mb-1.5 font-semibold text-slate-400">Sẵn sàng</div>
          {readyList.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 py-0.5">
              <span className={p.ready ? 'text-emerald-400' : 'text-slate-600'}>
                {p.ready ? '✓' : '…'}
              </span>
              <span className={p.ready ? 'text-slate-300' : 'text-slate-500'}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const interactionBar = (
    <InteractionBar
      players={snapshot.roster}
      youId={snapshot.youId}
      onSend={(targetId, type) => {
        void actions.sendInteraction(targetId, type);
      }}
    />
  );

  if (snapshot.status === 'setup') {
    if (view.you.ready) {
      return (
        <>
          {backButton}
          {sidebar}
          <p className="text-center text-slate-400">Chờ người khác điền vé…</p>
          {chat}
        </>
      );
    }
    return (
      <>
        {backButton}
        {sidebar}
        <CardEditor
          gridSize={gridSize}
          onSubmit={async (card) => {
            const r = (await actions.fillCard(card)) as { ok?: boolean } | undefined;
            if (r?.ok !== false) await actions.ready();
          }}
        />
        {chat}
      </>
    );
  }

  if (snapshot.status === 'finished') {
    return (
      <>
        {backButton}
        {sidebar}
        <div className="mx-auto max-w-md px-2 pb-16">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <ResultCelebration snapshot={snapshot} />
          <div className="flex justify-center">
            <GameBoard view={view} onPlaceBomb={actions.placeBomb} />
          </div>
          <ResultOverlay snapshot={snapshot} onPlayAgain={actions.readyToReplay} onLeave={actions.leave} />
        </div>
        {chat}
        {activeEffects.map((ev, i) => (
          <InteractionEffect key={`${ev.fromId}-${ev.type}-${i}`} event={ev} youId={snapshot.youId} onDone={() => removeEffect(ev)} />
        ))}
      </>
    );
  }

  return (
    <>
      {backButton}
      {sidebar}
      {snapshot.rolling ? (
        <TurnReveal players={snapshot.roster} firstPlayerId={view.currentPlayerId} />
      ) : (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-2 pb-20">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <GameBoard view={view} isYourTurn={view.currentPlayerId === snapshot.youId} onCall={actions.call} onPlaceBomb={actions.placeBomb} />
        </div>
      )}
      {chat}
      {interactionBar}
      {activeEffects.map((ev, i) => (
        <InteractionEffect key={`${ev.fromId}-${ev.type}-${i}`} event={ev} youId={snapshot.youId} onDone={() => removeEffect(ev)} />
      ))}
    </>
  );
}
