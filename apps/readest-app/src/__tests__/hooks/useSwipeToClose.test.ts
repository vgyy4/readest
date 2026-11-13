import { describe, expect, it } from 'vitest';
import { swipeClosesPanel } from '@/hooks/useSwipeToClose';

describe('swipeClosesPanel', () => {
  it('closes a left drawer on a long swipe to the left, not on a short or vertical one', () => {
    expect(swipeClosesPanel(-120, 10, 'left')).toBe(true);
    expect(swipeClosesPanel(-40, 5, 'left')).toBe(false);
    expect(swipeClosesPanel(-120, 150, 'left')).toBe(false);
    expect(swipeClosesPanel(120, 0, 'left')).toBe(false);
  });

  it('closes a right drawer on a long swipe to the right', () => {
    expect(swipeClosesPanel(120, -10, 'right')).toBe(true);
    expect(swipeClosesPanel(-120, 0, 'right')).toBe(false);
  });
});
