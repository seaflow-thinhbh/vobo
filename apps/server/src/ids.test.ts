import { describe, it, expect } from 'vitest';
import { generatePlayerId, generateToken } from './ids';

describe('ids', () => {
  it('player ids are unique and prefixed', () => {
    const a = generatePlayerId();
    const b = generatePlayerId();
    expect(a).not.toBe(b);
    expect(a.startsWith('p_')).toBe(true);
  });

  it('tokens are long random hex strings, unique per call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
