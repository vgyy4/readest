import { describe, expect, it } from 'vitest';
import {
  audioPartsOf,
  extraPartFilename,
  groupAudioFolders,
  holdUnsettledFolders,
  locatePart,
  naturalCompare,
  parsePartLocation,
  partLocation,
  orderFolderFiles,
  partChapters,
  partStart,
  pickFolderCover,
  totalDuration,
} from '@/libs/audiobook/folder';
import type { AudioPart } from '@/libs/document';

const f = (path: string) => ({ path });

describe('groupAudioFolders', () => {
  it('makes one book of a folder with several audio files, leaving the rest alone', () => {
    const files = [
      f('/lib/Return/Book V - Chapter 01.mp3'),
      f('/lib/Return/Book V - Chapter 02.mp3'),
      f('/lib/Return/cover.jpg'),
      f('/lib/Other/Single.m4b'),
      f('/lib/epub/Dune.epub'),
    ];
    const { singles, folders } = groupAudioFolders(files);
    expect(folders).toHaveLength(1);
    expect(folders[0]!.dir).toBe('/lib/Return');
    expect(folders[0]!.files.map((x) => x.path)).toEqual([
      '/lib/Return/Book V - Chapter 01.mp3',
      '/lib/Return/Book V - Chapter 02.mp3',
    ]);
    expect(singles.map((x) => x.path)).toEqual([
      '/lib/Return/cover.jpg',
      '/lib/Other/Single.m4b',
      '/lib/epub/Dune.epub',
    ]);
  });

  it('keeps a lone audio file in a folder an ordinary book', () => {
    const { folders, singles } = groupAudioFolders([f('/a/book.m4b')]);
    expect(folders).toEqual([]);
    expect(singles).toHaveLength(1);
  });

  it('keeps sibling folders apart, and understands Windows paths', () => {
    const { folders } = groupAudioFolders([
      f('C:\\Books\\One\\1.mp3'),
      f('C:\\Books\\One\\2.mp3'),
      f('C:\\Books\\Two\\1.mp3'),
      f('C:\\Books\\Two\\2.mp3'),
      f('C:\\Books\\Two\\3.mp3'),
    ]);
    expect(folders.map((x) => [x.dir, x.files.length])).toEqual([
      ['C:/Books/One', 2],
      ['C:/Books/Two', 3],
    ]);
  });

  it('keeps a folder of m4b files as separate books: each m4b is normally a whole audiobook', () => {
    const { folders, singles } = groupAudioFolders([f('/lib/a/One.m4b'), f('/lib/a/Two.m4b')]);
    expect(folders).toEqual([]);
    expect(singles).toHaveLength(2);
    // but m4b next to other audio is one book
    expect(groupAudioFolders([f('/lib/a/1.m4b'), f('/lib/a/2.mp3')]).folders).toHaveLength(1);
  });

  it('ignores items without a path (web files)', () => {
    const { singles, folders } = groupAudioFolders([{}, f('/a/1.mp3'), f('/a/2.mp3')]);
    expect(folders).toHaveLength(1);
    expect(singles).toHaveLength(1);
  });
});

describe('orderFolderFiles', () => {
  it('reads numbers as numbers in file names', () => {
    const order = orderFolderFiles([
      f('/b/Chapter 10.mp3'),
      f('/b/Chapter 2.mp3'),
      f('/b/Chapter 1.mp3'),
    ]);
    expect(order.map((x) => x.path.split('/').pop())).toEqual([
      'Chapter 1.mp3',
      'Chapter 2.mp3',
      'Chapter 10.mp3',
    ]);
    expect(naturalCompare('a2', 'a10')).toBeLessThan(0);
  });

  it('follows track numbers when every file has one, whatever the names say', () => {
    const order = orderFolderFiles([
      { path: '/b/Appendix.mp3', track: 3 },
      { path: '/b/Prologue.mp3', track: 1 },
      { path: '/b/Book V.mp3', track: 2 },
    ]);
    expect(order.map((x) => x.track)).toEqual([1, 2, 3]);
  });

  it('puts disc 2 after disc 1', () => {
    const order = orderFolderFiles([
      { path: '/b/a.mp3', disc: 2, track: 1 },
      { path: '/b/b.mp3', disc: 1, track: 2 },
      { path: '/b/c.mp3', disc: 1, track: 1 },
    ]);
    expect(order.map((x) => x.path)).toEqual(['/b/c.mp3', '/b/b.mp3', '/b/a.mp3']);
  });

  it('falls back to file names when track numbers are missing or repeated', () => {
    const missing = orderFolderFiles([{ path: '/b/b.mp3', track: 1 }, { path: '/b/a.mp3' }]);
    expect(missing.map((x) => x.path)).toEqual(['/b/a.mp3', '/b/b.mp3']);
    const repeated = orderFolderFiles([
      { path: '/b/b.mp3', track: 1 },
      { path: '/b/a.mp3', track: 1 },
    ]);
    expect(repeated.map((x) => x.path)).toEqual(['/b/a.mp3', '/b/b.mp3']);
  });

  it('sorts subfolders (CD1, CD2) in order', () => {
    const order = orderFolderFiles([f('/b/CD2/01.mp3'), f('/b/CD1/02.mp3'), f('/b/CD1/01.mp3')]);
    expect(order.map((x) => x.path)).toEqual(['/b/CD1/01.mp3', '/b/CD1/02.mp3', '/b/CD2/01.mp3']);
  });
});

