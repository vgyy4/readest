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
  { title: 'Prologue 4', start: 9000, end: 9500 },
];

const show = (current = 1, playing = false) => {
  const onPick = vi.fn();
  render(
    <ChapterSheet
      chapters={chapters}
      current={current}
      playing={playing}
      onPick={onPick}
      onClose={vi.fn()}
    />,
  );
  return onPick;
};

const row = (title: string | RegExp) => screen.getByText(title).closest('button')!;

// These follow Voice's ChapterSheet: a counter beside the title, a list of cards in one connected
// shape (big outer corners, small inner ones, 2 px apart), a 44 px badge on each, the playing
// chapter on the primary container with a cookie and moving bars, earlier chapters dimmed.
describe('ChapterSheet, laid out as in the Voice app', () => {
  it('names the sheet and counts where the book is: "2 / 4"', () => {
    show(1);
    expect(screen.getByRole('dialog', { name: 'Chapters' })).toBeTruthy();
    expect(screen.getByText('2 / 4')).toBeTruthy();
  });

  it('shows each chapter with its number in a circle and its start time', () => {
    show(1);
    expect(row('Synopsis').textContent).toContain('1');
    expect(row('Synopsis').textContent).toContain('0:00');
    expect(row('Synopsis').querySelector('[data-chapter-number]')).toBeTruthy();
    expect(row('Chapter 1 - Minas Tirith').textContent).toContain('9:19');
  });

  it('joins the cards into one shape: big corners at the ends of the list, small between', () => {
    show(1);
    expect(row('Synopsis').style.borderRadius).toBe('20px 20px 4px 4px');
    expect(row('Chapter 1 - Minas Tirith').style.borderRadius).toBe('4px 4px 4px 4px');
    expect(row('Prologue 4').style.borderRadius).toBe('4px 4px 20px 20px');
  });

  it('lets a title take two lines instead of cutting it off at one', () => {
    show(0);
    const title = screen.getByText(/Appendix A - Annals of the Kings/);
    expect(title.className).toContain('line-clamp-2');
    expect(title.className).not.toContain('truncate');
  });

  it('marks the chapter that is playing: primary container, a cookie with bars, emphasized name', () => {
    show(1, true);
    const playing = row('Chapter 1 - Minas Tirith');
    expect(playing.getAttribute('aria-current')).toBe('true');
    expect(playing.style.background).toContain('--ab-primary-container');
    expect(playing.querySelector('[data-chapter-playing]')).toBeTruthy();
    expect(playing.querySelector('[data-chapter-number]')).toBeNull();
    expect(screen.getByText('Chapter 1 - Minas Tirith').className).toContain('font-semibold');
    expect(row('Synopsis').getAttribute('aria-current')).toBeNull();
    expect(row('Synopsis').style.background).toContain('--ab-surface-high');
  });

  it('dims the chapters already played', () => {
    show(2);
    expect(screen.getByText('Synopsis').style.color).toContain('--ab-text-muted');
    expect(screen.getByText('Chapter 1 - Minas Tirith').style.color).toContain('--ab-text-muted');
    expect(screen.getByText('Prologue 4').style.color).toBe('');
  });

  it('goes to a chapter when it is tapped', () => {
    const onPick = show(0);
    fireEvent.click(screen.getByText('Chapter 1 - Minas Tirith'));
    expect(onPick).toHaveBeenCalledWith(chapters[1]);
  });
});
