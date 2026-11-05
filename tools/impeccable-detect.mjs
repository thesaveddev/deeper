#!/usr/bin/env node
/**
 * Runs the Impeccable design detector in full mode.
 *
 * The bundled detector imports htmlparser2 / css-select / css-tree / domutils with
 * bare specifiers. Those resolve relative to the skill directory, not to this
 * project, so on a clean machine the detector silently downgrades itself to regex
 * matching and reports a clean bill of health that it never actually earned:
 * custom properties, selector matching and computed contrast all go unevaluated.
 *
 * This wrapper registers a resolve hook that retries failed bare specifiers
 * against this project's node_modules, then delegates to the skill's detect.mjs
 * with the arguments passed through untouched.
 *
 *   node tools/impeccable-detect.mjs --json site/index.html site/styles.css
 */
import { createRequire, register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const SKILL = 'C:/Users/Opeyemi Olorunfemi/.agents/skills/impeccable';
const detectPath = path.join(SKILL, 'scripts', 'detect.mjs');
if (!fs.existsSync(detectPath)) {
  process.stderr.write(`Impeccable detector not found at ${detectPath}\n`);
  process.exit(1);
}

const projectRequire = createRequire(pathToFileURL(path.resolve('package.json')));
const missing = ['htmlparser2', 'css-select', 'css-tree', 'domutils'].filter(
  (name) => {
    try {
      projectRequire.resolve(name);
      return false;
    } catch {
      return true;
    }
  },
);
if (missing.length) {
  process.stderr.write(
    `Missing from node_modules: ${missing.join(', ')}\n` +
      'Run: npm install --no-save htmlparser2 css-select css-tree domutils\n',
  );
  process.exit(1);
}

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { createRequire } from 'node:module';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const projectRequire = createRequire(pathToFileURL(path.resolve(process.cwd(), 'package.json')));
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (err) {
          try {
            return { url: pathToFileURL(projectRequire.resolve(specifier)).href, shortCircuit: true };
          } catch {
            throw err;
          }
        }
      }
    `),
);

process.argv = [process.argv[0], detectPath, ...process.argv.slice(2)];
await import(pathToFileURL(detectPath).href);
