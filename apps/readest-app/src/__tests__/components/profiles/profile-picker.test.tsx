import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePicker from '@/components/profiles/ProfilePicker';
import { getSessionPin, setSessionPin } from '@/libs/profiles/session';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));
const verify = vi.hoisted(() => vi.fn());
vi.mock('@/libs/profiles/client', () => ({ checkProfilePin: verify }));

const state = {
  hasPin: true,
  mainAvatar: 'av-10',
  profiles: [
    { id: 'kid-1', name: 'Noa', avatar: 'av-03', hasPin: false },
    { id: 'kid-2', name: 'Eli', avatar: null, hasPin: true },
  ],
};

beforeEach(() => {
  verify.mockReset();
  setSessionPin('');
});
afterEach(cleanup);

const typePin = (value: string) =>
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value } });

describe('ProfilePicker', () => {
  it('shows the main profile and every profile with its picture', () => {
    render(<ProfilePicker state={state} onEnter={() => {}} />);
    expect(screen.getByText('Who is reading?')).toBeTruthy();
    for (const name of ['Main profile', 'Noa', 'Eli']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
    // A profile with a picture shows it; one without gets its first letter.
    expect(document.querySelectorAll('img').length).toBe(2);
    expect(screen.getByText('E')).toBeTruthy();
  });

  it('opens a profile with no PIN straight away', () => {
    const onEnter = vi.fn();
    render(<ProfilePicker state={state} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Noa/ }));
    expect(onEnter).toHaveBeenCalledWith('kid-1');
    expect(verify).not.toHaveBeenCalled();
  });

  it('asks a profile with a PIN for it, and opens on the right one', async () => {
    verify.mockResolvedValue('ok');
    const onEnter = vi.fn();
    render(<ProfilePicker state={state} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Eli/ }));
    expect(onEnter).not.toHaveBeenCalled();
    typePin('1234');
    await waitFor(() => expect(onEnter).toHaveBeenCalledWith('kid-2'));
    expect(verify).toHaveBeenCalledWith('kid-2', '1234');
  });

  it('stays put on a wrong PIN and says so', async () => {
    verify.mockResolvedValue('wrong');
    const onEnter = vi.fn();
    render(<ProfilePicker state={state} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Eli/ }));
    typePin('0000');
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong PIN.');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('says to connect once, rather than "Wrong PIN", when it cannot tell without a connection', async () => {
    verify.mockResolvedValue('offline-unknown');
    const onEnter = vi.fn();
    render(<ProfilePicker state={state} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Eli/ }));
    typePin('1234');
    const alert = (await screen.findByRole('alert')).textContent ?? '';
    expect(alert).toMatch(/No connection/);
    expect(alert).not.toMatch(/Wrong PIN/);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('keeps the master PIN for the session when the main profile is opened with it', async () => {
    verify.mockResolvedValue('ok');
    const onEnter = vi.fn();
    render(<ProfilePicker state={state} onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /Main profile/ }));
    typePin('4321');
    await waitFor(() => expect(onEnter).toHaveBeenCalledWith(null));
    expect(verify).toHaveBeenCalledWith(null, '4321');
    expect(getSessionPin()).toBe('4321');
  });

  it('can back out of the PIN screen', () => {
    render(<ProfilePicker state={state} onEnter={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Eli/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Who is reading?')).toBeTruthy();
  });
});
