import { useCallback, useLayoutEffect, useRef } from 'react';
import { ENTRANCE_MS, entranceStyle, tween } from '@/libs/audiobook/spring';

/**
 * Voice's entrance: when the player opens, its parts come in one after another (72 ms apart),
 * each fading in and rising from 40 px below with a small overshoot. `ref(index)` goes on a part.
 * One 900 ms timeline drives every part; nothing runs when `run` is false (e-ink, lite mode, or
 * a player that is not on screen), and the parts are left exactly as styled.
 */
export const useEntrance = (run: boolean) => {
  const elements = useRef(new Map<number, HTMLElement>());
  const callbacks = useRef(new Map<number, (el: HTMLElement | null) => void>());

  const ref = useCallback((index: number) => {
    let callback = callbacks.current.get(index);
    if (!callback) {
      callback = (el) => {
        if (el) elements.current.set(index, el);
        else elements.current.delete(index);
      };
      callbacks.current.set(index, callback);
    }
    return callback;
  }, []);

  useLayoutEffect(() => {
    const reset = () => {
      elements.current.forEach((el) => {
        el.style.opacity = '';
        el.style.transform = '';
      });
    };
    if (!run) return;
    const show = (progress: number) =>
      elements.current.forEach((el, index) => {
        const { opacity, translateY } = entranceStyle(progress, index);
        el.style.opacity = String(opacity);
        el.style.transform = `translate3d(0, ${translateY}px, 0)`;
      });
    show(0);
    const timeline = tween(
      ENTRANCE_MS,
      (p) => p,
      (p) => {
        if (p >= 1) reset();
        else show(p);
      },
    );
    return () => {
      timeline.cancel();
      reset();
    };
  }, [run]);

  return ref;
};
