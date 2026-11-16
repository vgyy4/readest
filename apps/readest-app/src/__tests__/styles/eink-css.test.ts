import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/globals.css', 'utf8');

describe('e-ink styles', () => {
  it('stops every animation, transition and smooth scroll on an e-ink screen', () => {
    const rule = css.slice(css.indexOf("[data-eink='true'] *,"));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).toContain("[data-eink='true'] *::before");
    expect(block).toContain("[data-eink='true'] *::after");
    expect(block).toContain('animation: none !important');
    expect(block).toContain('transition: none !important');
    expect(block).toContain('scroll-behavior: auto !important');
  });

  it('plays no view transition between pages on e-ink', () => {
    expect(css).toContain("html[data-eink='true']::view-transition-old(*)");
    expect(css).toContain("html[data-eink='true']::view-transition-new(*)");
  });

  it('draws everything in grey when black and white e-ink is on', () => {
    expect(css).toMatch(/html\[data-eink-bw='true'\]\s*\{\s*filter: grayscale\(1\);/);
  });
});
