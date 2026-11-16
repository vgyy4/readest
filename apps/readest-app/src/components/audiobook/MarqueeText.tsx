import React, { useLayoutEffect, useRef, useState } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  /** Scroll a title that does not fit. Off, it is cut with an ellipsis. */
  animate: boolean;
}

/** One line of text; when it is too long it slides to the end and back instead of being cut off. */
const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className, animate }) => {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    setOverflow(Math.max(0, Math.ceil(content.scrollWidth - box.clientWidth)));
  }, [text]);

  const scrolls = animate && overflow > 2;
  return (
    <span ref={outer} className={`block overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      <span
        ref={inner}
        className={scrolls ? 'ab-marquee inline-block' : 'block truncate'}
        style={
          scrolls
            ? ({
                '--ab-marquee-d': `-${overflow + 8}px`,
                animationDuration: `${Math.max(4, (overflow + 8) / 28 + 3)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
};

export default MarqueeText;
