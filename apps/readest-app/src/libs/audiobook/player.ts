export interface AudioChapter {
  title: string;
  /** Seconds from the start of the book. */
  start: number;
  end: number;
}

/** A chapter as the tags give it: `timeScale` units per second, ID3 omits it (seconds). */
export interface RawChapter {
  title?: string;
  start: number;
  end?: number;
  timeScale?: number;
}

/**
 * Chapters in seconds, sorted, each ending where the next begins (the last at the
 * end of the book). An untitled one is "Chapter N", and a book with no chapters
 * at all is a single chapter named after the book.
 */
export const normalizeChapters = (
  raw: RawChapter[] | undefined,
  duration: number,
  fallbackTitle = 'Chapter 1',
): AudioChapter[] => {
  const sorted = [...(raw ?? [])]
    .map((c) => ({
      title: c.title?.trim() ?? '',
      start: c.start / (c.timeScale ?? 1),
      end: c.end === undefined ? undefined : c.end / (c.timeScale ?? 1),
    }))
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [{ title: fallbackTitle, start: 0, end: duration }];
  return sorted.map((c, i) => ({
    title: c.title || `Chapter ${i + 1}`,
    start: c.start,
    end: sorted[i + 1]?.start ?? duration,
  }));
};

export const chapterIndexAt = (chapters: AudioChapter[], position: number) => {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (position >= chapters[i]!.start) return i;
  }
  return 0;
};

/** m:ss, or h:mm:ss from an hour up. */
export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export const clampPosition = (position: number, duration: number) =>
  Math.min(Math.max(position, 0), duration);

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** The next faster speed, wrapping from the fastest back to the slowest. */
export const nextSpeed = (current: number) =>
  PLAYBACK_SPEEDS.find((s) => s > current) ?? PLAYBACK_SPEEDS[0]!;

export const SKIP_BACK_SECONDS = 10;
export const SKIP_FORWARD_SECONDS = 30;

/** Whole seconds, which is all the synced progress column holds: [position, duration]. */
export const progressFromPosition = (position: number, duration: number): [number, number] => [
  Math.floor(position),
  Math.floor(duration),
];

export type SleepOption = { kind: 'minutes'; minutes: number } | { kind: 'chapter' } | null;

export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** When (epoch ms) playback should stop; at a chapter's end that is wall-clock time at `speed`. */
export const sleepDeadline = (
  option: SleepOption,
  now: number,
  position: number,
  chapterEnd: number,
  speed = 1,
): number | null => {
  if (!option) return null;
  if (option.kind === 'minutes') return now + option.minutes * 60_000;
  return now + (Math.max(0, chapterEnd - position) / speed) * 1000;
};

export const sleepSecondsLeft = (deadline: number | null, now: number): number | null =>
  deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
