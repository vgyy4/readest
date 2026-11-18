#!/usr/bin/env node
/**
 * Makes the exported web app run in Safari 12 (iOS 12), after `next build`:
 *
 *  - every script is lowered to what Safari 12 understands (optional chaining, nullish coalescing,
 *    class fields, ...) and regular expressions it cannot parse (lookbehind) become `new RegExp(...)`
 *    so they only fail if they are ever used, not when the file is read;
 *  - the style sheets lose what Safari 12 would throw a whole rule away for (`:where()`, `:is()`),
 *    get a replacement for `aspect-ratio`, and `dvh` becomes `vh`;
 *  - the standard library features it lacks are loaded before anything else (core-js and a few web
 *    APIs: <dialog>, ResizeObserver, Blob.arrayBuffer, ...).
 *
 * Usage: node scripts/legacy-ios12.mjs [outDir]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(root, process.argv[2] ?? 'out');
const TARGET = 'safari12';
// esbuild cannot lower destructuring, and flags it for Safari 12 only because of a rare bug there in
// destructuring inside parameter defaults; the syntax itself works, so it is declared supported.
const SUPPORTED = { destructuring: true };

const require = createRequire(import.meta.url);

/** The package from the app's node_modules, or from the pnpm store (it is a dependency of others). */
const locate = (name) => {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    // Not a direct dependency: look in the workspace's pnpm store.
  }
  for (let dir = root; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const store = path.join(dir, 'node_modules', '.pnpm');
    if (!fs.existsSync(store)) continue;
    const match = fs
      .readdirSync(store)
      .filter((entry) => entry.startsWith(`${name}@`))
      .sort()
      .pop();
    if (match) return path.join(store, match, 'node_modules', name);
  }
  throw new Error(`Cannot find ${name}`);
};

const esbuild = require(locate('esbuild'));
const coreJsModules = path.dirname(locate('core-js'));

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

// ---------------------------------------------------------------------------------------------
// Scripts

const lowerScript = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  try {
    const { code } = esbuild.transformSync(source, {
      loader: 'js',
      target: TARGET,
      supported: SUPPORTED,
      minify: true,
      legalComments: 'none',
      logLevel: 'silent',
      charset: 'utf8',
    });
    fs.writeFileSync(file, code);
    return true;
  } catch (error) {
    // Something that cannot be lowered (top-level await in a library the legacy build can do without).
    console.warn(`  left as it is: ${path.relative(outDir, file)} (${String(error.message).split('\n')[0]})`);
    return false;
  }
};

// ---------------------------------------------------------------------------------------------
// Style sheets

/** Splits a selector list at its top-level commas. */
const splitSelectors = (list) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
};

/** `aspect-ratio: A / B` (or `A`) as the height over the width, in percent; null when it is `auto`. */
const ratioPercent = (value) => {
  const match = /^(?:auto\s+)?(-?[\d.]+)\s*(?:\/\s*(-?[\d.]+))?$/.exec(value.trim());
  if (!match) return null;
  const width = parseFloat(match[1]);
  const height = match[2] ? parseFloat(match[2]) : 1;
  if (!(width > 0) || !(height > 0)) return null;
  return +((height / width) * 100).toFixed(4);
};

/**
 * Safari 12 has no `aspect-ratio`: a box without a height would collapse. The old trick instead: an
 * empty first child whose top padding (a percentage of the width) is the height.
 */
const aspectRatioFallbacks = (css) => {
  const extra = [];
  const rule = /([^{}@]+)\{([^{}]*?aspect-ratio:([^;{}]+)[^{}]*)\}/g;
  let match = rule.exec(css);
  while (match) {
    const percent = ratioPercent(match[3]);
    if (percent !== null) {
      for (const selector of splitSelectors(match[1])) {
        if (selector.includes('::') || selector.includes(':-webkit-any')) continue;
        extra.push(
          `${selector}::before{content:"";float:left;padding-top:${percent}%}` +
            `${selector}::after{content:"";display:block;clear:both}`,
        );
      }
    }
    match = rule.exec(css);
  }
  return extra.length ? `@supports not (aspect-ratio:1/1){${extra.join('')}}` : '';
};

const lowerStyles = (file) => {
  let css = fs.readFileSync(file, 'utf8');
  // Safari 12 drops a whole rule for a selector it does not know. `:-webkit-any()` is `:is()` with
  // a different name (the specificity differs a little, which is fine for these).
  css = css.replace(/:where\(/g, ':-webkit-any(').replace(/:is\(/g, ':-webkit-any(');
  // The viewport units for toolbars that come and go (Safari 15.4) are the plain ones here.
  css = css.replace(/(-?[\d.]+)(?:d|s|l)v(h|w|min|max)\b/g, '$1v$2');
  const fallbacks = aspectRatioFallbacks(css);
  try {
    css = esbuild.transformSync(css, {
      loader: 'css',
      target: TARGET,
      minify: true,
      legalComments: 'none',
      logLevel: 'silent',
    }).code;
  } catch (error) {
    console.warn(`  style sheet not lowered: ${path.relative(outDir, file)} (${String(error.message).split('\n')[0]})`);
  }
  fs.writeFileSync(file, css + fallbacks);
};

// ---------------------------------------------------------------------------------------------
// Polyfills, loaded first on every page

const buildPolyfills = () => {
  const outfile = path.join(outDir, 'legacy-polyfills.js');
  esbuild.buildSync({
    entryPoints: [path.join(here, 'legacy-ios12-polyfills-entry.js')],
    bundle: true,
    minify: true,
    target: TARGET,
    supported: SUPPORTED,
    format: 'iife',
    outfile,
    nodePaths: [coreJsModules],
    logLevel: 'silent',
  });
  return outfile;
};

const injectPolyfills = (file) => {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('legacy-polyfills.js')) return;
  const tag = '<script src="/legacy-polyfills.js"></script>';
  const head = /<head[^>]*>/i.exec(html);
  const patched = head
    ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length)
    : tag + html;
  fs.writeFileSync(file, patched);
};

// ---------------------------------------------------------------------------------------------

if (!fs.existsSync(outDir)) {
  console.error(`No ${outDir}: run the build first.`);
  process.exit(1);
}

const files = walk(outDir);
const scripts = files.filter((f) => /\.(m?js)$/.test(f) && !f.endsWith('legacy-polyfills.js'));
const styles = files.filter((f) => f.endsWith('.css'));
const pages = files.filter((f) => f.endsWith('.html'));

console.log(`Legacy iOS 12: ${scripts.length} scripts, ${styles.length} style sheets, ${pages.length} pages`);
let lowered = 0;
for (const file of scripts) if (lowerScript(file)) lowered++;
styles.forEach(lowerStyles);
const polyfills = buildPolyfills();
pages.forEach(injectPolyfills);
console.log(
  `  scripts lowered: ${lowered}/${scripts.length}; polyfills: ${(fs.statSync(polyfills).size / 1024).toFixed(0)} KB`,
);
