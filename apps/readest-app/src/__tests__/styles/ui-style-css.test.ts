import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/ui-style.css'), 'utf8');

describe('ui-style.css', () => {
  it('never restyles e-ink mode, and leaves the classic style alone', () => {
    const rules = css
      .split('\n')
      .filter((line) => line.includes("html[data-ui-style='") && !line.includes('{ --'));
    expect(rules.length).toBeGreaterThan(20);
    for (const line of rules) {
      if (
        line.includes("html[data-ui-style='material']") ||
        line.includes("[data-ui-style='glass']")
      ) {
        // The variable blocks (`html[data-ui-style='glass'] {`) are harmless; every real rule
        // is excluded from e-ink.
        if (!line.trim().endsWith('{') || line.includes('.')) {
          expect(line).toContain(":not([data-eink='true'])");
        }
      }
    }
    expect(css).not.toContain("data-ui-style='classic'] .");
  });

  it('uses nothing iOS 15 cannot parse', () => {
    expect(css).not.toContain('color-mix');
    expect(css).not.toContain('@container');
    expect(css).not.toMatch(/\b\d+(dvh|svh|lvh)\b/);
  });

  it('pairs every backdrop-filter with its -webkit- twin', () => {
    const plain = css.match(/(?<!-webkit-)backdrop-filter:/g)?.length ?? 0;
    const prefixed = css.match(/-webkit-backdrop-filter:/g)?.length ?? 0;
    expect(plain).toBeGreaterThan(0);
    expect(prefixed).toBe(plain);
  });

  it('falls back to solid surfaces where backdrop-filter is missing', () => {
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px))');
  });

  it('has a lite mode that removes blur, shadows, filters and transitions', () => {
    expect(css).toContain("html[data-perf='low'] *");
    const lite = css.slice(css.indexOf("html[data-perf='low'] *,"));
    for (const rule of [
      'transition: none !important',
      'box-shadow: none !important',
      'filter: none !important',
    ]) {
      expect(lite).toContain(rule);
    }
    // Spinners keep turning: only decorative animation is removed.
    expect(lite).toContain(":not([class*='animate-spin'])");
  });

  it('styles the profile screens and the audiobook player for e-ink', () => {
    expect(css).toContain("[data-eink='true'] .profile-avatar");
    expect(css).toContain("[data-eink='true'] .audiobook-player");
  });
});
