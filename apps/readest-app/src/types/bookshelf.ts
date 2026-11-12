import type { LibrarySortByType } from './settings';

/** Book properties a bookshelf filter can test. */
export type BookshelfField =
  | 'title'
  | 'author'
  | 'series'
  | 'tag'
  | 'format'
  | 'language'
  | 'group'
  | 'status'
  | 'progress'
  | 'added'
  | 'read';

export type BookshelfOperator =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'notContains'
  | 'isSet'
  | 'notSet'
  | 'greaterThan'
  | 'lessThan'
  | 'within'
  | 'notWithin';

export type BookshelfDateUnit = 'days' | 'months' | 'years';

export interface BookshelfCondition {
  type: 'condition';
  id: string;
  field: BookshelfField;
  op: BookshelfOperator;
  /** Text, a reading status, a percentage, or a whole number for date ranges. */
  value: string;
  /** Only used by the date operators. */
  unit?: BookshelfDateUnit;
}

export interface BookshelfGroup {
  type: 'group';
  id: string;
  /** `all` = every child must match (AND), `any` = at least one (OR). */
  match: 'all' | 'any';
  children: BookshelfNode[];
}

export type BookshelfNode = BookshelfCondition | BookshelfGroup;

export type BuiltinBookshelfId = 'recent';

export interface BookshelfDefinition {
  /** `recent` for the predefined shelf, a UUID for custom shelves. */
  id: string;
  name: string;
  enabled: boolean;
  /** Predefined shelves can be renamed, disabled and reset, but not deleted. */
  builtin?: BuiltinBookshelfId;
  /** An empty root group matches every book. */
  filter: BookshelfGroup;
  sortBy: LibrarySortByType;
  sortAscending: boolean;
  /** Most books shown on the shelf; 0 shows every match. */
  limit: number;
  /** The shelf takes its books out of the main library list. */
  exclusive: boolean;
  /** Show books that an earlier exclusive shelf already took. */
  includeExclusive: boolean;
}
