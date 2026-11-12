import type { Book, ReadingStatus } from '@/types/book';
import type {
  BookshelfCondition,
  BookshelfDateUnit,
  BookshelfDefinition,
  BookshelfGroup,
  BookshelfNode,
} from '@/types/bookshelf';
import { createBookSorter, getBookSubjects } from '@/app/library/utils/libraryUtils';
import { getFieldKind, operatorNeedsValue } from './fields';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a book's reading status counts as: unread until it has progress. */
export const getBookStatus = (book: Book): ReadingStatus => {
  if (book.readingStatus) return book.readingStatus;
  return book.progress != null ? 'reading' : 'unread';
};

const getProgressPercent = (book: Book): number => {
  const [current, total] = book.progress ?? [];
  if (!current || !total || total <= 0) return 0;
  return (current / total) * 100;
};

const getTextValues = (book: Book, field: BookshelfCondition['field']): string[] => {
  switch (field) {
    case 'title':
      return [book.title];
    case 'author':
      return [book.author];
    case 'series':
      return [book.metadata?.series ?? ''];
    case 'tag':
      return [...(book.tags ?? []), ...getBookSubjects(book)];
    case 'format':
      return [book.format];
    case 'language':
      return [book.primaryLanguage ?? ''];
    case 'group':
      return [book.groupName ?? ''];
    default:
      return [];
  }
};

/** The date `amount` units before `now`, clamped to the last valid day of the month. */
export const subtractDateUnits = (now: number, amount: number, unit: BookshelfDateUnit): number => {
  if (unit === 'days') return now - amount * DAY_MS;
  const date = new Date(now);
  const months = unit === 'years' ? amount * 12 : amount;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
};

const matchText = (values: string[], condition: BookshelfCondition): boolean => {
  const present = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
  const needle = condition.value.trim().toLowerCase();
  switch (condition.op) {
    case 'isSet':
      return present.length > 0;
    case 'notSet':
      return present.length === 0;
    case 'is':
      return present.some((v) => v === needle);
    case 'isNot':
      return !present.some((v) => v === needle);
    case 'contains':
      return present.some((v) => v.includes(needle));
    case 'notContains':
      return !present.some((v) => v.includes(needle));
    default:
      return false;
  }
};

export const matchesCondition = (book: Book, condition: BookshelfCondition, now: number) => {
  const kind = getFieldKind(condition.field);
  if (kind === 'status') {
    const equal = getBookStatus(book) === condition.value;
    return condition.op === 'isNot' ? !equal : equal;
  }
  if (kind === 'number') {
    const target = Number(condition.value);
    if (!Number.isFinite(target)) return false;
    const actual = getProgressPercent(book);
    if (condition.op === 'greaterThan') return actual > target;
    if (condition.op === 'lessThan') return actual < target;
    return Math.round(actual) === Math.round(target);
  }
  if (kind === 'date') {
    const amount = Number(condition.value);
    if (!Number.isInteger(amount) || amount <= 0) return false;
    const time = condition.field === 'added' ? book.createdAt : book.updatedAt;
    if (!time) return false;
    const since = subtractDateUnits(now, amount, condition.unit ?? 'days');
    const within = time >= since && time <= now;
    return condition.op === 'notWithin' ? !within : within;
  }
  return matchText(getTextValues(book, condition.field), condition);
};

export const matchesNode = (book: Book, node: BookshelfNode, now: number): boolean => {
  if (node.type === 'condition') return matchesCondition(book, node, now);
  return matchesGroup(book, node, now);
};

/** An empty group matches every book. */
export const matchesGroup = (book: Book, group: BookshelfGroup, now: number): boolean => {
  if (group.children.length === 0) return true;
  return group.match === 'any'
    ? group.children.some((child) => matchesNode(book, child, now))
    : group.children.every((child) => matchesNode(book, child, now));
};

/** Whether the filter can be saved: no condition lacks the value its operator needs. */
export const isFilterComplete = (node: BookshelfNode): boolean => {
  if (node.type === 'condition') {
    if (!operatorNeedsValue(node.op)) return true;
    const value = node.value.trim();
    if (!value) return false;
    const kind = getFieldKind(node.field);
    if (kind === 'number') return Number.isFinite(Number(value));
    if (kind === 'date') return Number.isInteger(Number(value)) && Number(value) > 0;
    return true;
  }
  return node.children.every(isFilterComplete);
};

export interface ShelfSelection {
  /** Books to show for each enabled shelf, by shelf id. */
  booksByShelf: Map<string, Book[]>;
  /** Hashes of the books that exclusive shelves took out of the main list. */
  ownedHashes: Set<string>;
}

/**
 * Evaluate shelves in display order. An exclusive shelf claims every match it
 * can see, and later shelves skip claimed books unless they opt in with
 * `includeExclusive`. The shelf's limit trims what it shows, not what it claims.
 */
export const selectShelfBooks = (
  books: Book[],
  shelves: BookshelfDefinition[],
  uiLanguage: string,
  now = Date.now(),
): ShelfSelection => {
  const booksByShelf = new Map<string, Book[]>();
  const ownedHashes = new Set<string>();
  const live = books.filter((book) => !book.deletedAt);
  for (const shelf of shelves) {
    if (!shelf.enabled) continue;
    const candidates = live.filter(
      (book) =>
        (shelf.includeExclusive || !ownedHashes.has(book.hash)) &&
        matchesGroup(book, shelf.filter, now),
    );
    if (shelf.exclusive) {
      for (const book of candidates) ownedHashes.add(book.hash);
    }
    const sorter = createBookSorter(shelf.sortBy, uiLanguage, 'none', shelf.sortAscending);
    const sorted = [...candidates].sort(sorter);
    booksByShelf.set(shelf.id, shelf.limit > 0 ? sorted.slice(0, shelf.limit) : sorted);
  }
  return { booksByShelf, ownedHashes };
};
