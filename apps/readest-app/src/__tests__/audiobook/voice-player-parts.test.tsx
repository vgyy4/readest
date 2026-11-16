import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayButton from '@/components/audiobook/PlayButton';
import SkipButton from '@/components/audiobook/SkipButton';
import PlaybackCover from '@/components/audiobook/PlaybackCover';
import BookProgressBar from '@/components/audiobook/BookProgressBar';
import ChapterSwitcher from '@/components/audiobook/ChapterSwitcher';
import JumpBackPill from '@/components/audiobook/JumpBackPill';
import { burstPolygon, morphPolygon, playPausePieces } from '@/libs/audiobook/shapes';

// Each part follows a number read from the Voice app's source (see the comments in each).

let frames: ((time: number) => void)[] = [];
let now = 0;
beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
// A flight is a tween followed by a spring: the hand-over between them is a promise.
const runAsync = async (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    const pending = frames;
    frames = [];
    await act(async () => pending.forEach((f) => f(now)));
  }
};
const run = (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    const pending = frames;
    frames = [];
    act(() => pending.forEach((f) => f(now)));
  }
};

describe('shapes', () => {
  const count = (polygon: string) => polygon.split(',').length;

  it('the cookie and the square have the same points, so any point between is a shape', () => {
    expect(count(morphPolygon(0))).toBe(count(morphPolygon(1)));
    expect(morphPolygon(0.5)).not.toBe(morphPolygon(0));
    expect(morphPolygon(0.5)).not.toBe(morphPolygon(1));
  });

  it('play turns into pause through the same four corners', () => {
    const [playLeft] = playPausePieces(0);
    const [pauseLeft] = playPausePieces(1);
    expect(playLeft.split(' ')).toHaveLength(4);
    expect(pauseLeft.split(' ')).toHaveLength(4);
    expect(playPausePieces(0.5)[0]).not.toBe(playLeft);
  });

  it('the save burst has many soft lobes', () => {
    expect(burstPolygon().split(',').length).toBeGreaterThan(60);
  });
});

describe('PlayButton', () => {
  const shapeOf = (container: HTMLElement) => container.querySelector('span') as HTMLElement;

  it('is 104 px, and turns a quarter on every tap with the symbol turned back', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PlayButton playing={false} label='Play' onClick={onClick} size={104} />,
    );
    const button = screen.getByLabelText('Play') as HTMLElement;
    expect(button.style.width).toBe('104px');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
    run(2000);
    expect(shapeOf(container).style.transform).toContain('rotate(90deg)');
    const symbol = shapeOf(container).querySelector('span') as HTMLElement;
    expect(symbol.style.transform).toContain('rotate(-90deg)');
  });

  it('shrinks to 86% while pressed and springs back', () => {
    const { container } = render(<PlayButton playing={false} label='Play' onClick={() => {}} />);
    const button = screen.getByLabelText('Play');
    fireEvent.pointerDown(button);
    run(1500);
    expect(shapeOf(container).style.transform).toContain('scale(0.86');
    fireEvent.pointerUp(button);
    run(1500);
    expect(shapeOf(container).style.transform).toContain('scale(1)');
  });

  it('morphs from the cookie to the square when it starts playing', () => {
    const { container, rerender } = render(
      <PlayButton playing={false} label='Play' onClick={() => {}} />,
    );
    const before = shapeOf(container).style.clipPath;
    rerender(<PlayButton playing label='Pause' onClick={() => {}} />);
    run(2000);
    expect(shapeOf(container).style.clipPath).not.toBe(before);
    expect(shapeOf(container).style.clipPath).toBe(morphPolygon(1));
  });

  it('is a plain round button when motion is off', () => {
    const { container } = render(<PlayButton playing flat label='Pause' onClick={() => {}} />);
    expect(shapeOf(container).style.borderRadius).toBe('50%');
    expect(shapeOf(container).style.clipPath).toBe('');
  });
});

