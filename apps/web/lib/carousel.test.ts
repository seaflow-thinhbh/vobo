import { describe, it, expect } from 'vitest';
import { visibleWindow, ringColor } from './carousel';

describe('visibleWindow', () => {
  it('shows everyone when 3 or fewer players', () => {
    expect(visibleWindow(2, 0)).toEqual([0, 1]);
    expect(visibleWindow(3, 2)).toEqual([0, 1, 2]);
  });
  it('shows a 3-wide window centered on the current player when more than 3', () => {
    expect(visibleWindow(5, 2)).toEqual([1, 2, 3]);
  });
  it('clamps the window at the edges', () => {
    expect(visibleWindow(5, 0)).toEqual([0, 1, 2]);
    expect(visibleWindow(5, 4)).toEqual([2, 3, 4]);
  });
});

describe('ringColor', () => {
  it('is green above half remaining, amber at or below half', () => {
    expect(ringColor(0.8)).toBe('green');
    expect(ringColor(0.5)).toBe('amber');
    expect(ringColor(0.2)).toBe('amber');
  });
});
