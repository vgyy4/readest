import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Nothing secret belongs in the repository: it is public, and so is its history. This looks for
// the shapes of the secrets this project handles (Cloudflare Access service tokens, private
// keys) in every tracked file, so one cannot be committed by accident.
const root = join(process.cwd(), '../..');

const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split('\0')
    .filter(Boolean)
    .filter(
      (file) =>
        !/\.(png|jpe?g|gif|ico|icns|woff2?|ttf|otf|wasm|zip|gz|epub|mobi|pdf|m4b|mp3|db|bin)$/i.test(
          file,
        ),
    )
    .filter((file) => !file.startsWith('packages/')); // third-party submodules

const SECRET_SHAPES: [string, RegExp][] = [
  ['a Cloudflare Access service token secret', /\bcfast_[A-Za-z0-9]{20,}/],
  ['a Cloudflare Access client id', /\b[0-9a-f]{32}\.access\b/],
  ['a private key', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];

describe('the repository', () => {
  it('holds no Cloudflare Access service token and no private key', () => {
    const found: string[] = [];
    for (const file of trackedFiles()) {
      let text: string;
      try {
        text = readFileSync(join(root, file), 'utf8');
      } catch {
        continue; // removed in the working tree, or not readable
      }
      for (const [label, shape] of SECRET_SHAPES) {
        if (shape.test(text)) found.push(`${file}: ${label}`);
      }
    }
    expect(found).toEqual([]);
  });
});
