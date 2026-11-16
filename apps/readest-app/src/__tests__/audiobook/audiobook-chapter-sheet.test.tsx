import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterSheet } from '@/components/audiobook/AudiobookSheets';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) =>
    options ? key.replace(/{{(\w+)}}/g, (_m, n) => String(options[n] ?? '')) : key,
}));
vi.mock('@/hooks/useAudiobook', () => ({ bookmarkSeconds: () => 0 }));

afterEach(cleanup);

const chapters = [
  { title: 'Synopsis', start: 0, end: 559 },
  { title: 'Chapter 1 - Minas Tirith', start: 559, end: 5504 },
  {
    title: 'Appendix A - Annals of the Kings and Rulers Part I - The Númenórean',
    start: 5504,
    end: 9000,
  },
];

const show = (current = 1) => {
  const onPick = vi.fn();
  render(<ChapterSheet chapters={chapters} current={current} onPick={onPick} onClose={vi.fn()} />);
  return onPick;
};

describe('ChapterSheet, laid out like the Voice app', () => {
  it('names the sheet and counts where the book is: "2 / 3"', () => {
    show(1);
    expect(screen.getByRole('dialog', { name: 'Chapters' })).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('shows each chapter as a card with its number in a circle, and its start time', () => {
    show(1);
    const first = screen.getByText('Synopsis').closest('button')!;
    expect(first.textContent).toContain('1');
    expect(first.textContent).toContain('0:00');
    expect(first.querySelector('[data-chapter-number]')).toBeTruthy();
    expect(screen.getByText('Chapter 1 - Minas Tirith').closest('button')!.textContent).toContain(
      '9:19',
    );
  });

  it('lets a long title wrap instead of cutting it off', () => {
    show(0);
    const title = screen.getByText(/Appendix A - Annals of the Kings/);
    expect(title.className).not.toContain('truncate');
  });

  it('marks the chapter that is playing with a filled card and a shape instead of its number', () => {
    show(1);
    const playing = screen.getByText('Chapter 1 - Minas Tirith').closest('button')!;
    expect(playing.getAttribute('aria-current')).toBe('true');
    expect(playing.querySelector('[data-chapter-playing]')).toBeTruthy();
    expect(playing.querySelector('[data-chapter-number]')).toBeNull();
    const other = screen.getByText('Synopsis').closest('button')!;
    expect(other.getAttribute('aria-current')).toBeNull();
  });

  it('goes to a chapter when it is tapped', () => {
    const onPick = show(0);
    fireEvent.click(screen.getByText('Chapter 1 - Minas Tirith'));
    expect(onPick).toHaveBeenCalledWith(chapters[1]);
  });
});
