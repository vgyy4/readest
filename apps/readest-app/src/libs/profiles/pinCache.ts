import type { ProfilesState } from './cache';

/**
 * PINs are checked by the server, so a profile with a PIN could not be opened without a
 * connection. After a PIN has been accepted once, this device keeps a salted hash of it (never the
 * PIN) and uses that when the server cannot be reached. It is a convenience lock for a 4-digit
 * code, not strong protection: anyone who can read this device's storage can guess 10,000 codes.
 */
const KEY = (profileId: string | null) => `readest-pin-check:${profileId ?? 'main'}`;
const PREFIX = 'readest-pin-check:';
const ITERATIONS = 50_000;

interface Remembered {
  v: 1;
  salt: string;
  hash: string;
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)));

const derive = async (pin: string, salt: Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
};

/** Keep what is needed to check `pin` again without the server. */
export const rememberPin = async (profileId: string | null, pin: string): Promise<void> => {
  try {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const entry: Remembered = { v: 1, salt: toHex(salt), hash: await derive(pin, salt) };
    localStorage.setItem(KEY(profileId), JSON.stringify(entry));
  } catch {
    // No crypto or storage: the profile simply cannot be opened offline.
  }
};

/** Does `pin` match the one remembered? `null` when none was remembered. */
export const matchesRememberedPin = async (
  profileId: string | null,
  pin: string,
): Promise<boolean | null> => {
  try {
    const raw = localStorage.getItem(KEY(profileId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Remembered;
    if (entry.v !== 1) return null;
    return (await derive(pin, fromHex(entry.salt))) === entry.hash;
  } catch {
    return null;
  }
};

export const forgetPin = (profileId: string | null): void => {
  try {
    localStorage.removeItem(KEY(profileId));
  } catch {
    // Nothing to forget.
  }
};

/** A PIN that was removed on the server must stop being asked for here. */
export const forgetPinsOfProfilesWithoutPin = (state: ProfilesState): void => {
  if (!state.hasPin) forgetPin(null);
  for (const profile of state.profiles) if (!profile.hasPin) forgetPin(profile.id);
  // Also drop entries of profiles that no longer exist.
  try {
    const known = new Set(state.profiles.map((p) => p.id));
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      if (id !== 'main' && !known.has(id)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable.
  }
};
