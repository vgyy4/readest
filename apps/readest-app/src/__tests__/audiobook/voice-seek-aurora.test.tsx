import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WavySlider from '@/components/audiobook/WavySlider';
import AuroraBackground from '@/components/audiobook/AuroraBackground';
import { useEntrance } from '@/components/audiobook/useEntrance';

const frames = new Map<number, (time: number) => void>();
let nextId = 0;
let now = 0;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 48,
    right: 400,
    bottom: 48,
  } as DOMRect);
  frames.clear();
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    frames.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const run = (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((f) => f(now)));
  }
};

describe("Voice's seek bar", () => {
  const setup = (over: Partial<React.ComponentProps<typeof WavySlider>> = {}) => {
    const onCommit = vi.fn();
    const onDrag = vi.fn();
    const view = render(
      <WavySlider
        value={100}
        max={1000}
        playing={false}
        ariaLabel='Seek'
        formatBubble={(v) => `t${Math.round(v)}`}
        onCommit={onCommit}
        onDrag={onDrag}
        {...over}
      />,
    );
    const slider = screen.getByRole('slider');
    // 400 px wide with a 12 px inset each side: the track is 376 px.
    return { ...view, slider, onCommit, onDrag };
  };

  it('has a 5 px by 28 px thumb at rest, and a 48 px touch area', () => {
    const { slider, container } = setup();
    expect(slider.style.height).toBe('48px');
    const thumb = container.querySelector('rect')!;
    expect(thumb.getAttribute('width')).toBe('5');
    expect(thumb.getAttribute('height')).toBe('28');
  });

  it('grows the thumb to 3 x 40 and shows a bubble with the time while dragged', () => {
    const { slider, container, onDrag } = setup();
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 200 });
    expect(onDrag).toHaveBeenLastCalledWith(500);
    run(1500);
    const thumb = container.querySelector('rect')!;
    expect(parseFloat(thumb.getAttribute('width')!)).toBeCloseTo(3, 0);
    expect(parseFloat(thumb.getAttribute('height')!)).toBeCloseTo(40, 0);
    expect(screen.getByText('t500')).toBeTruthy();
  });

  it('jumps only when the finger lifts, and holds the thumb there until playback arrives', () => {
    vi.useFakeTimers();
    const { slider, onCommit, rerender } = setup();
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 388 });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 388 });
    expect(onCommit).toHaveBeenCalledWith(1000);
    // The book has not moved yet: the thumb still shows where it was put.
    expect(slider.getAttribute('aria-valuenow')).toBe('1000');
    // ...and lets go once the book gets there.
    rerender(
      <WavySlider
        value={999}
        max={1000}
        playing={false}
        ariaLabel='Seek'
        formatBubble={String}
        onCommit={onCommit}
      />,
    );
    expect(slider.getAttribute('aria-valuenow')).toBe('999');
  });

  it('gives up waiting after a second and a half', () => {
    vi.useFakeTimers();
    const { slider } = setup();
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 200 });
    expect(slider.getAttribute('aria-valuenow')).toBe('500');
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
  });

  it('waves while playing and goes flat when paused', () => {
    const { container, rerender } = setup({ playing: true });
    run(3000);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('d')).toContain('L');
    expect(new Set(path.getAttribute('d')!.match(/ (\d+\.\d+)(?= L|$)/g)).size).toBeGreaterThan(1);
    rerender(
      <WavySlider
        value={100}
        max={1000}
        playing={false}
        ariaLabel='Seek'
        formatBubble={String}
        onCommit={() => {}}
      />,
    );
    run(6000);
    // A straight line: every point has the same height.
    const flat = container.querySelector('path')!.getAttribute('d')!;
    expect(flat).toMatch(/^M [\d.]+ 24 L [\d.]+ 24$/);
  });

  it('can be moved with the arrow keys', () => {
    const { slider, onCommit } = setup();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenCalledWith(105);
  });
});

describe('AuroraBackground', () => {
  it('draws three blobs when animated, and none on e-ink or in lite mode', () => {
    const { container, rerender } = render(<AuroraBackground playing animate />);
    expect(container.querySelectorAll('[data-aurora-blob]')).toHaveLength(3);
    rerender(<AuroraBackground playing animate={false} />);
    expect(container.querySelectorAll('[data-aurora-blob]')).toHaveLength(0);
  });

  it('drifts while playing and holds still when paused', () => {
    const { container, rerender } = render(<AuroraBackground playing animate />);
    const blob = () =>
      (container.querySelector('[data-aurora-blob]') as HTMLElement).style.transform;
    const first = blob();
    run(2000);
    expect(blob()).not.toBe(first);
    rerender(<AuroraBackground playing={false} animate />);
    const held = blob();
    run(2000);
    expect(blob()).toBe(held);
  });
});

describe('the entrance', () => {
  const Parts = ({ run: go }: { run: boolean }) => {
    const entrance = useEntrance(go);
    return (
      <div>
        <p ref={entrance(0)}>one</p>
        <p ref={entrance(1)}>two</p>
      </div>
    );
  };

  it('starts every part invisible and 40 px low, then brings them in one after another', () => {
    render(<Parts run />);
    const [one, two] = [screen.getByText('one'), screen.getByText('two')];
    expect(one.style.opacity).toBe('0');
    expect(one.style.transform).toMatch(/(39\.9+|40)px/);
    run(160);
    expect(parseFloat(one.style.opacity)).toBeGreaterThan(parseFloat(two.style.opacity));
    run(2000);
    expect(one.style.opacity).toBe('');
    expect(two.style.transform).toBe('');
  });

  it('leaves the parts alone when motion is off', () => {
    render(<Parts run={false} />);
    expect(screen.getByText('one').style.opacity).toBe('');
  });
});
