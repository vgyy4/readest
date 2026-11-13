import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServerSettings from '@/app/auth/components/ServerSettings';
import { getStoredServer, saveServer, ServerCheckFailure } from '@/libs/serverConfig';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), discover: vi.fn() }));
vi.mock('@/utils/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }));
vi.mock('@/libs/serverConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/serverConfig')>()),
  discoverServer: mocks.discover,
}));

const server = {
  apiBaseUrl: 'https://books.example.com',
  supabaseUrl: 'https://books.example.com',
  supabaseAnonKey: 'anon',
};

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.signOut.mockResolvedValue({});
  mocks.discover.mockReset();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const open = () => fireEvent.click(screen.getByRole('button', { name: /Server:/ }));

describe('ServerSettings', () => {
  it('shows the Readest cloud by default and the chosen host once set', () => {
    const { unmount } = render(<ServerSettings />);
    expect(screen.getByText(/Server: Readest cloud/)).toBeTruthy();
    unmount();
    saveServer(server);
    render(<ServerSettings />);
    expect(screen.getByText(/Server: books.example.com/)).toBeTruthy();
  });

  it('connects: checks the server, signs out of the old one, stores it and applies it', async () => {
    mocks.discover.mockResolvedValue(server);
    const applied = vi.fn();
    render(<ServerSettings onApplied={applied} />);
    open();
    fireEvent.change(screen.getByPlaceholderText('books.example.com'), {
      target: { value: 'books.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(applied).toHaveBeenCalled());
    expect(mocks.discover).toHaveBeenCalledWith('books.example.com', {
      clientId: '',
      clientSecret: '',
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getStoredServer()).toEqual(server);
  });

  it('passes a Cloudflare Access token along', async () => {
    mocks.discover.mockResolvedValue(server);
    render(<ServerSettings onApplied={() => {}} />);
    open();
    fireEvent.change(screen.getByPlaceholderText('books.example.com'), {
      target: { value: 'books.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'id.access' } });
    fireEvent.change(screen.getByLabelText('Client secret'), { target: { value: 'sec' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(mocks.discover).toHaveBeenCalledWith('books.example.com', {
        clientId: 'id.access',
        clientSecret: 'sec',
      }),
    );
  });

  it('explains a failure and changes nothing', async () => {
    mocks.discover.mockRejectedValue(new ServerCheckFailure('not-readest'));
    const applied = vi.fn();
    render(<ServerSettings onApplied={applied} />);
    open();
    fireEvent.change(screen.getByPlaceholderText('books.example.com'), {
      target: { value: 'example.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'does not look like a Readest',
    );
    expect(applied).not.toHaveBeenCalled();
    expect(getStoredServer()).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('goes back to the Readest cloud', async () => {
    saveServer(server);
    const applied = vi.fn();
    render(<ServerSettings onApplied={applied} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Use Readest cloud' }));
    await waitFor(() => expect(applied).toHaveBeenCalled());
    expect(getStoredServer()).toBeNull();
  });
});
