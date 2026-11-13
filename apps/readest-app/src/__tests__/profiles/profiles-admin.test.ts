import { afterEach, describe, expect, it, vi } from 'vitest';
import { setActiveProfileId } from '@/libs/profiles/active';
import { isAdminMode, setAdminModeSetting } from '@/libs/profiles/admin';

const remember = (n: number) =>
  localStorage.setItem(
    'readest-profiles-cache',
    JSON.stringify({
      hasPin: false,
      profiles: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    }),
  );

afterEach(() => {
  localStorage.clear();
  setActiveProfileId(null);
});

describe('isAdminMode', () => {
  it('is off for an account with no profiles', () => {
    expect(isAdminMode()).toBe(false);
    remember(0);
    expect(isAdminMode()).toBe(false);
  });

  it('turns on by itself once the account has a profile', () => {
    remember(1);
    expect(isAdminMode()).toBe(true);
  });

  it('can be switched off or on by hand', () => {
    remember(1);
    setAdminModeSetting(false);
    expect(isAdminMode()).toBe(false);
    localStorage.clear();
    setAdminModeSetting(true);
    expect(isAdminMode()).toBe(true);
  });

  it('is never on inside a profile, which is for reading', () => {
    remember(2);
    setAdminModeSetting(true);
    setActiveProfileId('p0');
    expect(isAdminMode()).toBe(false);
  });
});

describe('opening a book as the admin', () => {
  const setup = async (admin: boolean) => {
    vi.resetModules();
    const dispatch = vi.fn();
    vi.doMock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
    if (admin) {
      remember(1);
    }
    const nav = await import('@/utils/nav');
    return { nav, dispatch };
  };

  it('shows who can see the book instead of opening the reader', async () => {
    const { nav, dispatch } = await setup(true);
    const router = { push: vi.fn() } as unknown as Parameters<typeof nav.navigateToReader>[0];
    nav.navigateToReader(router, ['abc']);
    expect(router.push).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('open-book-access', { bookHashes: ['abc'] });
  });

  it('still opens the reader for everyone else', async () => {
    const { nav, dispatch } = await setup(false);
    const router = { push: vi.fn() } as unknown as Parameters<typeof nav.navigateToReader>[0];
    nav.navigateToReader(router, ['abc']);
    expect(router.push).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