describe('SkipButton', () => {
  it('stretches to 1.3x and squares up to 25% while pressed', () => {
    render(<SkipButton forward seconds={20} label='Skip' height={75} animate onClick={() => {}} />);
    const button = screen.getByLabelText('Skip');
    fireEvent.pointerDown(button);
    run(1500);
    expect(parseFloat(button.style.width)).toBeCloseTo(75 * 1.3, 0);
    expect(parseFloat(button.style.borderRadius)).toBeCloseTo(25, 0);
    fireEvent.pointerUp(button);
    run(1500);
    expect(parseFloat(button.style.width)).toBeCloseTo(75, 0);
    expect(parseFloat(button.style.borderRadius)).toBeCloseTo(50, 0);
  });

  it('sends "+20" up when fast-forwarding and "−20" when rewinding, one per tap', () => {
    const { container, rerender } = render(
      <SkipButton forward seconds={20} label='Skip' height={75} animate onClick={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText('Skip'));
    fireEvent.click(screen.getByLabelText('Skip'));
    expect(container.querySelectorAll('.ab-skip-burst')).toHaveLength(2);
    expect(container.querySelector('.ab-skip-burst')?.textContent).toBe('+20');
    rerender(
      <SkipButton
        forward={false}
        seconds={20}
        label='Skip'
        height={75}
        animate
        onClick={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Skip'));
    expect(container.querySelector('.ab-skip-burst:last-of-type')?.textContent).toBe('−20');
  });

  it('sends nothing up when motion is off, and still skips', () => {
    const onClick = vi.fn();
    const { container } = render(
      <SkipButton
        forward
        seconds={20}
        label='Skip'
        height={75}
        animate={false}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByLabelText('Skip'));
    expect(onClick).toHaveBeenCalled();
    expect(container.querySelector('.ab-skip-burst')).toBeNull();
  });
});

describe('PlaybackCover', () => {
  const setup = (over: Partial<React.ComponentProps<typeof PlaybackCover>> = {}) => {
    const props = {
      src: 'cover.png',
      title: 'Book',
      label: 'Cover',
      playing: false,
      chapterIndex: 2,
      swipeable: true,
      animate: true,
      onNext: vi.fn(),
      onPrevious: vi.fn(),
      onToggle: vi.fn(),
      ...over,
    };
    const view = render(<PlaybackCover {...props} />);
    const card = screen.getByLabelText('Cover') as HTMLElement;
    card.getBoundingClientRect = () => ({ width: 300, height: 300 }) as DOMRect;
    (card.parentElement as HTMLElement).getBoundingClientRect = () =>
      ({ width: 300, height: 300 }) as DOMRect;
    return { ...view, props, card };
  };
  const drag = (card: HTMLElement, dx: number) => {
    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 100 });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 150 + dx,
      clientY: 100,
    });
    return () =>
      fireEvent.pointerUp(card, {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 150 + dx,
        clientY: 100,
      });
  };

  it('rests at 86% with 14% corners when paused, and fills out to 8% corners when playing', () => {
    const { card, rerender, props } = setup();
    run(100);
    expect(card.style.transform).toContain('scale(0.86)');
    expect(card.style.borderRadius).toBe('14%');
    rerender(<PlaybackCover {...props} playing />);
    run(3000);
    expect(card.style.transform).toContain('scale(1)');
    expect(parseFloat(card.style.borderRadius)).toBeCloseTo(8, 1);
  });

  it('follows the finger, tilted 12 degrees per cover width and fading to half', () => {
    const { card } = setup();
    drag(card, -150);
    expect(card.style.transform).toContain('translate3d(-150px');
    expect(card.style.transform).toContain('rotate(-6deg)');
    expect(card.style.opacity).toBe('0.75');
  });

  it('goes to the next chapter when pulled left past 28% of its width', async () => {
    const { card, props } = setup();
    const release = drag(card, -100);
    release();
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrevious).not.toHaveBeenCalled();
    // It flies out in 160 ms, then comes in from the other side and settles.
    await runAsync(2500);
    expect(card.style.transform).toContain('translate3d(0px');
  });

  it('goes to the previous chapter when pulled right', () => {
    const { card, props } = setup();
    drag(card, 100)();
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
  });

  it('springs back when let go slowly before 28%', () => {
    const { card, props } = setup();
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(1000);
    const release = drag(card, -60);
    clock.mockReturnValue(2000);
    release();
    clock.mockRestore();
    expect(props.onNext).not.toHaveBeenCalled();
    run(2500);
    expect(card.style.transform).toContain('translate3d(0px');
  });

  it('does not swipe a book with one chapter', () => {
    const { card, props } = setup({ swipeable: false });
    drag(card, -150)();
    expect(props.onNext).not.toHaveBeenCalled();
    expect(card.style.transform).not.toContain('translate3d(-');
  });

  it('plays and pauses on a double tap, not on a single one', () => {
    const { card, props } = setup();
    const tap = () => {
      fireEvent.pointerDown(card, {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 150,
        clientY: 100,
      });
      fireEvent.pointerUp(card, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 100 });
    };
    tap();
    expect(props.onToggle).not.toHaveBeenCalled();
    tap();
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('flies away too when the chapter changes some other way (a button, the list)', async () => {
    const { card, rerender, props } = setup();
    run(100);
    rerender(<PlaybackCover {...props} chapterIndex={3} />);
    await runAsync(80);
    expect(parseFloat(card.style.transform.match(/translate3d\((-?[\d.]+)px/)![1]!)).toBeLessThan(
      0,
    );
    await runAsync(3000);
    expect(card.style.transform).toContain('translate3d(0px');
  });

  // A phone's finger: touch events, which every phone browser sends alike.
  const finger = (card: HTMLElement, from: [number, number], to: [number, number]) => {
    fireEvent.touchStart(card, { touches: [{ clientX: from[0], clientY: from[1] }] });
    const move = fireEvent.touchMove(card, { touches: [{ clientX: to[0], clientY: to[1] }] });
    const end = () =>
      fireEvent.touchEnd(card, {
        touches: [],
        changedTouches: [{ clientX: to[0], clientY: to[1] }],
      });
    return { end, moveWasCancelled: !move };
  };

  it('changes chapter on a swipe of the finger, and keeps the page from scrolling under it', async () => {
    const { card, props } = setup();
    const swipe = finger(card, [250, 100], [100, 104]);
    expect(swipe.moveWasCancelled).toBe(true);
    expect(card.style.transform).toContain('translate3d(-150px');
    swipe.end();
    expect(props.onNext).toHaveBeenCalledTimes(1);
    await runAsync(2500);
    expect(card.style.transform).toContain('translate3d(0px');
  });

  it('goes back on a swipe to the right, and not on a short pull', () => {
    const { card, props } = setup();
    finger(card, [100, 100], [260, 100]).end();
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    finger(card, [100, 100], [140, 100]).end();
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
  });

  it('still takes a swipe that starts a little diagonal', () => {
    const { card, props } = setup();
    fireEvent.touchStart(card, { touches: [{ clientX: 250, clientY: 100 }] });
    // 20 px sideways and 22 down: not clearly vertical, so it is the cover's.
    const first = fireEvent.touchMove(card, { touches: [{ clientX: 230, clientY: 122 }] });
    expect(first).toBe(false);
    fireEvent.touchMove(card, { touches: [{ clientX: 100, clientY: 135 }] });
    fireEvent.touchEnd(card, { touches: [], changedTouches: [{ clientX: 100, clientY: 135 }] });
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('counts a short quick flick as a swipe', () => {
    const { card, props } = setup();
    finger(card, [200, 100], [130, 100]).end();
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('does not strand the cover when it is touched while it flies out', async () => {
    const { card, props } = setup();
    finger(card, [250, 100], [100, 100]).end();
    expect(props.onNext).toHaveBeenCalledTimes(1);
    await runAsync(48);
    // A finger lands on it mid-flight and lifts: nothing changes, and it still comes back.
    fireEvent.touchStart(card, { touches: [{ clientX: 150, clientY: 100 }] });
    fireEvent.touchEnd(card, { touches: [], changedTouches: [{ clientX: 150, clientY: 100 }] });
    await runAsync(2500);
    expect(card.style.transform).toContain('translate3d(0px');
  });

  it('picks the cover up where it is while it settles, without a jump', async () => {
    const { card } = setup();
    finger(card, [250, 100], [100, 100]).end();
    await runAsync(250);
    const x = () => parseFloat(card.style.transform.match(/translate3d\((-?[\d.]+)px/)![1]!);
    const before = x();
    expect(Math.abs(before)).toBeGreaterThan(5);
    fireEvent.touchStart(card, { touches: [{ clientX: 150, clientY: 100 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 160, clientY: 100 }] });
    expect(Math.abs(x() - (before + 10))).toBeLessThan(1);
  });

  it('leaves a vertical swipe alone, for the player to close with', () => {
    const { card, props } = setup();
    const swipe = finger(card, [150, 100], [152, 260]);
    expect(swipe.moveWasCancelled).toBe(false);
    swipe.end();
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onPrevious).not.toHaveBeenCalled();
  });

  it('plays and pauses on a double tap of the finger', () => {
    const { card, props } = setup();
    const tap = () => {
      fireEvent.touchStart(card, { touches: [{ clientX: 150, clientY: 100 }] });
      fireEvent.touchEnd(card, { touches: [], changedTouches: [{ clientX: 150, clientY: 100 }] });
    };
    tap();
    expect(props.onToggle).not.toHaveBeenCalled();
    tap();
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows headphones when there is no cover', () => {
    setup({ src: '' });
    expect(screen.getByLabelText('Cover').querySelector('img')).toBeNull();
  });
});

describe('BookProgressBar', () => {
  const heights = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[style*="flex-grow"]')).map(
      (el) => el.style.height,
    );

  it('draws the chapter that is playing 12 px tall and the others 6', () => {
    const { container } = render(
      <BookProgressBar segments={[1, 1, 1]} current={1} currentFraction={0.5} animate={false} />,
    );
    expect(heights(container)).toEqual(['6px', '12px', '6px']);
  });

  it('fills the chapters before the current one, part of it, and none after', () => {
    const { container } = render(
      <BookProgressBar segments={[1, 1, 1]} current={1} currentFraction={0.5} animate={false} />,
    );
    const widths = Array.from(
      container.querySelectorAll<HTMLElement>('[style*="flex-grow"] > div:last-child'),
    ).map((el) => el.style.width);
    expect(widths).toEqual(['100%', '50%', '0%']);
  });

  it('becomes one thin bar when there are too many chapters to draw', () => {
    const { container } = render(
      <BookProgressBar
        segments={Array(130).fill(1)}
        current={10}
        currentFraction={0}
        animate={false}
      />,
    );
    expect(container.querySelectorAll('[style*="flex-grow"]')).toHaveLength(1);
  });
});

describe('ChapterSwitcher', () => {
  const props = {
    count: 5,
    counterLabel: 'Chapter 2 of 5',
    previousLabel: 'Previous chapter',
    nextLabel: 'Next chapter',
    animate: true,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onOpen: vi.fn(),
  };

  it('slides the old name out to the left and the new one in from the right when going forward', () => {
    const { container, rerender } = render(<ChapterSwitcher {...props} number={2} title='Two' />);
    rerender(<ChapterSwitcher {...props} number={3} title='Three' counterLabel='Chapter 3 of 5' />);
    expect(container.querySelector('.ab-slide-out-forward')?.textContent).toContain('Two');
    expect(container.querySelector('.ab-slide-in-forward')?.textContent).toContain('Three');
  });

  it('slides the other way when going back', () => {
    const { container, rerender } = render(<ChapterSwitcher {...props} number={3} title='Three' />);
    rerender(<ChapterSwitcher {...props} number={2} title='Two' />);
    expect(container.querySelector('.ab-slide-out-back')).toBeTruthy();
    expect(container.querySelector('.ab-slide-in-back')).toBeTruthy();
  });

  it('just changes the name when motion is off', () => {
    const { container, rerender } = render(
      <ChapterSwitcher {...props} animate={false} number={2} title='Two' />,
    );
    rerender(<ChapterSwitcher {...props} animate={false} number={3} title='Three' />);
    expect(container.querySelector('.ab-slide-out-forward')).toBeNull();
    expect(screen.getByText('Three')).toBeTruthy();
  });

  it('cannot go past the first or last chapter', () => {
    const { rerender } = render(<ChapterSwitcher {...props} number={1} title='One' />);
    expect((screen.getByLabelText('Previous chapter') as HTMLButtonElement).disabled).toBe(true);
    rerender(<ChapterSwitcher {...props} number={5} title='Five' />);
    expect((screen.getByLabelText('Next chapter') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('JumpBackPill', () => {
  it('shows a ring that runs down over the ten seconds, starting part way when already running', () => {
    const { container } = render(
      <JumpBackPill
        animate
        onClick={() => {}}
        pill={{ id: 1, text: 'Back to 6:43', visibleMs: 7000 }}
      />,
    );
    const ring = container.querySelector('.ab-ring') as SVGElement;
    expect(ring.style.animationDuration).toBe('10000ms');
    expect(ring.style.animationDelay).toBe('-3000ms');
    expect(screen.getByText('Back to 6:43')).toBeTruthy();
  });

  it('shows nothing when there is nowhere to go back to', () => {
    const { container } = render(<JumpBackPill animate onClick={() => {}} pill={null} />);
    expect(container.firstChild).toBeNull();
  });
});
