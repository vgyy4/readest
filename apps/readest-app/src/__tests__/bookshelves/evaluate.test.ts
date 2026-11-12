import { describe, expect, it } from 'vitest';
import type { Book } from '@/types/book';
import type { BookshelfDefinition, BookshelfGroup } from '@/types/bookshelf';
import {
  createCondition,
  createCustomShelf,
  createRecentShelf,
  resolveBookshelves,
} from '@/services/bookshelves/definitions';
import {
  isFilterComplete,
  matchesGroup,
  selectShelfBooks,
  subtractDateUnits,
} from '@/services/bookshelves/evaluate';

const NOW = Date.UTC(2026, 10, 12);
const DAY = 24 * 60 * 60 * 1000;

const book = (hash: string, extra: Partial<Book> = {}): Book => ({
  hash,
  format: 'EPUB',
  title: `Book ${hash}`,
  author: 'Someone',
  createdAt: NOW - 100 * DAY,
  updatedAt: NOW - 50 * DAY,
  ...extra,
});

const group = (match: 'all' | 'any', ...children: BookshelfGroup['children']): BookshelfGroup => ({
  type: 'group',
  id: 'g',
  match,
  children,
});

const cond = (
  field: Parameters<typeof createCondition>[0],
  op: string,
  value = '',
  unit?: string,
) => ({ ...createCondition(field), op, value, unit }) as BookshelfGroup['children'][number];

