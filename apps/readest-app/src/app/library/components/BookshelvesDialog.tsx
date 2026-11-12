import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdAdd, MdArrowDownward, MdArrowUpward, MdDeleteOutline } from 'react-icons/md';
import { Book } from '@/types/book';
import type {
  BookshelfCondition,
  BookshelfDefinition,
  BookshelfField,
  BookshelfGroup,
  BookshelfNode,
} from '@/types/bookshelf';
import { LibrarySortByType } from '@/types/settings';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveSysSettings } from '@/helpers/settings';
import Dialog from '@/components/Dialog';
import {
  createCondition,
  createCustomShelf,
  createGroup,
  createRecentShelf,
  nextShelfName,
  resolveBookshelves,
} from '@/services/bookshelves/definitions';
import { isFilterComplete, selectShelfBooks } from '@/services/bookshelves/evaluate';
import {
  BOOKSHELF_FIELDS,
  DATE_UNITS,
  getFieldKind,
  OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  operatorNeedsValue,
  READING_STATUSES,
} from '@/services/bookshelves/fields';

const SAVE_DELAY_MS = 500;
const MAX_FILTER_DEPTH = 3;

const SORT_LABELS: Record<LibrarySortByType, string> = {
  title: 'Title',
  author: 'Author',
  updated: 'Date Read',
  created: 'Date Added',
  series: 'Series',
  size: 'Size',
  format: 'Format',
  published: 'Date Published',
  progress: 'Progress',
  timeRemaining: 'Time Remaining',
};

const STATUS_LABELS: Record<string, string> = {
  unread: 'Unread',
  reading: 'Reading',
  finished: 'Finished',
  abandoned: 'Abandoned',
};

interface BookshelvesDialogProps {
  books: Book[];
  uiLanguage: string;
  onClose: () => void;
}

const updateNode = (
  group: BookshelfGroup,
  id: string,
  update: (node: BookshelfNode) => BookshelfNode | null,
): BookshelfGroup => {
  if (group.id === id) {
    const next = update(group);
    return next?.type === 'group' ? next : group;
  }
  return {
    ...group,
    children: group.children.flatMap((child) => {
      if (child.id === id) {
        const next = update(child);
        return next ? [next] : [];
      }
      return [child.type === 'group' ? updateNode(child, id, update) : child];
    }),
  };
};

interface ConditionRowProps {
  condition: BookshelfCondition;
  onChange: (next: BookshelfCondition) => void;
  onRemove: () => void;
}

const ConditionRow: React.FC<ConditionRowProps> = ({ condition, onChange, onRemove }) => {
  const _ = useTranslation();
  const kind = getFieldKind(condition.field);
  const operators = OPERATORS_BY_KIND[kind];

  const handleFieldChange = (field: BookshelfField) => {
    const next = createCondition(field);
    onChange({ ...next, id: condition.id });
  };

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <select
        aria-label={_('Field')}
        className='select select-bordered select-sm w-40 max-w-full'
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as BookshelfField)}
      >
        {BOOKSHELF_FIELDS.map((f) => (
          <option key={f.field} value={f.field}>
            {_(f.label)}
          </option>
        ))}
      </select>
      <select
        aria-label={_('Condition')}
        className='select select-bordered select-sm w-44 max-w-full'
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as BookshelfCondition['op'] })}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {_(OPERATOR_LABELS[op])}
          </option>
        ))}
      </select>
      {operatorNeedsValue(condition.op) &&
        (kind === 'status' ? (
          <select
            aria-label={_('Reading status')}
            className='select select-bordered select-sm w-36'
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          >
            {READING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {_(STATUS_LABELS[status]!)}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={_('Value')}
            type={kind === 'number' || kind === 'date' ? 'number' : 'text'}
            min={kind === 'text' ? undefined : 0}
            className={clsx(
              'input input-bordered input-sm',
              kind === 'text' ? 'w-44 max-w-full' : 'w-24',
              !condition.value.trim() && 'input-warning',
            )}
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          />
        ))}
      {kind === 'date' && (
        <select
          aria-label={_('Unit')}
          className='select select-bordered select-sm w-28'
          value={condition.unit ?? 'days'}
          onChange={(e) =>
            onChange({ ...condition, unit: e.target.value as BookshelfCondition['unit'] })
          }
        >
          {DATE_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit === 'days' ? _('Days') : unit === 'months' ? _('Months') : _('Years')}
            </option>
          ))}
        </select>
      )}
      <button
        type='button'
        className='btn btn-ghost btn-sm btn-square'
        aria-label={_('Remove condition')}
        onClick={onRemove}
      >
        <MdDeleteOutline size={18} />
      </button>
    </div>
  );
};

