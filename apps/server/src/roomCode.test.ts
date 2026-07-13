import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from './roomCode';

describe('generateRoomCode', () => {
  it('produces a 6-char code from the safe alphabet', () => {
    const code = generateRoomCode(Math.random, () => false);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it('excludes ambiguous characters 0 O 1 I L', () => {
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
  });

  it('retries until it finds an untaken code', () => {
    let calls = 0;
    // First generated code is "taken" once, then free.
    const isTaken = () => calls++ < 1;
    const code = generateRoomCode(Math.random, isTaken);
    expect(code).toHaveLength(6);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
