import { afterEach, describe, expect, it } from 'vitest';
import {
  applyUiStyle,
  DEFAULT_UI_STYLE,
  getUiStyle,
  isUiStyle,
  nextUiStyle,
  setUiStyle,
  UI_STYLE_BOOT_SCRIPT,
  UI_STYLE_KEY,
} from '@/libs/uiStyle';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-ui-style');
});

describe('ui style', () => {
  it('defaults to the Voice (material) style', () => {
    expect(DEFAULT_UI_STYLE).toBe('material');
    expect(getUiStyle()).toBe('material');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(UI_STYLE_KEY, 'neon');
    expect(getUiStyle()).toBe('material');
    expect(isUiStyle('neon')).toBe(false);
  });

  it('stores the style and puts it on <html>', () => {
    setUiStyle('glass');
    expect(getUiStyle()).toBe('glass');
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('glass');
    applyUiStyle('classic');
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('classic');
  });

  it('cycles material, glass, classic', () => {
    expect(nextUiStyle('material')).toBe('glass');
    expect(nextUiStyle('glass')).toBe('classic');
    expect(nextUiStyle('classic')).toBe('material');
  });

  it('the boot script sets the stored style before React runs', () => {
    localStorage.setItem(UI_STYLE_KEY, 'glass');
    new Function(UI_STYLE_BOOT_SCRIPT)();
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('glass');
    localStorage.clear();
    new Function(UI_STYLE_BOOT_SCRIPT)();
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('material');
  });
});
