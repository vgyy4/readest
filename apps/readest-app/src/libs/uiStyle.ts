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

/**
 * Old iPads and phones (iOS 15 and older, or 2 cores / 2 GB) get `data-perf="low"` ("lite"):
 * no blur, shadows, transitions or decorative animation, which their GPUs cannot keep up with.
 */
export const isLowEndDevice = (userAgent: string, cores?: number, memoryGb?: number) => {
  const ios = /OS (\d+)[_.]\d/.exec(userAgent);
  if (/iPad|iPhone|iPod/.test(userAgent) && ios && Number(ios[1]) < 16) return true;
  return (cores !== undefined && cores <= 2) || (memoryGb !== undefined && memoryGb <= 2);
};

/** Lite mode: follow the device (auto), or force it on or off from the menu. */
export type PerfMode = 'auto' | 'on' | 'off';
export const PERF_KEY = 'readest-ui-perf';
export const PERF_MODES: readonly PerfMode[] = ['auto', 'on', 'off'];
export const PERF_CHANGE_EVENT = 'readest-ui-perf-change';

export const isPerfMode = (value: unknown): value is PerfMode =>
  value === 'auto' || value === 'on' || value === 'off';

export const getPerfMode = (): PerfMode => {
  try {
    const stored = localStorage.getItem(PERF_KEY);
    return isPerfMode(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
};

export const isLiteActive = (
  mode: PerfMode,
  userAgent: string,
  cores?: number,
  memoryGb?: number,
) => mode === 'on' || (mode === 'auto' && isLowEndDevice(userAgent, cores, memoryGb));

export const applyPerfMode = (mode: PerfMode = getPerfMode()) => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lite = isLiteActive(mode, nav.userAgent, nav.hardwareConcurrency, nav.deviceMemory);
  if (lite) document.documentElement.setAttribute('data-perf', 'low');
  else document.documentElement.removeAttribute('data-perf');
};

export const setPerfMode = (mode: PerfMode) => {
  try {
    localStorage.setItem(PERF_KEY, mode);
  } catch {
    // Private mode: applies until the app closes.
  }
  applyPerfMode(mode);
  window.dispatchEvent(new CustomEvent(PERF_CHANGE_EVENT, { detail: mode }));
};

export const nextPerfMode = (mode: PerfMode): PerfMode =>
  PERF_MODES[(PERF_MODES.indexOf(mode) + 1) % PERF_MODES.length]!;

/** Runs before the app paints, so there is no flash of the wrong style. */
export const UI_STYLE_BOOT_SCRIPT = `try{var d=document.documentElement,s=localStorage.getItem('${UI_STYLE_KEY}');if(s!=='classic'&&s!=='glass'&&s!=='material')s='${DEFAULT_UI_STYLE}';d.setAttribute('data-ui-style',s);var p=localStorage.getItem('${PERF_KEY}'),n=navigator,m=/OS (\\d+)[_.]\\d/.exec(n.userAgent),low=p==='on'||(p!=='off'&&((/iPad|iPhone|iPod/.test(n.userAgent)&&m&&+m[1]<16)||(n.hardwareConcurrency&&n.hardwareConcurrency<=2)||(n.deviceMemory&&n.deviceMemory<=2)));if(low)d.setAttribute('data-perf','low')}catch(e){document.documentElement.setAttribute('data-ui-style','${DEFAULT_UI_STYLE}')}`;

/** The style's name for a menu; `_` is the app's translation function. */
export const uiStyleLabel = (_: (key: string) => string, style: UiStyle) =>
  style === 'glass' ? _('Liquid glass') : style === 'classic' ? _('Classic') : _('Material');

/** The mode's name for a menu; `_` is the app's translation function. */
export const perfModeLabel = (_: (key: string) => string, mode: PerfMode) =>
  mode === 'on' ? _('On') : mode === 'off' ? _('Off') : _('Auto');
