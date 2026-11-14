/**
 * scrypt (RFC 7914) for checking a PIN against the hash the server stored, without a connection.
 * The server hashes PINs with Node's scrypt; browsers have PBKDF2 but not scrypt, so this is the
 * algorithm written out, tested against Node's own and the RFC's vectors. It yields now and then
 * so a slow device keeps responding while it works. (Little-endian machines only, which is
 * every device the app runs on.)
 */

export interface ScryptParams {
  /** CPU/memory cost, a power of two. */
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

/** What Node's `crypto.scrypt` uses unless told otherwise, and so what the server stores. */
export const SERVER_SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 } as const;

const pbkdf2Sha256 = async (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
): Promise<Uint8Array> => {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
};

const rotl = (a: number, b: number) => (a << b) | (a >>> (32 - b));

/** Salsa20/8 on the 16 words at `b[o..o+16]`, in place. */
const salsa8 = (b: Uint32Array, o: number, x: Uint32Array) => {
  for (let i = 0; i < 16; i++) x[i] = b[o + i]!;
  for (let i = 0; i < 4; i++) {
    x[4]! ^= rotl((x[0]! + x[12]!) | 0, 7);
    x[8]! ^= rotl((x[4]! + x[0]!) | 0, 9);
    x[12]! ^= rotl((x[8]! + x[4]!) | 0, 13);
    x[0]! ^= rotl((x[12]! + x[8]!) | 0, 18);
    x[9]! ^= rotl((x[5]! + x[1]!) | 0, 7);
    x[13]! ^= rotl((x[9]! + x[5]!) | 0, 9);
    x[1]! ^= rotl((x[13]! + x[9]!) | 0, 13);
    x[5]! ^= rotl((x[1]! + x[13]!) | 0, 18);
    x[14]! ^= rotl((x[10]! + x[6]!) | 0, 7);
    x[2]! ^= rotl((x[14]! + x[10]!) | 0, 9);
    x[6]! ^= rotl((x[2]! + x[14]!) | 0, 13);
    x[10]! ^= rotl((x[6]! + x[2]!) | 0, 18);
    x[3]! ^= rotl((x[15]! + x[11]!) | 0, 7);
    x[7]! ^= rotl((x[3]! + x[15]!) | 0, 9);
    x[11]! ^= rotl((x[7]! + x[3]!) | 0, 13);
    x[15]! ^= rotl((x[11]! + x[7]!) | 0, 18);
    x[1]! ^= rotl((x[0]! + x[3]!) | 0, 7);
    x[2]! ^= rotl((x[1]! + x[0]!) | 0, 9);
    x[3]! ^= rotl((x[2]! + x[1]!) | 0, 13);
    x[0]! ^= rotl((x[3]! + x[2]!) | 0, 18);
    x[6]! ^= rotl((x[5]! + x[4]!) | 0, 7);
    x[7]! ^= rotl((x[6]! + x[5]!) | 0, 9);
    x[4]! ^= rotl((x[7]! + x[6]!) | 0, 13);
    x[5]! ^= rotl((x[4]! + x[7]!) | 0, 18);
    x[11]! ^= rotl((x[10]! + x[9]!) | 0, 7);
    x[8]! ^= rotl((x[11]! + x[10]!) | 0, 9);
    x[9]! ^= rotl((x[8]! + x[11]!) | 0, 13);
    x[10]! ^= rotl((x[9]! + x[8]!) | 0, 18);
    x[12]! ^= rotl((x[15]! + x[14]!) | 0, 7);
    x[13]! ^= rotl((x[12]! + x[15]!) | 0, 9);
    x[14]! ^= rotl((x[13]! + x[12]!) | 0, 13);
    x[15]! ^= rotl((x[14]! + x[13]!) | 0, 18);
  }
  for (let i = 0; i < 16; i++) b[o + i] = (b[o + i]! + x[i]!) | 0;
};

/** BlockMix: `b` (32r words) becomes its mix, using `y` (32r words) as scratch. */
const blockMix = (b: Uint32Array, y: Uint32Array, r: number, x: Uint32Array) => {
  const words = 32 * r;
  // X = last block; for each block: X = Salsa(X xor B[i]); Y[i] = X.
  const t = new Uint32Array(16);
  for (let i = 0; i < 16; i++) t[i] = b[words - 16 + i]!;
  for (let i = 0; i < 2 * r; i++) {
    for (let j = 0; j < 16; j++) t[j]! ^= b[i * 16 + j]!;
    salsa8(t, 0, x);
    for (let j = 0; j < 16; j++) y[i * 16 + j] = t[j]!;
  }
  // Even blocks first, then odd.
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < 16; j++) b[i * 16 + j] = y[2 * i * 16 + j]!;
    for (let j = 0; j < 16; j++) b[(r + i) * 16 + j] = y[(2 * i + 1) * 16 + j]!;
  }
};

const YIELD_EVERY = 1024;
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const roMix = async (block: Uint32Array, N: number, r: number) => {
  const words = 32 * r;
  const v = new Uint32Array(words * N);
  const y = new Uint32Array(words);
  const x = new Uint32Array(16);
  for (let i = 0; i < N; i++) {
    v.set(block, i * words);
    blockMix(block, y, r, x);
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await breathe();
  }
  for (let i = 0; i < N; i++) {
    // Integerify: the first word of the last 64-byte block (N is a power of two).
    const j = block[(2 * r - 1) * 16]! & (N - 1);
    for (let k = 0; k < words; k++) block[k]! ^= v[j * words + k]!;
    blockMix(block, y, r, x);
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await breathe();
  }
};

export const scrypt = async (
  password: Uint8Array,
  salt: Uint8Array,
  { N, r, p, dkLen }: ScryptParams,
): Promise<Uint8Array> => {
  const blockBytes = 128 * r;
  const b = await pbkdf2Sha256(password, salt, 1, p * blockBytes);
  for (let i = 0; i < p; i++) {
    const part = new Uint32Array(blockBytes / 4);
    new Uint8Array(part.buffer).set(b.subarray(i * blockBytes, (i + 1) * blockBytes));
    await roMix(part, N, r);
    b.set(new Uint8Array(part.buffer), i * blockBytes);
  }
  return pbkdf2Sha256(password, b, 1, dkLen);
};

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)));

/** Is `pin` the one the server's `scrypt$<salt hex>$<hash hex>` was made from? */
export const verifyScryptPin = async (pin: string, stored: string): Promise<boolean> => {
  try {
    const [scheme, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex || !/^[0-9a-f]+$/i.test(saltHex + keyHex)) {
      return false;
    }
    const expected = fromHex(keyHex);
    if (expected.length !== SERVER_SCRYPT.dkLen) return false;
    const actual = await scrypt(new TextEncoder().encode(pin), fromHex(saltHex), SERVER_SCRYPT);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ actual[i]!;
    return diff === 0;
  } catch {
    return false;
  }
};
