'use client';

import type { RoomSnapshot, Difficulty } from '@/lib/types';
import { Lobby } from './Lobby';
import { CardEditor } from './CardEditor';
import { GameBoard } from './GameBoard';
import { PlayerCarousel } from './PlayerCarousel';
import { ResultOverlay } from './ResultOverlay';
import { TurnReveal } from './TurnReveal';

export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
  newGame: () => Promise<unknown>;
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
          const r = (await actions.fillCard(card)) as { ok?: boolean } | undefined;
          if (r?.ok !== false) await actions.ready();
        }}
      />
    );
  }

  if (snapshot.status === 'finished') {
    return (
      <div className="relative mx-auto max-w-md">
        <div className="pointer-events-none opacity-40">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <GameBoard view={view} />
        </div>
        <ResultOverlay snapshot={snapshot} onPlayAgain={actions.newGame} onLeave={actions.leave} />
      </div>
    );
  }

  // playing
  if (snapshot.rolling) {
    return <TurnReveal players={snapshot.roster} firstPlayerId={view.currentPlayerId} />;
  }
  const isYourTurn = view.currentPlayerId === snapshot.youId;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      <PlayerCarousel
        players={snapshot.roster}
        currentPlayerId={view.currentPlayerId}
        youId={snapshot.youId}
        turnStartedAt={snapshot.turnStartedAt}
        turnEndsAt={snapshot.turnEndsAt}
      />
      <GameBoard view={view} isYourTurn={isYourTurn} onCall={actions.call} />
    </div>
  );
}
