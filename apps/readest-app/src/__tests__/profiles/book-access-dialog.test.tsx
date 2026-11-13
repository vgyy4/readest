import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookAccessDialog from '@/app/library/components/BookAccessDialog';
import ProfilesDialog from '@/app/library/components/ProfilesDialog';
import { getAdminModeSetting } from '@/libs/profiles/admin';
import { getSessionPin, setSessionPin } from '@/libs/profiles/session';

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

const client = vi.hoisted(() => ({
  fetchProfiles: vi.fn(),
  getCachedProfiles: vi.fn(),
  fetchBookAccess: vi.fn(),
  setBookAccess: vi.fn(),
  verifyProfilePin: vi.fn(),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  deleteProfile: vi.fn(),
  fetchProfileBooks: vi.fn(),
  setProfileBooks: vi.fn(),
  setPin: vi.fn(),
  clearPin: vi.fn(),
  switchProfile: vi.fn(),
}));
vi.mock('@/libs/profiles/client', () => client);
const push = vi.hoisted(() => vi.fn());
vi.mock('@/libs/profiles/pushBooks', () => ({ ensureBooksOnServer: push }));

const book = { hash: 'abc', title: 'Dune' };
const profiles = [
  { id: 'kid', name: 'Kid' },
  { id: 'teen', name: 'Teen' },
];

beforeEach(() => {
  Object.values(client).forEach((fn) => fn.mockReset());
  push.mockReset();
  push.mockResolvedValue(undefined);
  client.fetchProfiles.mockResolvedValue({ hasPin: false, profiles });
  client.fetchBookAccess.mockResolvedValue(['kid']);
  client.setBookAccess.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  setSessionPin('');
  localStorage.clear();
});

describe('BookAccessDialog', () => {
  it('shows who has the book and saves the change', async () => {
    const onClose = vi.fn();
    render(<BookAccessDialog book={book} onClose={onClose} />);
    await screen.findByText('Kid');
    const [kid, teen] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(kid!.checked).toBe(true);
    expect(teen!.checked).toBe(false);

    fireEvent.click(teen!);
    fireEvent.click(kid!);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(client.setBookAccess).toHaveBeenCalledWith('abc', ['teen'], ''));
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(['abc']);
  });

  it('says why when the book cannot be sent to the server, and changes nothing', async () => {
    push.mockRejectedValue(new Error('offline'));
    render(<BookAccessDialog book={book} onClose={() => {}} />);
    await screen.findByText('Kid');
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByText('Save'));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not send this book');
    expect(client.setBookAccess).not.toHaveBeenCalled();
  });

  it('asks for the master PIN once, then remembers it for the session', async () => {
    client.fetchProfiles.mockResolvedValue({ hasPin: true, profiles });
    client.verifyProfilePin.mockImplementation(
      async (_id: string | null, pin: string) => pin === '4821',
    );
    render(<BookAccessDialog book={book} onClose={() => {}} />);

    fireEvent.change(await screen.findByLabelText('Master PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('Wrong PIN.');
    expect(client.fetchBookAccess).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Master PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('Kid');
    expect(client.fetchBookAccess).toHaveBeenCalledWith('abc', '4821');
    expect(getSessionPin()).toBe('4821');

    cleanup();
    render(<BookAccessDialog book={book} onClose={() => {}} />);
    await screen.findByText('Kid');
    expect(screen.queryByLabelText('Master PIN')).toBeNull();
  });

  it('says so when there are no profiles to choose from', async () => {
    client.fetchProfiles.mockResolvedValue({ hasPin: false, profiles: [] });
    client.fetchBookAccess.mockResolvedValue([]);
    render(<BookAccessDialog book={book} onClose={() => {}} />);
    await screen.findByText(/no profiles yet/i);
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('administration-only switch', () => {
  it('is on by default once there are profiles, and switching it off is remembered', async () => {
    render(<ProfilesDialog books={[]} onClose={() => {}} />);
    const toggle = (await screen.findByLabelText(
      'Main profile is for administration only',
    )) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(getAdminModeSetting()).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(getAdminModeSetting()).toBe(false);
  });
});
