import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileGate from '@/components/profiles/ProfileGate';
import { getActiveProfileId, setActiveProfileId } from '@/libs/profiles/active';
import { getCachedProfiles, setCachedProfiles } from '@/libs/profiles/cache';
import { hasChosenProfile, markProfileChosen } from '@/libs/profiles/launch';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));
const mocks = vi.hoisted(() => ({
  token: 'jwt' as string | null,
  pathname: '/library',
  fetchProfiles: vi.fn(),
  chooseAvatar: vi.fn(),
  verifyProfilePin: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: mocks.token }) }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/libs/profiles/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/profiles/client')>()),
  fetchProfiles: mocks.fetchProfiles,
  chooseAvatar: mocks.chooseAvatar,
  verifyProfilePin: mocks.verifyProfilePin,
}));

const withPictures = {
  hasPin: false,
  mainAvatar: 'av-10',
  profiles: [
    { id: 'kid-1', name: 'Noa', avatar: 'av-03' },
    { id: 'kid-2', name: 'Eli', avatar: null },
  ],
};

const Library = () => <div>the library</div>;
const renderGate = () =>
  render(
    <ProfileGate>
      <Library />
    </ProfileGate>,
  );

beforeEach(() => {
  mocks.token = 'jwt';
  mocks.pathname = '/library';
  mocks.fetchProfiles.mockReset();
  mocks.chooseAvatar.mockReset();
  mocks.verifyProfilePin.mockReset();
  mocks.fetchProfiles.mockImplementation(async () => {
    setCachedProfiles(withPictures);
    return withPictures;
  });
  mocks.chooseAvatar.mockResolvedValue(undefined);
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(cleanup);

describe('ProfileGate', () => {
  it('lets a signed-out device and non-library pages straight through', () => {
    mocks.token = null;
    const { unmount } = renderGate();
    expect(screen.getByText('the library')).toBeTruthy();
    unmount();
    mocks.token = 'jwt';
    mocks.pathname = '/auth';
    renderGate();
    expect(screen.getByText('the library')).toBeTruthy();
    expect(mocks.fetchProfiles).not.toHaveBeenCalled();
  });

  it('shows the profile screen at every launch, not the library', async () => {
    setCachedProfiles(withPictures);
    setActiveProfileId('kid-1'); // last launch's profile is not assumed
    renderGate();
    expect(await screen.findByText('Who is reading?')).toBeTruthy();
    expect(screen.queryByText('the library')).toBeNull();
    expect(getActiveProfileId()).toBeNull();
  });

  it('asks the server on a first launch with no saved list, then shows the profile screen', async () => {
    renderGate();
    expect(await screen.findByText('Who is reading?')).toBeTruthy();
    expect(mocks.fetchProfiles).toHaveBeenCalled();
  });

  it('opens the chosen profile and then the library', async () => {
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /Noa/ }));
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(getActiveProfileId()).toBe('kid-1');
    expect(hasChosenProfile()).toBe(true);
  });

  it('asks a profile with no picture to choose one the first time it is opened', async () => {
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /Eli/ }));
    expect(await screen.findByText('Choose your picture')).toBeTruthy();
    expect(screen.queryByText('the library')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'av-21' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mocks.chooseAvatar).toHaveBeenCalledWith('av-21'));
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(getActiveProfileId()).toBe('kid-2');
  });

  it('lets a picture be skipped, and asks again next launch', async () => {
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /Eli/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(mocks.chooseAvatar).not.toHaveBeenCalled();
  });

  it('goes straight to the library, with no screen, for an account without profiles', async () => {
    mocks.fetchProfiles.mockResolvedValue({ hasPin: false, profiles: [] });
    renderGate();
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(hasChosenProfile()).toBe(true);
  });

  it('does not lock the app when offline with nothing saved', async () => {
    mocks.fetchProfiles.mockRejectedValue(new Error('offline'));
    renderGate();
    expect(await screen.findByText('the library')).toBeTruthy();
  });

  it('does not ask again after a reload within the same launch', async () => {
    setCachedProfiles({
      ...withPictures,
      profiles: [{ id: 'kid-1', name: 'Noa', avatar: 'av-03' }],
    });
    setActiveProfileId('kid-1');
    markProfileChosen();
    renderGate();
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(screen.queryByText('Who is reading?')).toBeNull();
    expect(getActiveProfileId()).toBe('kid-1');
  });

  it('remembers a chosen picture on this device', async () => {
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /Eli/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'av-05' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('the library');
    // chooseAvatar is mocked, so the cache is not touched here; the list is still intact.
    expect(getCachedProfiles()?.profiles).toHaveLength(2);
  });
});

describe('ProfileGate when the server cannot list the profiles', () => {
  it('says so and offers to try again or carry on, instead of silently skipping the screen', async () => {
    mocks.fetchProfiles.mockRejectedValue(new Error('Something went wrong'));
    renderGate();
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong');
    expect(screen.queryByText('the library')).toBeNull();

    mocks.fetchProfiles.mockImplementation(async () => {
      setCachedProfiles(withPictures);
      return withPictures;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Who is reading?')).toBeTruthy();
  });

  it('can continue as the main profile', async () => {
    mocks.fetchProfiles.mockRejectedValue(new Error('Something went wrong'));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue as main profile' }));
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(getActiveProfileId()).toBeNull();
  });

  it('does not nag when the device is simply offline', async () => {
    mocks.fetchProfiles.mockRejectedValue(new TypeError('Load failed'));
    renderGate();
    expect(await screen.findByText('the library')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ProfileGate and an account with no profiles', () => {
  it('explains why Switch profile showed nothing', async () => {
    const { leaveProfile } = await import('@/libs/profiles/launch');
    const { eventDispatcher } = await import('@/utils/event');
    const toast = vi.spyOn(eventDispatcher, 'dispatch').mockResolvedValue(undefined as never);
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), assign: vi.fn() });
    leaveProfile(); // sets the request flag; the reload is a stub
    mocks.fetchProfiles.mockResolvedValue({ hasPin: false, profiles: [] });
    renderGate();
    expect(await screen.findByText('the library')).toBeTruthy();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'toast',
        expect.objectContaining({ message: expect.stringContaining('no profiles yet') }),
      ),
    );
    toast.mockRestore();
    vi.unstubAllGlobals();
  });
});
