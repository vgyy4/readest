import { useEffect, useState } from 'react';

/** The current value of an attribute on <html> (e.g. `data-eink`), kept up to date. */
export const useHtmlAttribute = (name: string): string | null => {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setValue(root.getAttribute(name));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: [name] });
    return () => observer.disconnect();
  }, [name]);
  return value;
};

export const useIsEink = () => useHtmlAttribute('data-eink') === 'true';