describe('pickFolderCover', () => {
  it('prefers the usual cover names, then one named like the folder, then any picture', () => {
    expect(pickFolderCover(['/x/a.jpg', '/x/Cover.png'], 'Book')).toBe('/x/Cover.png');
    expect(
      pickFolderCover(['/x/a.jpg', '/x/The Return of the King.jpg'], 'The Return of the King'),
    ).toBe('/x/The Return of the King.jpg');
    expect(pickFolderCover(['/x/b.jpg', '/x/a.jpg'], 'Book')).toBe('/x/a.jpg');
    expect(pickFolderCover(['/x/notes.txt'], 'Book')).toBeUndefined();
    expect(pickFolderCover([], 'Book')).toBeUndefined();
  });
});

describe('parts of a book', () => {
  const parts: AudioPart[] = [
    { title: 'One', ext: 'mp3', size: 1, duration: 100 },
    { title: 'Two', ext: 'mp3', size: 1, duration: 50 },
    { title: '', ext: 'mp3', size: 1, duration: 25 },
  ];

  it('knows the total, where each part starts, and which part a position is in', () => {
    expect(totalDuration(parts)).toBe(175);
    expect(partStart(parts, 0)).toBe(0);
    expect(partStart(parts, 2)).toBe(150);
    expect(locatePart(parts, 0)).toEqual({ index: 0, offset: 0 });
    expect(locatePart(parts, 99.5)).toEqual({ index: 0, offset: 99.5 });
    expect(locatePart(parts, 100)).toEqual({ index: 1, offset: 0 });
    expect(locatePart(parts, 160)).toEqual({ index: 2, offset: 10 });
    expect(locatePart(parts, 9999)).toEqual({ index: 2, offset: 25 });
    expect(locatePart(parts, -5)).toEqual({ index: 0, offset: 0 });
  });

  it('turns each part into a chapter', () => {
    expect(partChapters(parts)).toEqual([
      { title: 'One', start: 0, end: 100 },
      { title: 'Two', start: 100, end: 150 },
      { title: 'Chapter 3', start: 150, end: 175 },
    ]);
  });

  it('only a book with two or more parts is a folder book', () => {
    expect(audioPartsOf({ metadata: undefined })).toEqual([]);
    expect(audioPartsOf({ metadata: { title: 't', author: 'a', language: 'en' } })).toEqual([]);
    expect(
      audioPartsOf({
        metadata: { title: 't', author: 'a', language: 'en', audioParts: [parts[0]!] },
      }),
    ).toEqual([]);
    expect(
      audioPartsOf({ metadata: { title: 't', author: 'a', language: 'en', audioParts: parts } }),
    ).toHaveLength(3);
  });

  it('keeps later parts beside the book file, numbered from 2', () => {
    expect(extraPartFilename('abc', 1, 'mp3')).toBe('abc/part-0002.mp3');
    expect(extraPartFilename('abc', 11, 'm4a')).toBe('abc/part-0012.m4a');
  });
});

import { audiobookInfoFrom } from '@/libs/audiobook/metadata';

describe('audiobookInfoFrom', () => {
  it('keeps the album, the track title, and the track and disc numbers', () => {
    const info = audiobookInfoFrom(
      {
        album: ' The Return of the King ',
        title: 'Book V - Chapter 01 - Minas Tirith',
        artist: 'Rob Inglis',
        albumartist: 'J.R.R. Tolkien',
        track: { no: 4, of: 40 },
        disk: { no: 1, of: 2 },
      },
      { duration: 1000 },
      '01.mp3',
    );
    expect(info).toMatchObject({
      album: 'The Return of the King',
      trackTitle: 'Book V - Chapter 01 - Minas Tirith',
      title: 'The Return of the King',
      author: 'J.R.R. Tolkien',
      track: 4,
      disc: 1,
      duration: 1000,
    });
  });

  it('names an untagged file after its file name, with no track number', () => {
    const info = audiobookInfoFrom(
      { track: { no: null, of: null }, disk: { no: null, of: null } },
      {},
      'My Book.mp3',
    );
    expect(info.title).toBe('My Book');
    expect(info.track).toBeUndefined();
    expect(info.disc).toBeUndefined();
    expect(info.trackTitle).toBeUndefined();
  });
});

describe('holdUnsettledFolders', () => {
  const e = (fullPath: string, size = 10) => ({ fullPath, size });

  it('holds back the finished files of a folder while another file in it is still arriving', () => {
    const seen = new Map<string, number>();
    const ready = [e('/b/Book/01.mp3'), e('/b/Book/02.mp3'), e('/b/Other/Solo.m4b')];
    const growing = [e('/b/Book/03.mp3', 5)];
    const out = holdUnsettledFolders(ready, growing, seen);
    expect(out.ready.map((x) => x.fullPath)).toEqual(['/b/Other/Solo.m4b']);
    expect(out.growing.map((x) => x.fullPath).sort()).toEqual([
      '/b/Book/01.mp3',
      '/b/Book/02.mp3',
      '/b/Book/03.mp3',
    ]);
    // Their sizes are remembered, so the next look can settle them together.
    expect(seen.get('/b/Book/01.mp3')).toBe(10);
  });

  it('changes nothing when no folder is waiting', () => {
    const out = holdUnsettledFolders([e('/b/a.mp3')], [e('/c/x.epub')], new Map());
    expect(out.ready).toHaveLength(1);
    expect(out.growing).toHaveLength(1);
  });
});

describe('part locations', () => {
  it('saves the file and the second in it, and reads it back', () => {
    expect(partLocation(3, 125.9)).toBe('audio:p3:125');
    expect(parsePartLocation('audio:p3:125')).toEqual({ index: 3, offset: 125 });
    expect(parsePartLocation(partLocation(0, 0))).toEqual({ index: 0, offset: 0 });
  });

  it('knows a plain position, or nothing, is not one', () => {
    expect(parsePartLocation('audio:3600')).toBeNull();
    expect(parsePartLocation('epubcfi(/6/4)')).toBeNull();
    expect(parsePartLocation(undefined)).toBeNull();
  });
});
