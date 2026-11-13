import { describe, expect, it } from 'vitest';
import { isProfileBookUpload } from '@/libs/profiles/shared';

const hash = 'a'.repeat(32);

describe('isProfileBookUpload', () => {
  it("accepts a book file, and its cover, under the book's own folder", () => {
    expect(isProfileBookUpload(`Readest/Books/${hash}/${hash}.epub`, hash)).toBe(true);
    expect(isProfileBookUpload(`Readest/Books/${hash}/cover.png`, hash)).toBe(true);
    expect(isProfileBookUpload(`Readest/Books/${hash}/Some Title.m4b`, hash)).toBe(true);
  });

  it("refuses anything else, so a profile cannot write elsewhere in the account's storage", () => {
    expect(isProfileBookUpload(`Readest/Books/${'b'.repeat(32)}/x.epub`, hash)).toBe(false);
    expect(isProfileBookUpload('Readest/Books/../Other/x.epub', hash)).toBe(false);
    expect(isProfileBookUpload(`Readest/Books/${hash}/../../x`, hash)).toBe(false);
    expect(isProfileBookUpload(`Readest/Settings/${hash}/x`, hash)).toBe(false);
    expect(isProfileBookUpload(`${hash}/x.epub`, hash)).toBe(false);
  });

  it('needs a real hash and a file name', () => {
    expect(isProfileBookUpload(`Readest/Books/x/x.epub`, 'x')).toBe(false);
    expect(isProfileBookUpload(undefined, hash)).toBe(false);
    expect(isProfileBookUpload(`Readest/Books/${hash}/a.epub`, undefined)).toBe(false);
  });
});
