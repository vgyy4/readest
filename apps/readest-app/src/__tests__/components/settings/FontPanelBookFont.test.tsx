import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// The Font panel has one field for the font of the book, and a choice between fonts shared by all
// books and fonts of this book alone.

const saveViewSettings = vi.hoisted(() => vi.fn(async () => {}));
const state = vi.hoisted(() => ({
  view: {
    isGlobal: true,
    ownFonts: false,
    overrideFont: false,
    defaultFont: 'Serif',
    defaultCJKFont: 'LXGW WenKai GB Screen',
    serifFont: 'Bitter',
    sansSerifFont: 'Roboto',
    monospaceFont: 'Fira Code',
    defaultFontSize: 16,
    minimumFontSize: 8,
    fontWeight: 400,
  } as Record<string, unknown>,
  global: {
    overrideFont: false,
    defaultFont: 'Sans-serif',
    defaultCJKFont: 'LXGW WenKai GB Screen',
    serifFont: 'Literata',
    sansSerifFont: 'Open Sans',
    monospaceFont: 'PT Mono',
    fontWeight: 400,
  } as Record<string, unknown>,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobileApp: false } }),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => null,
    getViewSettings: () => state.view,
  }),
}));
const settingsStore = vi.hoisted(() => ({
  settings: { globalViewSettings: {} as Record<string, unknown> },
  fontPanelView: 'main-fonts',
  setFontPanelView: () => {},
}));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => settingsStore }));
// Stable values: the panel re-reads the store in effects, so fresh ones each render would loop.
const customFontStore = vi.hoisted(() => ({ fonts: [], getFontFamilies: () => [] as string[] }));
vi.mock('@/store/customFontStore', () => ({ useCustomFontStore: () => customFontStore }));
vi.mock('@/hooks/useResetSettings', () => ({ useResetViewSettings: () => vi.fn() }));
vi.mock('@/hooks/useKeyDownActions', () => ({ useKeyDownActions: vi.fn() }));
vi.mock('@/helpers/settings', () => ({ saveViewSettings }));
vi.mock('@/utils/bridge', () => ({ getSysFontsList: vi.fn(async () => ({ fonts: {} })) }));
vi.mock('@/components/settings/CustomFonts', () => ({ default: () => null }));

import FontPanel from '@/components/settings/FontPanel';

const show = (bookKey = 'book-1') =>
  render(<FontPanel bookKey={bookKey} onRegisterReset={vi.fn()} />);

const savedWith = (key: string) =>
  (saveViewSettings.mock.calls as unknown as unknown[][]).filter((call) => call[2] === key);

beforeEach(() => {
  settingsStore.settings.globalViewSettings = state.global;
  saveViewSettings.mockClear();
  state.view.ownFonts = false;
  state.view.isGlobal = true;
  state.view.defaultFont = 'Serif';
  state.view.serifFont = 'Bitter';
});
afterEach(cleanup);

describe('the Font panel: one field for the font of the book', () => {
  it('shows the font the book is in, whichever style it comes from', () => {
    show();
    expect(screen.getByText('Book Font', { selector: 'span' })).toBeTruthy();
    const field = document.querySelector('[data-setting-id="settings.font.bookFont"]')!;
    expect(field.textContent).toContain('Bitter');
    cleanup();
    state.view.defaultFont = 'Sans-serif';
    show();
    expect(
      document.querySelector('[data-setting-id="settings.font.bookFont"]')!.textContent,
    ).toContain('Roboto');
  });

  it('choosing a serif font sets the style and the serif face together', async () => {
    state.view.defaultFont = 'Sans-serif';
    show();
    const field = document.querySelector('[data-setting-id="settings.font.bookFont"]')!;
    fireEvent.click(field.querySelector(`[aria-label="EB Garamond"]`)!);
    await waitFor(() => expect(savedWith('serifFont').at(-1)?.[3]).toBe('EB Garamond'));
    expect(savedWith('defaultFont').at(-1)?.[3]).toBe('Serif');
  });

  it('describes what every other font field is for', () => {
    show();
    for (const text of [
      'Serif or sans-serif: which of the fonts below the book uses',
      'Used when the Default Font is Serif',
      'Used when the Default Font is Sans-serif',
      'For code and text that needs fixed-width letters',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

describe('fonts for all books, or for this book only', () => {
  const scope = () =>
    document.querySelector(
      '[data-setting-id="settings.font.fontScope"] select',
    ) as HTMLSelectElement;

  it('follows the global fonts by default, and says so', () => {
    show();
    expect(scope().value).toBe('global');
    expect(screen.getByText('All books that do not have their own fonts')).toBeTruthy();
  });

  it('has no such choice outside a book (the global settings from the library)', () => {
    show('');
    expect(document.querySelector('[data-setting-id="settings.font.fontScope"]')).toBeNull();
  });

  it('marks the book as having its own fonts, writing nothing to the global ones', async () => {
    show();
    fireEvent.change(scope(), { target: { value: 'book' } });
    await waitFor(() => expect(savedWith('ownFonts')).toHaveLength(1));
    // skipGlobal: the flag belongs to the book.
    expect(savedWith('ownFonts')[0]!.slice(2)).toEqual(['ownFonts', true, true, false]);
  });

  it('once the book has its own fonts, font changes stay in the book', async () => {
    state.view.ownFonts = true;
    state.view.defaultFont = 'Sans-serif';
    show();
    const field = document.querySelector('[data-setting-id="settings.font.bookFont"]')!;
    fireEvent.click(field.querySelector(`[aria-label="Literata"]`)!);
    await waitFor(() => expect(savedWith('serifFont').at(-1)?.[3]).toBe('Literata'));
    expect(savedWith('serifFont').at(-1)?.[4]).toBe(true);
  });

  it('going back to all books gives the book the global fonts again', async () => {
    state.view.ownFonts = true;
    show();
    expect(scope().value).toBe('book');
    fireEvent.change(scope(), { target: { value: 'global' } });
    await waitFor(() => expect(savedWith('ownFonts')).toHaveLength(1));
    expect(savedWith('ownFonts')[0]!.slice(2)).toEqual(['ownFonts', false, true, false]);
    // Each font setting of the book is set back to the global value.
    expect(savedWith('serifFont').some((c) => c[3] === 'Literata' && c[4] === true)).toBe(true);
    expect(savedWith('sansSerifFont').some((c) => c[3] === 'Open Sans' && c[4] === true)).toBe(
      true,
    );
    expect(savedWith('defaultFont').some((c) => c[3] === 'Sans-serif' && c[4] === true)).toBe(true);
  });

  it('is switched off, with the reason, when Global Settings is off for the book', () => {
    state.view.isGlobal = false;
    show();
    expect(scope().disabled).toBe(true);
    expect(screen.getByText('Global Settings is off: this book has its own settings')).toBeTruthy();
  });
});
