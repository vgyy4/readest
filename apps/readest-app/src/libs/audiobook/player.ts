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

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
export const SPEED_STEP = 0.05;
export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Between 0.5 and 3, in steps of 0.05. */
export const clampSpeed = (speed: number) =>
  Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) / SPEED_STEP) * SPEED_STEP;

export const DEFAULT_SKIP_SECONDS = 20;
export const MIN_SKIP_SECONDS = 5;
export const MAX_SKIP_SECONDS = 60;
export const SKIP_STEP_SECONDS = 5;

/** How far rewind and fast forward jump: 5 to 60 seconds, in steps of 5. */
export const clampSkip = (seconds: number) =>
  Math.round(Math.min(MAX_SKIP_SECONDS, Math.max(MIN_SKIP_SECONDS, seconds)) / SKIP_STEP_SECONDS) *
  SKIP_STEP_SECONDS;

/** Fractions of the book, one per chapter, as wide as the chapter is long. */
export const chapterSegments = (chapters: AudioChapter[], duration: number) =>
  duration > 0 ? chapters.map((c) => (c.end - c.start) / duration) : [];

export const bookPercent = (position: number, duration: number) =>
  duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;

/** Seconds of listening left, which shrinks as the speed goes up. */
export const remainingAtSpeed = (position: number, duration: number, speed: number) =>
  Math.max(0, duration - position) / Math.max(speed, 0.1);

export const formatRemainingInChapter = (position: number, chapterDuration: number) =>
  `-${formatClock(Math.max(0, chapterDuration - position))}`;

export const JUMP_VISIBLE_MS = 10_000;
const MIN_UNDOABLE_JUMP_SECONDS = 30;

export type JumpKind = 'seek' | 'chapter' | 'bookmark' | 'skip';

/**
 * Whether a jump can be taken back with "Back to": a chapter change, a bookmark,
 * or a seek of 30 seconds or more (or into another chapter). The rewind and
 * fast-forward buttons are small on purpose and never count.
 */
export const isUndoableJump = (
  kind: JumpKind,
  from: number,
  to: number,
  chapters: AudioChapter[],
) => {
  if (kind === 'chapter' || kind === 'bookmark') return true;
  if (kind === 'skip') return false;
  return (
    chapterIndexAt(chapters, from) !== chapterIndexAt(chapters, to) ||
    Math.abs(to - from) >= MIN_UNDOABLE_JUMP_SECONDS
  );
};

export interface Jump {
  id: number;
  /** Where playback was before the jump, in seconds. */
  from: number;
  /** Epoch ms. */
  at: number;
}

/** The "Back to 6:43" pill: where to return to, in that chapter's time, for ten seconds. */
export const jumpPill = (
  jump: Jump | null,
  now: number,
  chapters: AudioChapter[],
  currentChapterIndex: number,
) => {
  if (!jump || now - jump.at >= JUMP_VISIBLE_MS) return null;
  const index = chapterIndexAt(chapters, jump.from);
  const chapter = chapters[index];
  return {
    id: jump.id,
    time: formatClock(jump.from - (chapter?.start ?? 0)),
    chapterNumber: index === currentChapterIndex ? undefined : index + 1,
    visibleMs: JUMP_VISIBLE_MS - (now - jump.at),
  };
};

/** Whole seconds, which is all the synced progress column holds: [position, duration]. */
export const progressFromPosition = (position: number, duration: number): [number, number] => [
  Math.floor(position),
  Math.floor(duration),
];

export type SleepOption = { kind: 'minutes'; minutes: number } | { kind: 'chapter' } | null;

export const SLEEP_MINUTES = [5, 15, 30, 60] as const;
export const MIN_CUSTOM_SLEEP = 1;
export const MAX_CUSTOM_SLEEP = 180;

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
