import { invoke } from '@tauri-apps/api/core';

/** The web build holds the file in memory to hash it: above this it goes without a check. */
export const WEB_HASH_LIMIT = 200 * 1024 * 1024;

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** SHA-256 of a file on disk, read natively in pieces (a big audiobook is never held in memory). */
export const sha256OfPath = (path: string): Promise<string> =>
  invoke<string>('hash_file', { filePath: path });

/** SHA-256 of a Blob (the web build); null when the browser cannot, or the file is too big. */
export const sha256OfBlob = async (blob: Blob): Promise<string | null> => {
  if (blob.size > WEB_HASH_LIMIT || typeof crypto === 'undefined' || !crypto.subtle) return null;
  return toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
};

/** What a download is checked against and what came: the same text, whatever its case. */
export const sameSha256 = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
