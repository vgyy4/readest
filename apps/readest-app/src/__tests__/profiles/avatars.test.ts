import { describe, expect, it } from 'vitest';
import { AVATARS, avatarSrc, isAvatarId } from '@/libs/profiles/avatars';

describe('stock avatars', () => {
  it('offers plenty of pictures with unique, well-formed ids', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(40);
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isAvatarId(id)).toBe(true);
  });

  it('draws every picture as valid SVG, with no scripts or external references', () => {
    for (const { id, svg } of AVATARS) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror'), id).toBeNull();
      expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(svg).not.toMatch(/<script|href=|javascript:|on\w+=/i);
    }
  });

  it('turns an id into an image source, and nothing else', () => {
    expect(avatarSrc('av-01')).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/);
    expect(avatarSrc('av-99')).toBeNull();
    expect(avatarSrc(null)).toBeNull();
    expect(avatarSrc(undefined)).toBeNull();
  });

  it('only accepts ids of the stock format', () => {
    expect(isAvatarId('av-07')).toBe(true);
    for (const bad of ['av-7', 'avatar', '../x', '', null, 3, 'av-07x']) {
      expect(isAvatarId(bad)).toBe(false);
    }
  });
});