describe('bookshelf filters', () => {
  it('matches every book when the root group is empty', () => {
    expect(matchesGroup(book('a'), group('all'), NOW)).toBe(true);
  });

  it('combines conditions with All and Any', () => {
    const b = book('a', { author: 'Jane Austen', format: 'PDF' });
    const both = group('all', cond('author', 'contains', 'austen'), cond('format', 'is', 'epub'));
    const either = group('any', cond('author', 'contains', 'austen'), cond('format', 'is', 'epub'));
    expect(matchesGroup(b, both, NOW)).toBe(false);
    expect(matchesGroup(b, either, NOW)).toBe(true);
  });

  it('supports nested groups', () => {
    const b = book('a', { tags: ['sci-fi'], format: 'PDF' });
    const filter = group(
      'all',
      cond('tag', 'is', 'sci-fi'),
      group('any', cond('format', 'is', 'epub'), cond('format', 'is', 'pdf')),
    );
    expect(matchesGroup(b, filter, NOW)).toBe(true);
  });

  it('treats a missing field as matching Is not and Does not contain', () => {
    const b = book('a');
    expect(matchesGroup(b, group('all', cond('series', 'isNot', 'Dune')), NOW)).toBe(true);
    expect(matchesGroup(b, group('all', cond('series', 'notSet')), NOW)).toBe(true);
    expect(matchesGroup(b, group('all', cond('series', 'isSet')), NOW)).toBe(false);
  });

  it('derives reading status from progress when none is stored', () => {
    const reading = book('r', { progress: [3, 10] });
    const unread = book('u');
    const finished = book('f', { progress: [10, 10], readingStatus: 'finished' });
    const filter = group('all', cond('status', 'is', 'reading'));
    expect(matchesGroup(reading, filter, NOW)).toBe(true);
    expect(matchesGroup(unread, filter, NOW)).toBe(false);
    expect(matchesGroup(finished, filter, NOW)).toBe(false);
  });

  it('compares progress as a percentage', () => {
    const b = book('a', { progress: [5, 10] });
    expect(matchesGroup(b, group('all', cond('progress', 'greaterThan', '40')), NOW)).toBe(true);
    expect(matchesGroup(b, group('all', cond('progress', 'lessThan', '40')), NOW)).toBe(false);
  });

  it('matches dates within the last N units, including the boundary', () => {
    const recent = book('a', { updatedAt: NOW - 3 * DAY });
    const boundary = book('b', { updatedAt: NOW - 7 * DAY });
    const old = book('c', { updatedAt: NOW - 8 * DAY });
    const future = book('d', { updatedAt: NOW + DAY });
    const filter = group('all', cond('read', 'within', '7', 'days'));
    expect(matchesGroup(recent, filter, NOW)).toBe(true);
    expect(matchesGroup(boundary, filter, NOW)).toBe(true);
    expect(matchesGroup(old, filter, NOW)).toBe(false);
    expect(matchesGroup(future, filter, NOW)).toBe(false);
  });

  it('clamps month arithmetic to the last valid day', () => {
    const march31 = Date.UTC(2026, 2, 31);
    expect(new Date(subtractDateUnits(march31, 1, 'months')).toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    const leap = Date.UTC(2028, 1, 29);
    expect(new Date(subtractDateUnits(leap, 1, 'years')).toISOString().slice(0, 10)).toBe(
      '2027-02-28',
    );
  });

  it('flags incomplete conditions', () => {
    expect(isFilterComplete(group('all', cond('title', 'contains', '')))).toBe(false);
    expect(isFilterComplete(group('all', cond('title', 'isSet')))).toBe(true);
    expect(isFilterComplete(group('all', cond('read', 'within', '0', 'days')))).toBe(false);
    expect(isFilterComplete(group('all', cond('progress', 'greaterThan', 'abc')))).toBe(false);
  });
});

describe('shelf selection', () => {
  const library = [
    book('1', { progress: [1, 10], updatedAt: NOW - 3 * DAY, tags: ['a'] }),
    book('2', { progress: [2, 10], updatedAt: NOW - 1 * DAY, tags: ['a'] }),
    book('3', { updatedAt: NOW - 2 * DAY, tags: ['a'] }),
    book('4', { deletedAt: NOW }),
  ];

  const tagShelf = (patch: Partial<BookshelfDefinition>): BookshelfDefinition => ({
    ...createCustomShelf('Tagged'),
    filter: group('all', cond('tag', 'is', 'a')),
    ...patch,
  });

  it('sorts a shelf and limits what it shows', () => {
    const shelf = tagShelf({ limit: 2 });
    const { booksByShelf } = selectShelfBooks(library, [shelf], 'en', NOW);
    expect(booksByShelf.get(shelf.id)?.map((b) => b.hash)).toEqual(['2', '3']);
  });

  it('skips deleted books and disabled shelves', () => {
    const shelf = tagShelf({ enabled: false });
    const { booksByShelf } = selectShelfBooks(library, [shelf], 'en', NOW);
    expect(booksByShelf.has(shelf.id)).toBe(false);
  });

  it('lets an exclusive shelf claim books, including ones beyond its limit', () => {
    const shelf = tagShelf({ exclusive: true, limit: 1 });
    const { ownedHashes } = selectShelfBooks(library, [shelf], 'en', NOW);
    expect([...ownedHashes].sort()).toEqual(['1', '2', '3']);
  });

  it('hides claimed books from later shelves unless they opt in', () => {
    const first = tagShelf({ exclusive: true });
    const hidden = tagShelf({ id: 'hidden', includeExclusive: false });
    const shown = tagShelf({ id: 'shown', includeExclusive: true });
    const { booksByShelf } = selectShelfBooks(library, [first, hidden, shown], 'en', NOW);
    expect(booksByShelf.get('hidden')).toEqual([]);
    expect(booksByShelf.get('shown')).toHaveLength(3);
  });

  it('the predefined Recently read shelf holds books being read, newest first', () => {
    const { booksByShelf } = selectShelfBooks(library, [createRecentShelf(true)], 'en', NOW);
    expect(booksByShelf.get('recent')?.map((b) => b.hash)).toEqual(['2', '1']);
  });
});

describe('resolveBookshelves', () => {
  it('seeds the Recently read shelf from the legacy switch', () => {
    expect(resolveBookshelves(undefined, true)[0]).toMatchObject({ id: 'recent', enabled: true });
    expect(resolveBookshelves(undefined, false)[0]).toMatchObject({ id: 'recent', enabled: false });
  });

  it('keeps saved shelves and drops malformed ones', () => {
    const saved = [createRecentShelf(true), createCustomShelf('Mine'), { id: 5 }, null];
    const shelves = resolveBookshelves(saved, false);
    expect(shelves.map((s) => s.name)).toEqual(['Recently read', 'Mine']);
    expect(shelves[0]!.enabled).toBe(true);
  });

  it('drops conditions with an operator the field does not support', () => {
    const shelf = createCustomShelf('Bad');
    shelf.filter = group('all', cond('status', 'contains', 'x'), cond('title', 'is', 'x'));
    const [, repaired] = resolveBookshelves([shelf], false);
    expect(repaired!.filter.children).toHaveLength(1);
  });
});
