import { afterEach, describe, expect, it } from 'vitest';
import {
  applyUiStyle,
  DEFAULT_UI_STYLE,
  getUiStyle,
  isLiteActive,
  isLowEndDevice,
  nextPerfMode,
  getPerfMode,
  setPerfMode,
  PERF_KEY,
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

  it('flags old iPads and small devices as low-end', () => {
    const ipadAir2 =
      'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    const newIpad =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    expect(isLowEndDevice(ipadAir2, 3, undefined)).toBe(true);
    expect(isLowEndDevice(newIpad, 6, undefined)).toBe(false);
    expect(isLowEndDevice('Mozilla/5.0 (Linux; Android 12)', 2, undefined)).toBe(true);
    expect(isLowEndDevice('Mozilla/5.0 (Linux; Android 14)', 8, 2)).toBe(true);
    expect(isLowEndDevice('Mozilla/5.0 (Linux; Android 14)', 8, 8)).toBe(false);
  });

  it('the boot script sets data-perf for an old iPad only', () => {
    const run = (ua: string) => {
      document.documentElement.removeAttribute('data-perf');
      Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
      new Function(UI_STYLE_BOOT_SCRIPT)();
      return document.documentElement.getAttribute('data-perf');
    };
    expect(run('Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) Mobile/15E148')).toBe('low');
    expect(run('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Mobile/15E148')).toBeNull();
  });

  it('lite mode follows the device unless forced on or off', () => {
    const ipadAir2 = 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) Mobile/15E148';
    expect(isLiteActive('auto', ipadAir2)).toBe(true);
    expect(isLiteActive('off', ipadAir2)).toBe(false);
    expect(isLiteActive('on', 'Mozilla/5.0 (Linux; Android 14)', 8, 8)).toBe(true);
    expect(isLiteActive('auto', 'Mozilla/5.0 (Linux; Android 14)', 8, 8)).toBe(false);
  });

  it('stores the lite mode, applies it, and cycles auto, on, off', () => {
    expect(getPerfMode()).toBe('auto');
    setPerfMode('on');
    expect(getPerfMode()).toBe('on');
    expect(document.documentElement.getAttribute('data-perf')).toBe('low');
    setPerfMode('off');
    expect(document.documentElement.hasAttribute('data-perf')).toBe(false);
    expect(nextPerfMode('auto')).toBe('on');
    expect(nextPerfMode('on')).toBe('off');
    expect(nextPerfMode('off')).toBe('auto');
  });

  it('the boot script honours a forced lite mode, either way', () => {
    const run = (mode: string) => {
      localStorage.setItem(PERF_KEY, mode);
      document.documentElement.removeAttribute('data-perf');
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) Mobile/15E148',
        configurable: true,
      });
      new Function(UI_STYLE_BOOT_SCRIPT)();
      return document.documentElement.getAttribute('data-perf');
    };
    expect(run('off')).toBeNull(); // an old iPad, but the user turned lite mode off
    expect(run('auto')).toBe('low');
    expect(run('on')).toBe('low');
  });
});
