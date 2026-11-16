interface Box {
  top: number;
  bottom: number;
}

export interface VerticalFit {
  /** Which side of its button the menu belongs on; null when it is already fully on screen. */
  side: 'above' | 'below' | null;
  /** A height to cap the menu at when neither side has room for all of it (it then scrolls). */
  maxHeight?: number;
}

export const MENU_GAP = 4;
const MIN_HEIGHT = 96;

/**
 * Which side of its button a menu goes on so the top or bottom of the screen does not cut it off.
 * A menu that is cut off where it is turns to the other side when it fits there; when it fits on
 * neither, it takes the roomier side, shortened to fit.
 */
export const fitVertically = (
  menu: Box,
  toggle: Box,
  viewportHeight: number,
  padding: number,
): VerticalFit => {
  if (menu.top >= padding && menu.bottom <= viewportHeight - padding) return { side: null };
  const height = menu.bottom - menu.top;
  const below = viewportHeight - padding - toggle.bottom - MENU_GAP;
  const above = toggle.top - padding - MENU_GAP;
  const sitsBelow = menu.top >= toggle.bottom - 1;
  const other = sitsBelow ? 'above' : 'below';
  const otherRoom = sitsBelow ? above : below;
  if (height <= otherRoom) return { side: other };
  const side = above > below ? 'above' : 'below';
  const room = Math.max(MIN_HEIGHT, side === 'above' ? above : below);
  return height <= room ? { side } : { side, maxHeight: room };
};