interface GroupEditorProps {
  group: BookshelfGroup;
  depth: number;
  isRoot?: boolean;
  onUpdate: (id: string, update: (node: BookshelfNode) => BookshelfNode | null) => void;
}

const GroupEditor: React.FC<GroupEditorProps> = ({ group, depth, isRoot, onUpdate }) => {
  const _ = useTranslation();
  return (
    <div
      className={clsx(
        'flex flex-col gap-2',
        !isRoot && 'border-base-300 bg-base-200/40 rounded-lg border p-3',
      )}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-sm'>{_('Match')}</span>
        <select
          aria-label={_('Match')}
          className='select select-bordered select-sm'
          value={group.match}
          onChange={(e) =>
            onUpdate(group.id, (node) =>
              node.type === 'group' ? { ...node, match: e.target.value as 'all' | 'any' } : node,
            )
          }
        >
          <option value='all'>{_('All (AND)')}</option>
          <option value='any'>{_('Any (OR)')}</option>
        </select>
        <span className='text-base-content/60 text-sm'>{_('of the following')}</span>
        {!isRoot && (
          <button
            type='button'
            className='btn btn-ghost btn-sm btn-square ms-auto'
            aria-label={_('Remove group')}
            onClick={() => onUpdate(group.id, () => null)}
          >
            <MdDeleteOutline size={18} />
          </button>
        )}
      </div>
      {group.children.length === 0 && (
        <p className='text-base-content/60 text-sm'>
          {isRoot ? _('No conditions: every book matches.') : _('This group is empty.')}
        </p>
      )}
      {group.children.map((child) =>
        child.type === 'condition' ? (
          <ConditionRow
            key={child.id}
            condition={child}
            onChange={(next) => onUpdate(child.id, () => next)}
            onRemove={() => onUpdate(child.id, () => null)}
          />
        ) : (
          <GroupEditor key={child.id} group={child} depth={depth + 1} onUpdate={onUpdate} />
        ),
      )}
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          className='btn btn-outline btn-sm'
          onClick={() =>
            onUpdate(group.id, (node) =>
              node.type === 'group'
                ? { ...node, children: [...node.children, createCondition()] }
                : node,
            )
          }
        >
          <MdAdd size={16} /> {_('Add condition')}
        </button>
        {depth < MAX_FILTER_DEPTH && (
          <button
            type='button'
            className='btn btn-outline btn-sm'
            onClick={() =>
              onUpdate(group.id, (node) =>
                node.type === 'group'
                  ? { ...node, children: [...node.children, createGroup('any')] }
                  : node,
              )
            }
          >
            <MdAdd size={16} /> {_('Add group')}
          </button>
        )}
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <label className='flex cursor-pointer items-center justify-between gap-4 py-1'>
    <span className='flex flex-col'>
      <span className='text-sm'>{label}</span>
      {hint && <span className='text-base-content/60 text-xs'>{hint}</span>}
    </span>
    <input
      type='checkbox'
      className='toggle toggle-sm'
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  </label>
);

/**
 * Manage Bookshelves: the stacked shelves shown above the library. Each shelf
 * is a filter (nested All/Any groups), a sort, a size limit and whether it
 * takes its books out of the main list. Valid changes save automatically.
 */
const BookshelvesDialog: React.FC<BookshelvesDialogProps> = ({ books, uiLanguage, onClose }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();

  const [draft, setDraft] = useState<BookshelfDefinition[]>(() =>
    resolveBookshelves(settings.libraryBookshelves, settings.libraryRecentShelfEnabled),
  );
  const [selectedId, setSelectedId] = useState(() => draft[0]?.id ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'invalid'>('idle');
  const dirtyRef = useRef(false);
  const latestRef = useRef(draft);
  latestRef.current = draft;

  const allValid = useMemo(() => draft.every((shelf) => isFilterComplete(shelf.filter)), [draft]);
  const selected = draft.find((shelf) => shelf.id === selectedId) ?? draft[0];

  const persist = useCallback(async () => {
    if (!dirtyRef.current) return;
    const shelves = latestRef.current;
    if (!shelves.every((shelf) => isFilterComplete(shelf.filter))) return;
    dirtyRef.current = false;
    setStatus('saving');
    await saveSysSettings(envConfig, 'libraryBookshelves', shelves);
    setStatus('saved');
  }, [envConfig]);

  // Autosave after a short pause; incomplete conditions keep the last valid save.
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (!allValid) {
      setStatus('invalid');
      return;
    }
    const timer = setTimeout(() => void persist(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, allValid, persist]);

  const change = (next: BookshelfDefinition[]) => {
    dirtyRef.current = true;
    setDraft(next);
  };

  const updateShelf = (id: string, patch: Partial<BookshelfDefinition>) =>
    change(draft.map((shelf) => (shelf.id === id ? { ...shelf, ...patch } : shelf)));

  const handleClose = async () => {
    await persist();
    onClose();
  };

  const handleAdd = () => {
    const shelf = createCustomShelf(nextShelfName(draft, _('New bookshelf')));
    // Right after the predefined Recently read shelf, as upstream does.
    const recentIndex = draft.findIndex((s) => s.builtin === 'recent');
    const next = [...draft];
    next.splice(recentIndex + 1, 0, shelf);
    change(next);
    setSelectedId(shelf.id);
  };

  const handleDelete = (shelf: BookshelfDefinition) => {
    if (shelf.builtin) return;
    if (!window.confirm(_('Delete this bookshelf? Books stay in the library.'))) return;
    const next = draft.filter((s) => s.id !== shelf.id);
    change(next);
    setSelectedId(next[0]?.id ?? '');
  };

  const handleReset = (shelf: BookshelfDefinition) => {
    if (!window.confirm(_('Reset this bookshelf to its defaults?'))) return;
    const fresh = shelf.builtin ? createRecentShelf(shelf.enabled) : createCustomShelf(shelf.name);
    updateShelf(shelf.id, { ...fresh, id: shelf.id, name: shelf.name, enabled: shelf.enabled });
  };

  const handleMove = (shelf: BookshelfDefinition, direction: -1 | 1) => {
    const index = draft.findIndex((s) => s.id === shelf.id);
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target]!, next[index]!];
    change(next);
  };

  const matchCount = useMemo(() => {
    if (!selected || !isFilterComplete(selected.filter)) return null;
    // Evaluate the whole draft so ownership by earlier exclusive shelves applies,
    // and show the selected shelf even if disabled. The limit is lifted to count every match.
    const shelves = draft.map((shelf) =>
      shelf.id === selected.id ? { ...shelf, enabled: true, limit: 0 } : shelf,
    );
    return selectShelfBooks(books, shelves, uiLanguage).booksByShelf.get(selected.id)?.length ?? 0;
  }, [books, draft, selected, uiLanguage]);

  const statusText =
    status === 'saving'
      ? _('Saving…')
      : status === 'saved'
        ? _('Saved')
        : status === 'invalid'
          ? _('Fill in every condition to save changes.')
          : '';

  return (
    <Dialog
      isOpen={true}
      title={_('Manage Bookshelves')}
      onClose={() => void handleClose()}
      boxClassName='sm:!w-[48rem] sm:!max-w-screen-md sm:h-[44rem] sm:!max-h-[90vh]'
    >
      <div className='bookshelves-dialog flex flex-col gap-4 p-4 sm:px-6'>
        <div className='flex flex-wrap items-center gap-2'>
          {draft.map((shelf) => (
            <button
              key={shelf.id}
              type='button'
              onClick={() => setSelectedId(shelf.id)}
              className={clsx(
                'btn btn-sm',
                shelf.id === selected?.id ? 'btn-primary' : 'btn-ghost border-base-300 border',
                !shelf.enabled && 'opacity-60',
              )}
            >
              {shelf.builtin === 'recent' && shelf.name === 'Recently read'
                ? _('Recently read')
                : shelf.name}
            </button>
          ))}
          <button
            type='button'
            className='btn btn-sm btn-circle btn-outline'
            aria-label={_('Add bookshelf')}
            onClick={handleAdd}
          >
            <MdAdd size={18} />
          </button>
          <span className='text-base-content/60 ms-auto text-xs' aria-live='polite'>
            {statusText}
          </span>
        </div>

        {selected && (
          <div className='flex flex-col gap-5'>
            <div className='flex flex-wrap items-end gap-3'>
              <label className='flex min-w-40 flex-1 flex-col gap-1'>
                <span className='text-sm'>{_('Name')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm'
                  value={selected.name}
                  onChange={(e) => updateShelf(selected.id, { name: e.target.value })}
                  onBlur={() => {
                    if (!selected.name.trim()) updateShelf(selected.id, { name: _('Bookshelf') });
                  }}
                />
              </label>
              <div className='flex gap-1'>
                <button
                  type='button'
                  className='btn btn-ghost btn-sm btn-square'
                  aria-label={_('Move up')}
                  disabled={draft[0]?.id === selected.id}
                  onClick={() => handleMove(selected, -1)}
                >
                  <MdArrowUpward size={18} />
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-sm btn-square'
                  aria-label={_('Move down')}
                  disabled={draft[draft.length - 1]?.id === selected.id}
                  onClick={() => handleMove(selected, 1)}
                >
                  <MdArrowDownward size={18} />
                </button>
              </div>
            </div>

            <div className='flex flex-col'>
              <ToggleRow
                label={_('Enabled')}
                checked={selected.enabled}
                onChange={(enabled) => {
                  // Keep at least one shelf visible would be needed upstream; the
                  // library itself is always shown, so any shelf may be disabled.
                  updateShelf(selected.id, { enabled });
                }}
              />
              <ToggleRow
                label={_('Exclusive')}
                hint={_('Take these books out of the main library list.')}
                checked={selected.exclusive}
                onChange={(exclusive) => updateShelf(selected.id, { exclusive })}
              />
              <ToggleRow
                label={_('Include books from exclusive shelves')}
                hint={_('Also show books that an earlier exclusive shelf already took.')}
                checked={selected.includeExclusive}
                onChange={(includeExclusive) => updateShelf(selected.id, { includeExclusive })}
              />
            </div>

            <section className='flex flex-col gap-2'>
              <h3 className='text-sm font-medium'>{_('Filters')}</h3>
              <GroupEditor
                group={selected.filter}
                depth={1}
                isRoot
                onUpdate={(id, update) =>
                  updateShelf(selected.id, { filter: updateNode(selected.filter, id, update) })
                }
              />
              {matchCount !== null && (
                <p className='text-base-content/60 text-xs'>
                  {_('{{count}} book(s) match', { count: matchCount })}
                </p>
              )}
            </section>

            <section className='flex flex-col gap-2'>
              <h3 className='text-sm font-medium'>{_('Sorting')}</h3>
              <div className='flex flex-wrap items-center gap-2'>
                <select
                  aria-label={_('Sort by')}
                  className='select select-bordered select-sm'
                  value={selected.sortBy}
                  onChange={(e) =>
                    updateShelf(selected.id, { sortBy: e.target.value as LibrarySortByType })
                  }
                >
                  {Object.values(LibrarySortByType).map((value) => (
                    <option key={value} value={value}>
                      {_(SORT_LABELS[value])}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={_('Sort direction')}
                  className='select select-bordered select-sm'
                  value={selected.sortAscending ? 'asc' : 'desc'}
                  onChange={(e) =>
                    updateShelf(selected.id, { sortAscending: e.target.value === 'asc' })
                  }
                >
                  <option value='asc'>{_('Ascending')}</option>
                  <option value='desc'>{_('Descending')}</option>
                </select>
                <label className='flex items-center gap-2 text-sm'>
                  {_('Show at most')}
                  <input
                    type='number'
                    min={0}
                    className='input input-bordered input-sm w-20'
                    value={selected.limit}
                    onChange={(e) =>
                      updateShelf(selected.id, {
                        limit: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                  />
                  <span className='text-base-content/60 text-xs'>{_('(0 = all)')}</span>
                </label>
              </div>
            </section>

            <div className='border-base-300 flex justify-between border-t pt-3'>
              <button
                type='button'
                className='btn btn-ghost btn-sm'
                onClick={() => handleReset(selected)}
              >
                {_('Reset')}
              </button>
              {!selected.builtin && (
                <button
                  type='button'
                  className='btn btn-ghost btn-sm text-error'
                  onClick={() => handleDelete(selected)}
                >
                  {_('Delete')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default BookshelvesDialog;
