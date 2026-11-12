import type { BookshelfDateUnit, BookshelfField, BookshelfOperator } from '@/types/bookshelf';
import type { ReadingStatus } from '@/types/book';

export type BookshelfFieldKind = 'text' | 'status' | 'number' | 'date';

export interface BookshelfFieldInfo {
  field: BookshelfField;
  label: string;
  kind: BookshelfFieldKind;
}

/** Untranslated labels; the editor passes them through `_()`. */
export const BOOKSHELF_FIELDS: BookshelfFieldInfo[] = [
  { field: 'title', label: 'Title', kind: 'text' },
  { field: 'author', label: 'Author', kind: 'text' },
  { field: 'series', label: 'Series', kind: 'text' },
  { field: 'tag', label: 'Tags and subjects', kind: 'text' },
  { field: 'format', label: 'Format', kind: 'text' },
  { field: 'language', label: 'Language', kind: 'text' },
  { field: 'group', label: 'Group', kind: 'text' },
  { field: 'status', label: 'Reading status', kind: 'status' },
  { field: 'progress', label: 'Progress (%)', kind: 'number' },
  { field: 'added', label: 'Date added', kind: 'date' },
  { field: 'read', label: 'Date read', kind: 'date' },
];

export const READING_STATUSES: ReadingStatus[] = ['unread', 'reading', 'finished', 'abandoned'];

export const getFieldKind = (field: BookshelfField): BookshelfFieldKind =>
  BOOKSHELF_FIELDS.find((f) => f.field === field)?.kind ?? 'text';

/** Operators offered for each kind of field, first one is the default. */
export const OPERATORS_BY_KIND: Record<BookshelfFieldKind, BookshelfOperator[]> = {
  text: ['contains', 'is', 'isNot', 'notContains', 'isSet', 'notSet'],
  status: ['is', 'isNot'],
  number: ['greaterThan', 'lessThan', 'is'],
  date: ['within', 'notWithin'],
};

export const OPERATOR_LABELS: Record<BookshelfOperator, string> = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  notContains: 'Does not contain',
  isSet: 'Is set',
  notSet: 'Is not set',
  greaterThan: 'Is greater than',
  lessThan: 'Is less than',
  within: 'Within the last',
  notWithin: 'Is older than',
};

export const DATE_UNITS: BookshelfDateUnit[] = ['days', 'months', 'years'];

export const operatorNeedsValue = (op: BookshelfOperator) => op !== 'isSet' && op !== 'notSet';
