import { describe, expect, it } from 'vitest';
import {
  isProfileBookUpload,
  isProfileReplicaUpload,
  profileMayDownload,
} from '@/libs/profiles/shared';

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

describe('isProfileReplicaUpload', () => {
  const id = 'f'.repeat(32);

  it('accepts a font file under its own replica folder', () => {
    expect(isProfileReplicaUpload(`Readest/Replicas/font/${id}/Lora.ttf`, 'font', id)).toBe(true);
  });

  it('refuses other kinds, other folders and ways out of the folder', () => {
    expect(
      isProfileReplicaUpload(`Readest/Replicas/dictionary/${id}/a.mdx`, 'dictionary', id),
    ).toBe(false);
    expect(isProfileReplicaUpload(`Readest/Replicas/font/${id}/../x.ttf`, 'font', id)).toBe(false);
    expect(isProfileReplicaUpload(`Readest/Books/${id}/Lora.ttf`, 'font', id)).toBe(false);
    expect(isProfileReplicaUpload(`Readest/Replicas/font/other/Lora.ttf`, 'font', id)).toBe(false);
    expect(isProfileReplicaUpload(`Readest/Replicas/font/${id}/`, 'font', id)).toBe(false);
    expect(isProfileReplicaUpload(undefined, 'font', id)).toBe(false);
    expect(isProfileReplicaUpload(`Readest/Replicas/font/a/b.ttf`, 'font', '../a')).toBe(false);
  });
});

describe('profileMayDownload', () => {
  const granted = new Set(['g1']);

  it('lets a profile download the books it has been granted, not others', () => {
    expect(profileMayDownload({ book_hash: 'g1' }, granted)).toBe(true);
    expect(profileMayDownload({ book_hash: 'g2' }, granted)).toBe(false);
  });

  it("lets a profile download the account's fonts, but not other replica files or stray files", () => {
    expect(profileMayDownload({ replica_kind: 'font' }, granted)).toBe(true);
    expect(profileMayDownload({ replica_kind: 'dictionary' }, granted)).toBe(false);
    expect(profileMayDownload({}, granted)).toBe(false);
  });
});
