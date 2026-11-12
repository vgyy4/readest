import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export * from './shared';

const SCRYPT_KEYLEN = 32;

const scryptAsync = (pin: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pin, salt, SCRYPT_KEYLEN, (error, key) => (error ? reject(error) : resolve(key))),
  );

/** `scrypt$<salt hex>$<hash hex>`; salted, so equal PINs store differently. */
export const hashPin = async (pin: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
};

export const verifyPin = async (pin: string, stored: string): Promise<boolean> => {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = await scryptAsync(pin, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(actual, expected);
};
