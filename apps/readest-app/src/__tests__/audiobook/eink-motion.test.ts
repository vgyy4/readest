import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fastOutSlowIn,
  motionOff,
  Spring,
  spring,
  STIFFNESS,
  tween,
} from '@/libs/audiobook/spring';

const eink = (on: boolean) => document.documentElement.setAttribute('data-eink', String(on));

afterEach(() => {
  document.documentElement.removeAttribute('data-eink');
  vi.unstubAllGlobals();
});

describe('no motion on e-ink', () => {
  it('knows when the screen is e-ink', () => {
    expect(motionOff()).toBe(false);
    eink(true);
    expect(motionOff()).toBe(true);
    eink(false);
    expect(motionOff()).toBe(false);
  });

  it('a spring arrives at its target at once, without asking for a single frame', () => {
    const frame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', frame);
    eink(true);
    const seen: number[] = [];
    const value = new Spring(0, spring(STIFFNESS.Low), (v) => seen.push(v));
    value.to(10);
    expect(value.value).toBe(10);
    expect(seen.at(-1)).toBe(10);
    expect(frame).not.toHaveBeenCalled();
  });

  it('a tween jumps to its end and is done, without a frame', async () => {
    const frame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', frame);
    eink(true);
    const seen: number[] = [];
    const run = tween(300, fastOutSlowIn, (p) => seen.push(p));
    await run.done;
    expect(seen).toEqual([1]);
    expect(frame).not.toHaveBeenCalled();
  });

  it('on a colour screen they still move', () => {
    const frame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', frame);
    const value = new Spring(0, spring(STIFFNESS.Low), () => {});
    value.to(10);
    expect(frame).toHaveBeenCalled();
    expect(value.value).toBe(0);
  });
});
