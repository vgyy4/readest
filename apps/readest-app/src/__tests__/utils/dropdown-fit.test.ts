import { describe, expect, it } from 'vitest';
import { fitVertically } from '@/utils/dropdownFit';

const VIEWPORT = 800;
const PAD = 16;

describe('fitVertically', () => {
  it('leaves a menu that is fully on screen where it is', () => {
    expect(
      fitVertically({ top: 100, bottom: 300 }, { top: 60, bottom: 96 }, VIEWPORT, PAD),
    ).toEqual({ side: null });
  });

  it('turns a menu cut off at the bottom to open above its button', () => {
    // The button is near the bottom; the menu below it runs off the screen.
    const fit = fitVertically({ top: 700, bottom: 950 }, { top: 660, bottom: 696 }, VIEWPORT, PAD);
    expect(fit).toEqual({ side: 'above' });
  });

  it('turns a menu cut off at the top to open below its button', () => {
    const fit = fitVertically({ top: -120, bottom: 80 }, { top: 90, bottom: 126 }, VIEWPORT, PAD);
    expect(fit).toEqual({ side: 'below' });
  });

  it('takes the roomier side and shortens the menu when it fits on neither', () => {
    const fit = fitVertically({ top: 420, bottom: 1100 }, { top: 380, bottom: 416 }, VIEWPORT, PAD);
    // Below has 800 - 16 - 416 - 4 = 364; above has 380 - 16 - 4 = 360: below, capped.
    expect(fit).toEqual({ side: 'below', maxHeight: 364 });
  });

  it('does not shrink a menu below a usable height', () => {
    const fit = fitVertically({ top: 40, bottom: 900 }, { top: 10, bottom: 36 }, 120, PAD);
    expect(fit.maxHeight).toBeGreaterThanOrEqual(96);
  });
});
