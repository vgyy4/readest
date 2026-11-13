/**
 * The look of the whole app: the original Readest look, the Voice look (Material 3
 * Expressive: big rounded shapes, tonal surfaces, pill buttons), or the same Voice
 * layout in liquid glass (frosted translucent surfaces). The choice is per device.
 */
export type UiStyle = 'classic' | 'material' | 'glass';

export const UI_STYLE_KEY = 'readest-ui-style';
export const DEFAULT_UI_STYLE: UiStyle = 'material';
export const UI_STYLES: readonly UiStyle[] = ['material', 'glass', 'classic'];

export const UI_STYLE_CHANGE_EVENT = 'readest-ui-style-change';

export const isUiStyle = (value: unknown): value is UiStyle =>
  value === 'classic' || value === 'material' || value === 'glass';

export const getUiStyle = (): UiStyle => {
  try {
    const stored = localStorage.getItem(UI_STYLE_KEY);
    return isUiStyle(stored) ? stored : DEFAULT_UI_STYLE;
  } catch {
    return DEFAULT_UI_STYLE;
  }
};

/** Put the style on <html> so the stylesheet can pick it up. */
export const applyUiStyle = (style: UiStyle) => {
  document.documentElement.setAttribute('data-ui-style', style);
};

export const setUiStyle = (style: UiStyle) => {
  try {
    localStorage.setItem(UI_STYLE_KEY, style);
  } catch {
    // Private mode: the style still applies until the app closes.
  }
  applyUiStyle(style);
  window.dispatchEvent(new CustomEvent(UI_STYLE_CHANGE_EVENT, { detail: style }));
};

/** The next style in the cycle material, glass, classic. */
export const nextUiStyle = (style: UiStyle): UiStyle =>
  UI_STYLES[(UI_STYLES.indexOf(style) + 1) % UI_STYLES.length]!;

/** Runs before the app paints, so there is no flash of the wrong style. */
export const UI_STYLE_BOOT_SCRIPT = `try{var s=localStorage.getItem('${UI_STYLE_KEY}');if(s!=='classic'&&s!=='glass'&&s!=='material')s='${DEFAULT_UI_STYLE}';document.documentElement.setAttribute('data-ui-style',s)}catch(e){document.documentElement.setAttribute('data-ui-style','${DEFAULT_UI_STYLE}')}`;

/** The style's name for a menu; `_` is the app's translation function. */
export const uiStyleLabel = (_: (key: string) => string, style: UiStyle) =>
  style === 'glass' ? _('Liquid glass') : style === 'classic' ? _('Classic') : _('Material');
