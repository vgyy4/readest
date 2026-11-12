import { v4 as uuidv4 } from 'uuid';
import type {
  BookshelfCondition,
  BookshelfDefinition,
  BookshelfField,
  BookshelfGroup,
  BookshelfNode,
} from '@/types/bookshelf';
import { LibrarySortByType } from '@/types/settings';
import { getFieldKind, OPERATORS_BY_KIND } from './fields';

/** How many books the predefined Recently read shelf holds. */
export const RECENT_SHELF_LIMIT = 12;
export const DEFAULT_SHELF_LIMIT = 20;
export const RECENT_SHELF_ID = 'recent';

export const createGroup = (match: BookshelfGroup['match'] = 'all'): BookshelfGroup => ({
  type: 'group',
  id: uuidv4(),
  match,
  children: [],
});

export const createCondition = (field: BookshelfField = 'title'): BookshelfCondition => {
  const kind = getFieldKind(field);
  return {
    type: 'condition',
    id: uuidv4(),
    field,
    op: OPERATORS_BY_KIND[kind][0]!,
    value: kind === 'status' ? 'reading' : '',
    unit: kind === 'date' ? 'days' : undefined,
  };
};

/** The predefined Recently read shelf: books you are in the middle of, newest first. */
export const createRecentShelf = (enabled: boolean): BookshelfDefinition => ({
  id: RECENT_SHELF_ID,
  name: 'Recently read',
  builtin: 'recent',
  enabled,
  filter: {
    type: 'group',
    id: 'recent-filter',
    match: 'all',
    children: [
      { type: 'condition', id: 'recent-status', field: 'status', op: 'is', value: 'reading' },
    ],
  },
  sortBy: LibrarySortByType.Updated,
  sortAscending: false,
  limit: RECENT_SHELF_LIMIT,
  exclusive: false,
  includeExclusive: true,
});

export const createCustomShelf = (name: string): BookshelfDefinition => ({
  id: uuidv4(),
  name,
  enabled: true,
  filter: createGroup('all'),
  sortBy: LibrarySortByType.Updated,
  sortAscending: false,
  limit: DEFAULT_SHELF_LIMIT,
  exclusive: false,
  includeExclusive: false,
});

/** The first free "New bookshelf N" name. */
export const nextShelfName = (shelves: BookshelfDefinition[], base: string) => {
  const used = new Set(shelves.map((shelf) => shelf.name));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!used.has(name)) return name;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const sanitizeNode = (raw: unknown): BookshelfNode | null => {
  if (!isObject(raw)) return null;
  if (raw['type'] === 'group') {
    const children = Array.isArray(raw['children'])
      ? raw['children'].map(sanitizeNode).filter((n): n is BookshelfNode => !!n)
      : [];
    return {
      type: 'group',
      id: typeof raw['id'] === 'string' ? raw['id'] : uuidv4(),
      match: raw['match'] === 'any' ? 'any' : 'all',
      children,
    };
  }
  if (raw['type'] === 'condition') {
    const field = raw['field'] as BookshelfField;
    const kind = getFieldKind(field);
    const op = raw['op'] as BookshelfCondition['op'];
    if (!OPERATORS_BY_KIND[kind].includes(op)) return null;
    return {
      type: 'condition',
      id: typeof raw['id'] === 'string' ? raw['id'] : uuidv4(),
      field,
      op,
      value: typeof raw['value'] === 'string' ? raw['value'] : '',
      unit:
        raw['unit'] === 'months' || raw['unit'] === 'years' || raw['unit'] === 'days'
          ? raw['unit']
          : undefined,
    };
  }
  return null;
};

const sanitizeShelf = (raw: unknown): BookshelfDefinition | null => {
  if (!isObject(raw) || typeof raw['id'] !== 'string' || typeof raw['name'] !== 'string') {
    return null;
  }
  const filter = sanitizeNode(raw['filter']);
  const sortBy = Object.values(LibrarySortByType).includes(raw['sortBy'] as LibrarySortByType)
    ? (raw['sortBy'] as LibrarySortByType)
    : LibrarySortByType.Updated;
  return {
    id: raw['id'],
    name: raw['name'] || 'Bookshelf',
    enabled: raw['enabled'] !== false,
    builtin: raw['builtin'] === 'recent' ? 'recent' : undefined,
    filter: filter?.type === 'group' ? filter : createGroup('all'),
    sortBy,
    sortAscending: raw['sortAscending'] === true,
    limit: typeof raw['limit'] === 'number' && raw['limit'] >= 0 ? Math.floor(raw['limit']) : 0,
    exclusive: raw['exclusive'] === true,
    includeExclusive: raw['includeExclusive'] === true,
  };
};

/**
 * The saved shelves, repaired. The predefined Recently read shelf always
 * exists; before bookshelves were configurable it was the `libraryRecentShelfEnabled`
 * switch, so that switch seeds it when nothing has been saved yet.
 */
export const resolveBookshelves = (
  saved: unknown,
  legacyRecentEnabled: boolean,
): BookshelfDefinition[] => {
  const shelves = Array.isArray(saved)
    ? saved.map(sanitizeShelf).filter((s): s is BookshelfDefinition => !!s)
    : [];
  if (!shelves.some((shelf) => shelf.builtin === 'recent')) {
    shelves.unshift(createRecentShelf(legacyRecentEnabled));
  }
  return shelves;
};
