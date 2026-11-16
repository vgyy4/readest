import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Dropdown from '@/components/Dropdown';
import { DropdownProvider } from '@/context/DropdownContext';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rect = (top: number, bottom: number, left = 20, right = 220) =>
  ({
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
  }) as DOMRect;

describe('Dropdown placement', () => {
  const open = (button: DOMRect, menu: DOMRect) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('aria-label') === 'Menu') return button;
      if (this.dataset['menu']) {
        // The menu keeps its size; a cap on its height shortens it.
        const capped = parseFloat(this.style.maxHeight || '0');
        const height = capped ? Math.min(capped, menu.bottom - menu.top) : menu.bottom - menu.top;
        const moved = /translate\([^,]+,\s*(-?[\d.]+)px/.exec(this.style.transform);
        const dy = moved ? parseFloat(moved[1]!) : 0;
        return rect(menu.top + dy, menu.top + dy + height);
      }
      return rect(0, 0);
    });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    render(
      <DropdownProvider>
        <Dropdown label='Menu' toggleButton={<span>T</span>} showTooltip={false}>
          <div data-menu='1'>
            <button type='button'>Item</button>
          </div>
        </Dropdown>
      </DropdownProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    return document.querySelector<HTMLElement>('[data-menu]')!;
  };

  it('opens a menu that would run off the bottom above its button instead', () => {
    const menu = open(rect(700, 736), rect(740, 960));
    const match = /translate\([^,]+,\s*(-?[\d.]+)px/.exec(menu.style.transform);
    expect(match).not.toBeNull();
    // Its bottom lands just above the button's top (700 - 4).
    expect(parseFloat(match![1]!) + 960).toBeCloseTo(696, 0);
  });

  it('leaves a menu alone when it fits', () => {
    const menu = open(rect(100, 136), rect(140, 300));
    expect(menu.style.transform).toBe('');
  });
});
