import { describe, it, expect, vi } from 'vitest';
import { prefersReducedMotion } from './motion';

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia is unavailable (jsdom default)', () => {
    expect(prefersReducedMotion()).toBe(true);
  });

  it('reflects the media query result when matchMedia exists', () => {
    const original = window.matchMedia;

    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);

    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);

    window.matchMedia = original;
  });
});
