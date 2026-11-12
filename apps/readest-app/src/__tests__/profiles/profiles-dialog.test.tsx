import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import ProfilesDialog from '@/app/library/components/ProfilesDialog';
import { setActiveProfileId } from '@/libs/profiles/active';

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
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  deleteProfile: vi.fn(),
  fetchProfileBooks: vi.fn(),
  setProfileBooks: vi.fn(),
  setMasterPin: vi.fn(),
  clearMasterPin: vi.fn(),
  verifyMasterPin: vi.fn(),
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
    client.verifyMasterPin.mockImplementation(async (pin: string) => pin === '4821');
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

describe('ProfilesDialog (inside a profile)', () => {
  it('lets a profile switch back to the main profile, behind the PIN', async () => {
    setActiveProfileId(KID);
    client.getCachedProfiles.mockReturnValue({
      hasPin: true,
      profiles: [{ id: KID, name: 'Kid' }],
    });
    client.verifyMasterPin.mockResolvedValue(true);
    render(<ProfilesDialog books={books} onClose={() => {}} />);

    fireEvent.change(await screen.findByLabelText('Master PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByText('Unlock'));
    await screen.findByText('You are using the profile Kid.');
    expect(screen.queryByText('Add profile')).toBeNull();
    fireEvent.click(screen.getByText('Switch'));
    expect(client.switchProfile).toHaveBeenCalledWith(null);
  });
});
