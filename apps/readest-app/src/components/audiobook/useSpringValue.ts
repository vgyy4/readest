import { useEffect, useRef } from 'react';
import { Spring, type SpringSpec } from '@/libs/audiobook/spring';

/**
 * One spring-driven number whose every step is handed to `apply`, which writes it straight to
 * the element (no React render per frame). The spring stays the same between renders.
 */
export const useSpringValue = (
  initial: number,
  spec: SpringSpec,
  apply: (value: number) => void,
): Spring => {
  const latest = useRef(apply);
  latest.current = apply;
  const holder = useRef<Spring | null>(null);
  if (!holder.current) holder.current = new Spring(initial, spec, (v) => latest.current(v));
  useEffect(() => {
    const instance = holder.current!;
    // The initial value is applied once the element exists.
    instance.snap(instance.value);
    return () => instance.stop();
  }, []);
  return holder.current;
};

/** Move `spring` to `target` with its spring, or jump there when motion is off. */
export const moveTo = (spring: Spring, target: number, animate: boolean, spec?: SpringSpec) =>
  animate ? spring.to(target, spec) : spring.snap(target);
