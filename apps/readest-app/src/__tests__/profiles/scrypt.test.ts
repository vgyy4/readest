import { scryptSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { scrypt, verifyScryptPin } from '@/libs/profiles/scrypt';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('scrypt', () => {
  it('matches the RFC 7914 test vectors', async () => {
    // RFC 7914 section 12, first vector: P="", S="", N=16, r=1, p=1, dkLen=64.
    const out = await scrypt(new Uint8Array(), new Uint8Array(), { N: 16, r: 1, p: 1, dkLen: 64 });
    expect(hex(out)).toBe(
      '77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442' +
        'fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906',
    );
    // Second vector: P="password", S="NaCl", N=1024, r=8, p=16, dkLen=64.
    const second = await scrypt(
      new TextEncoder().encode('password'),
      new TextEncoder().encode('NaCl'),
      { N: 1024, r: 8, p: 16, dkLen: 64 },
    );
    expect(hex(second)).toBe(
      'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162' +
        '2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
    );
  });

  it('gives what Node gives for the parameters the server uses (N=16384, r=8, p=1)', async () => {
    const salt = randomBytes(16);
    const expected = scryptSync('4821', salt, 32);
    const got = await scrypt(new TextEncoder().encode('4821'), salt, {
      N: 16384,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    expect(hex(got)).toBe(expected.toString('hex'));
  }, 30_000);
});

describe('verifyScryptPin', () => {
  const stored = (pin: string) => {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`;
  };

  it('accepts the PIN a server hash was made from, and no other', async () => {
    const hash = stored('7305');
    expect(await verifyScryptPin('7305', hash)).toBe(true);
    expect(await verifyScryptPin('7306', hash)).toBe(false);
  }, 30_000);

  it('refuses anything that is not a scrypt hash in the server format', async () => {
    expect(await verifyScryptPin('1234', 'bcrypt$aa$bb')).toBe(false);
    expect(await verifyScryptPin('1234', 'scrypt$zz')).toBe(false);
    expect(await verifyScryptPin('1234', '')).toBe(false);
  });
});
