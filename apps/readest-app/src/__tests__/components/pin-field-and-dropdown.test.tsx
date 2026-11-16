import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PinInput from '@/components/PinInput';
import { dropdownPlacement } from '@/components/settings/FontDropDown';
import { PIN_MASK_STYLE, pinFieldAttributes } from '@/libs/profiles/pinField';

afterEach(cleanup);

describe('a PIN field is not a password field', () => {
  it('is a numeric text field that names no credential, so a password manager leaves it alone', () => {
    render(<PinInput value='12' onChange={() => {}} ariaLabel='PIN' />);
    const input = screen.getByLabelText('PIN');
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('name')).toBe('pin-code');
    for (const ignore of [
      'data-1p-ignore',
      'data-lpignore',
      'data-bwignore',
      'data-protonpass-ignore',
    ]) {
      expect(input.getAttribute(ignore), ignore).toBe('true');
    }
  });

  it('ignores a "password" hint from a caller', () => {
    render(<PinInput value='' onChange={() => {}} ariaLabel='PIN' autoComplete='new-password' />);
    expect(screen.getByLabelText('PIN').getAttribute('autocomplete')).toBe('off');
  });

  it('shows the visible fields as dots through CSS, not through the field type', () => {
    expect(pinFieldAttributes.type).toBe('text');
    expect((PIN_MASK_STYLE as Record<string, string>)['WebkitTextSecurity']).toBe('disc');
  });
});

describe('where a font list opens', () => {
  const wanted = 320;

  it('opens upward when there is room above', () => {
    expect(dropdownPlacement({ top: 700, bottom: 740 }, 900, wanted)).toEqual({
      side: 'top',
      height: 320,
    });
  });

  it('opens downward, not off the top of the page, when the button is near the top', () => {
    const placed = dropdownPlacement({ top: 90, bottom: 130 }, 900, wanted);
    expect(placed.side).toBe('bottom');
    expect(placed.height).toBe(320);
  });

  it('takes the roomier side, and a shorter list, when neither fits the whole list', () => {
    const placed = dropdownPlacement({ top: 260, bottom: 300 }, 500, wanted);
    expect(placed.side).toBe('top');
    expect(placed.height).toBeLessThan(320);
    expect(placed.height).toBeGreaterThanOrEqual(120);
    const lower = dropdownPlacement({ top: 120, bottom: 160 }, 500, wanted);
    expect(lower.side).toBe('bottom');
  });
});
