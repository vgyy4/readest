import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { BookshelfDefinition } from '@/types/bookshelf';
import BookshelvesDialog from '@/app/library/components/BookshelvesDialog';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));

vi.mock('@/components/Dialog', () => ({
  __esModule: true,
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div role='dialog' aria-label={title}>
      {children}
    </div>
  ),
}));

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { libraryRecentShelfEnabled: true } }),
}));

const saveSysSettings = vi.fn(async () => {});
vi.mock('@/helpers/settings', () => ({
  saveSysSettings: (...args: unknown[]) => saveSysSettings(...(args as [])),
}));

const books: Book[] = [
  {
    hash: 'a',
    format: 'EPUB',
    title: 'Dune',
    author: 'Frank Herbert',
    tags: ['sci-fi'],
    createdAt: 1,
    updatedAt: 2,
  },
  { hash: 'b', format: 'EPUB', title: 'Emma', author: 'Jane Austen', createdAt: 1, updatedAt: 2 },
];

const lastSaved = () => {
  const calls = saveSysSettings.mock.calls as unknown as unknown[][];
  return calls[calls.length - 1]![2] as BookshelvesSaved;
};
type BookshelvesSaved = BookshelfDefinition[];

describe('BookshelvesDialog', () => {
  beforeEach(() => saveSysSettings.mockClear());
  afterEach(cleanup);

  it('adds a shelf, filters it, and saves valid changes', async () => {
    const onClose = vi.fn();
    render(<BookshelvesDialog books={books} uiLanguage='en' onClose={onClose} />);
    expect(screen.getAllByText('Recently read').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Add bookshelf'));
    expect(screen.getByDisplayValue('New bookshelf 1')).toBeTruthy();
    expect(screen.getByText('2 book(s) match')).toBeTruthy();

    fireEvent.click(screen.getByText('Add condition'));
    // An empty value is incomplete: nothing is saved yet.
    expect(screen.getByText('Fill in every condition to save changes.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'dune' } });
    expect(screen.getByText('1 book(s) match')).toBeTruthy();

    await waitFor(() => expect(saveSysSettings).toHaveBeenCalled(), { timeout: 2000 });
    const saved = lastSaved();
    expect(saved.map((s) => s.name)).toEqual(['Recently read', 'New bookshelf 1']);
    expect(saved[1]!.filter.children[0]).toMatchObject({ field: 'title', value: 'dune' });
  });
});
