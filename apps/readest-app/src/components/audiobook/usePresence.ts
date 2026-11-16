import { useEffect, useState } from 'react';

/** `true` while `visible` and for `ms` after it turns false, so a leaving element can play its exit. */
export const usePresence = (visible: boolean, ms: number) => {
  const [present, setPresent] = useState(visible);
  useEffect(() => {
    if (visible) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(() => setPresent(false), ms);
    return () => clearTimeout(timer);
  }, [visible, ms]);
  return visible || present;
};
