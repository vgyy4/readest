import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BuildBadge from '@/components/BuildBadge';

afterEach(cleanup);

describe('BuildBadge', () => {
  it('says in red that this is a new build, with its label', () => {
    render(<BuildBadge large label='33f33cc, run 26' />);
    const note = screen.getByRole('note');
    expect(note.textContent).toBe('This is a new build (33f33cc, run 26)');
    expect(note.className).toContain('text-red-600');
  });

  it('is small on the profile screen', () => {
    render(<BuildBadge label='33f33cc, run 26' />);
    expect(screen.getByRole('note').textContent).toBe('Build 33f33cc, run 26');
  });

  it('shows nothing for a build that has no label (local or web)', () => {
    const { container } = render(<BuildBadge label='' />);
    expect(container.textContent).toBe('');
  });
});
