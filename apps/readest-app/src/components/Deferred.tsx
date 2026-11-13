import React, { useEffect, useState } from 'react';

/**
 * Mount `children` a moment after the first paint instead of with it. Used with lazily loaded
 * components that are not needed to start (dialogs, overlays): the app becomes usable first and
 * their code is fetched and run in idle time, which matters on old tablets where running a
 * megabyte of JavaScript at launch takes seconds.
 */
const Deferred: React.FC<{ children: React.ReactNode; timeout?: number }> = ({
  children,
  timeout = 1500,
}) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout });
      return () => w.cancelIdleCallback?.(id);
    }
    // Safari has no requestIdleCallback: a short timer after the first paint does the job.
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, [timeout]);
  return ready ? <>{children}</> : null;
};

export default Deferred;
