'use client';

import type { RoomSnapshot, Difficulty } from '@/lib/types';
import { Lobby } from './Lobby';
import { CardEditor } from './CardEditor';
import { GameBoard } from './GameBoard';
import { OpponentStrip } from './OpponentStrip';
import { TurnIndicator } from './TurnIndicator';
import { CallPanel } from './CallPanel';
import { FinishedPanel } from './FinishedPanel';

export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
}

export function RoomView({ snapshot, actions }: { snapshot: RoomSnapshot; actions: RoomActions }) {
  const isHost = snapshot.hostId === snapshot.youId;

  if (snapshot.status === 'lobby') {
    return <Lobby snapshot={snapshot} isHost={isHost} onAddBot={actions.addBot} onStart={actions.start} />;
  }

  const view = snapshot.view;
  if (!view) return <p className="text-center text-slate-500">Đang tải…</p>;

  if (snapshot.status === 'setup') {
    if (view.you.ready) {
      return <p className="text-center text-slate-500">Chờ người khác điền vé…</p>;
    }
    return (
      <CardEditor
        onSubmit={async (card) => {
          await actions.fillCard(card);
          await actions.ready();
        }}
      />
    );
  }

  if (snapshot.status === 'finished') {
    return <FinishedPanel snapshot={snapshot} onLeave={actions.leave} />;
  }

  // playing
  const isYourTurn = view.currentPlayerId === snapshot.youId;
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3">
      <OpponentStrip opponents={view.opponents} currentPlayerId={view.currentPlayerId} />
      <GameBoard view={view} />
      <TurnIndicator currentPlayerId={view.currentPlayerId} youId={snapshot.youId} roster={snapshot.roster} />
      <CallPanel calledNumbers={view.calledNumbers} isYourTurn={isYourTurn} onCall={actions.call} />
    </div>
  );
}
