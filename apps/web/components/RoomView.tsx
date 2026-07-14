'use client';

import type { RoomSnapshot, Difficulty, ChatMessage } from '@/lib/types';
import { Lobby } from './Lobby';
import { CardEditor } from './CardEditor';
import { GameBoard } from './GameBoard';
import { PlayerCarousel } from './PlayerCarousel';
import { ResultCelebration } from './ResultCelebration';
import { ResultOverlay } from './ResultOverlay';
import { TurnReveal } from './TurnReveal';
import { ChatPanel } from './ChatPanel';
import { Leaderboard } from './Leaderboard';

export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
  newGame: () => Promise<unknown>;
  kickPlayer: (targetPlayerId: string) => Promise<unknown>;
  readyToReplay: () => Promise<unknown>;
  sendChat: (text: string) => Promise<unknown>;
}

export function RoomView({
  snapshot,
  actions,
  messages,
}: {
  snapshot: RoomSnapshot;
  actions: RoomActions;
  messages: ChatMessage[];
}) {
  const isHost = snapshot.hostId === snapshot.youId;

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

  if (snapshot.status === 'setup') {
    if (view.you.ready) {
      return (
        <>
          {backButton}
          <p className="text-center text-slate-400">Chờ người khác điền vé…</p>
          {chat}
        </>
      );
    }
    return (
      <>
        {backButton}
        <CardEditor
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
        <div className="mx-auto max-w-2xl">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <ResultCelebration snapshot={snapshot} />
          <Leaderboard roster={snapshot.roster} />
          <div className="flex justify-center">
            <GameBoard view={view} />
          </div>
          <ResultOverlay snapshot={snapshot} onPlayAgain={actions.readyToReplay} onLeave={actions.leave} />
        </div>
        {chat}
      </>
    );
  }

  // playing
  return (
    <>
      {backButton}
      {snapshot.rolling ? (
        <TurnReveal players={snapshot.roster} firstPlayerId={view.currentPlayerId} />
      ) : (
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <GameBoard view={view} isYourTurn={view.currentPlayerId === snapshot.youId} onCall={actions.call} />
        </div>
      )}
      {chat}
    </>
  );
}
