import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import ProfilesDialog from '@/app/library/components/ProfilesDialog';
import { setActiveProfileId } from '@/libs/profiles/active';
import { setSessionPin } from '@/libs/profiles/session';

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
  fetchBookAccess: vi.fn(),
  setBookAccess: vi.fn(),
  fetchProfiles: vi.fn(),
  getCachedProfiles: vi.fn(),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  deleteProfile: vi.fn(),
  fetchProfileBooks: vi.fn(),
  setProfileBooks: vi.fn(),
  setPin: vi.fn(),
  clearPin: vi.fn(),
  verifyProfilePin: vi.fn(),
  switchProfile: vi.fn(),
}));
vi.mock('@/libs/profiles/client', () => client);

const KID = '22222222-2222-2222-2222-222222222222';
const books = [
  { hash: 'a', title: 'Dune' },
  { hash: 'b', title: 'Emma' },
  { hash: 'c', title: 'Gone', deletedAt: 1 },
] as Book[];

beforeEach(() => {
  Object.values(client).forEach((fn) => fn.mockReset());
  client.fetchProfiles.mockResolvedValue({ hasPin: false, profiles: [{ id: KID, name: 'Kid' }] });
});
afterEach(() => {
  cleanup();
  setActiveProfileId(null);
  setSessionPin('');
  localStorage.clear();
});

describe('ProfilesDialog (master)', () => {
  it('adds a profile and shows it', async () => {
    client.createProfile.mockResolvedValue({ id: 'new', name: 'Teen' });
    render(<ProfilesDialog books={books} onClose={() => {}} />);
    await screen.findByText('Kid');

    client.fetchProfiles.mockResolvedValue({
      hasPin: false,
      profiles: [
        { id: KID, name: 'Kid' },
        { id: 'new', name: 'Teen' },
      ],
    });
    fireEvent.change(screen.getByLabelText('New profile name'), { target: { value: 'Teen' } });
    fireEvent.click(screen.getByText('Add profile'));
    await screen.findByText('Teen');
    expect(client.createProfile).toHaveBeenCalledWith('Teen', '');
  });

  it("saves the books a profile can see, listing only the library's live books", async () => {
    client.fetchProfileBooks.mockResolvedValue(['a']);
    client.setProfileBooks.mockResolvedValue(undefined);
    render(<ProfilesDialog books={books} onClose={() => {}} />);
    await screen.findByText('Kid');
    fireEvent.click(screen.getByText('Books'));
    await screen.findByText('Dune');
    expect(screen.queryByText('Gone')).toBeNull();
    const [dune, emma] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(dune!.checked).toBe(true);
    expect(emma!.checked).toBe(false);
    fireEvent.click(emma!);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(client.setProfileBooks).toHaveBeenCalledWith(KID, ['a', 'b'], ''));
  });

  it('asks for the PIN first when one is set and sends it with later changes', async () => {
    client.fetchProfiles.mockResolvedValue({ hasPin: true, profiles: [{ id: KID, name: 'Kid' }] });
    client.verifyProfilePin.mockImplementation(
      async (_id: string | null, pin: string) => pin === '4821',
    );
    client.deleteProfile.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProfilesDialog books={books} onClose={() => {}} />);

    fireEvent.change(await screen.findByLabelText('Master PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('Wrong PIN.');
    fireEvent.change(screen.getByLabelText('Master PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('Kid');
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(client.deleteProfile).toHaveBeenCalledWith(KID, '4821'));
  });
});

describe('ProfilesDialog PINs', () => {
  const state = {
    hasPin: true,
    profiles: [
      { id: KID, name: 'Kid', hasPin: true },
      { id: 'teen', name: 'Teen', hasPin: false },
    ],
  };

  it('gives a profile its own 4-digit PIN, sent with the master PIN', async () => {
    client.fetchProfiles.mockResolvedValue({
      hasPin: true,
      profiles: [{ id: KID, name: 'Kid', hasPin: false }],
    });
    client.verifyProfilePin.mockResolvedValue(true);
    client.setPin.mockResolvedValue(undefined);
    render(<ProfilesDialog books={books} onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Master PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByText('Unlock'));

    await screen.findByText('Kid');
    fireEvent.click(screen.getAllByText('Set PIN')[0]!);
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Save'));
    await screen.findByText('The PIN must be 4 digits.');
    expect(client.setPin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '2222' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(client.setPin).toHaveBeenCalledWith('2222', '4821', KID));
  });

  it('lets the main profile open a profile without asking for its PIN', async () => {
    client.fetchProfiles.mockResolvedValue({ ...state, hasPin: false });
    render(<ProfilesDialog books={books} onClose={() => {}} />);
    await screen.findByText('Kid');
    fireEvent.click(screen.getAllByText('Switch')[0]!);
    expect(client.switchProfile).toHaveBeenCalledWith(KID);
    expect(client.verifyProfilePin).not.toHaveBeenCalled();
  });

  describe('inside a profile', () => {
    beforeEach(() => {
      setActiveProfileId('teen');
      client.getCachedProfiles.mockReturnValue(state);
    });

    it("asks for a profile's own PIN before opening it, and refuses a wrong one", async () => {
      client.verifyProfilePin.mockImplementation(
        async (_id: string | null, pin: string) => pin === '2222',
      );
      render(<ProfilesDialog books={books} onClose={() => {}} />);
      await screen.findByText('You are using the profile Teen.');
      expect(screen.queryByText('Add profile')).toBeNull();

      fireEvent.click(screen.getAllByText('Switch')[1]!);
      fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '9999' } });
      fireEvent.click(screen.getByText('Open'));
      await screen.findByText('Wrong PIN.');
      expect(client.switchProfile).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2222' } });
      fireEvent.click(screen.getByText('Open'));
      await waitFor(() => expect(client.switchProfile).toHaveBeenCalledWith(KID));
      expect(client.verifyProfilePin).toHaveBeenLastCalledWith(KID, '2222');
    });

    it('asks for the master PIN to go back to the main profile', async () => {
      client.verifyProfilePin.mockResolvedValue(true);
      render(<ProfilesDialog books={books} onClose={() => {}} />);
      await screen.findByText('You are using the profile Teen.');
      fireEvent.click(screen.getAllByText('Switch')[0]!);
      fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1111' } });
      fireEvent.click(screen.getByText('Open'));
      await waitFor(() => expect(client.switchProfile).toHaveBeenCalledWith(null));
      expect(client.verifyProfilePin).toHaveBeenLastCalledWith(null, '1111');
    });

    it('switches straight to a profile that has no PIN', async () => {
      setActiveProfileId(KID);
      client.getCachedProfiles.mockReturnValue(state);
      render(<ProfilesDialog books={books} onClose={() => {}} />);
      await screen.findByText('You are using the profile Kid.');
      fireEvent.click(screen.getAllByText('Switch')[1]!);
      expect(client.switchProfile).toHaveBeenCalledWith('teen');
      expect(client.verifyProfilePin).not.toHaveBeenCalled();
    });
  });
});
