import type { Result } from '../types';
import type { BingoState, BingoMove } from './types';
import { isValidCard } from './setup';

export function validateMove(state: BingoState, playerId: string, move: BingoMove): Result {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, code: 'no_player', message: 'Không tìm thấy người chơi' };

  const maxNumber = state.gridSize * state.gridSize;

  switch (move.type) {
    case 'FillCard':
      if (state.phase !== 'setup')
        return { ok: false, code: 'bad_phase', message: 'Chỉ điền vé ở giai đoạn setup' };
      if (!isValidCard(move.card, state.gridSize))
        return { ok: false, code: 'invalid_card', message: `Vé phải gồm đủ số 1–${maxNumber}, không trùng` };
      return { ok: true };

    case 'SetReady':
      if (state.phase !== 'setup')
        return { ok: false, code: 'bad_phase', message: 'Chỉ sẵn sàng ở giai đoạn setup' };
      if (!isValidCard(player.card, state.gridSize))
        return { ok: false, code: 'card_incomplete', message: 'Phải điền vé hợp lệ trước' };
      return { ok: true };

    case 'CallNumber':
      if (state.phase !== 'playing')
        return { ok: false, code: 'bad_phase', message: 'Chưa tới lượt chơi' };
      if (state.turnOrder[state.currentTurn] !== playerId)
        return { ok: false, code: 'not_your_turn', message: 'Chưa tới lượt bạn' };
      if (!Number.isInteger(move.n) || move.n < 1 || move.n > maxNumber)
        return { ok: false, code: 'bad_number', message: `Số phải trong 1–${maxNumber}` };
      if (state.calledNumbers.includes(move.n))
        return { ok: false, code: 'already_called', message: 'Số này đã được hô' };
      return { ok: true };

    case 'PlaceBomb':
      if (state.phase !== 'playing')
        return { ok: false, code: 'bad_phase', message: 'Chỉ đặt bomb trong lúc chơi' };
      if (player.bombNumber !== null)
        return { ok: false, code: 'already_bombed', message: 'Bạn đã đặt bomb rồi' };
      if (!Number.isInteger(move.n) || move.n < 1 || move.n > maxNumber)
        return { ok: false, code: 'bad_number', message: `Số phải trong 1–${maxNumber}` };
      if (!player.card.includes(move.n))
        return { ok: false, code: 'not_on_card', message: 'Số này không có trên vé của bạn' };
      if (state.calledNumbers.includes(move.n))
        return { ok: false, code: 'already_called', message: 'Số này đã được hô, không thể đặt bomb' };
      return { ok: true };
  }
}
