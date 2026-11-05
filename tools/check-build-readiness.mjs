/**
 * Reports whether the repo is ready to produce a real dev build.
 *
 * The point is to make the remaining blockers explicit instead of letting them
 * surface as an EAS error twenty minutes into a cloud build. Everything checkable
 * from the repo is checked here; the things that genuinely require an account
 * are named as such rather than guessed at.
 *
 * Run: npm run build:check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, readPngHeader, coverageRatio } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;

const problems = [];
const notes = [];
const ok = [];

/**
 * The mark should occupy a recognisable slice of the canvas. Too little means it
 * rendered off-canvas or collapsed; too much means the stroke or the background
 * bounds are wrong. Both look like a valid PNG.
 */
const MIN_COVERAGE = 0.03;
const MAX_COVERAGE = 0.75;

function checkAsset(label, relative, expect) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    problems.push(`${label}: ${relative} is missing (run: npm run assets)`);
    return;
  }
  const buf = fs.readFileSync(file);
  let image;
  try {
    image = decodePng(buf);
  } catch (error) {
    problems.push(`${label}: ${relative} is not a readable PNG (${error.message})`);
    return;
  }
  if (image.width !== expect.size || image.height !== expect.size) {
    problems.push(
      `${label}: ${relative} is ${image.width}x${image.height}, expected ${expect.size}x${expect.size}`,
    );
    return;
  }
  if (expect.alpha === false && image.hasAlpha) {
    problems.push(`${label}: ${relative} carries an alpha channel; App Store Connect rejects that`);
    return;
  }
  if (expect.alpha === true && !image.hasAlpha) {
    problems.push(`${label}: ${relative} has no alpha channel; it needs transparency`);
    return;
  }
  const coverage = coverageRatio(image);
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
    problems.push(
      `${label}: ${relative} covers ${(coverage * 100).toFixed(1)}% of the canvas, ` +
        `expected between ${MIN_COVERAGE * 100}% and ${MAX_COVERAGE * 100}% — the mark may not be rendering`,
    );
    return;
  }
  ok.push(
    `${label.padEnd(14)} ${relative}  ${image.width}x${image.height}  ` +
      `${image.hasAlpha ? 'alpha' : 'opaque'}  ${(coverage * 100).toFixed(0)}% covered`,
  );
}

console.log('DEEPER build readiness\n');

if (config.icon) {
  checkAsset('app icon', config.icon, { size: 1024, alpha: false });
} else {
  problems.push('app icon: expo.icon is not set');
}

const splash = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
if (!splash) {
  problems.push('splash: the expo-splash-screen config plugin is not registered');
} else if (!splash[1]?.image) {
  problems.push('splash: the plugin is registered with no image');
} else {
  checkAsset('splash', splash[1].image, { size: 512, alpha: true });
  if (!splash[1].backgroundColor) {
    problems.push('splash: no backgroundColor; the splash screen would default to white');
  }
}

const adaptive = config.android?.adaptiveIcon;
if (!adaptive?.foregroundImage) {
  problems.push('adaptive icon: android.adaptiveIcon.foregroundImage is not set');
} else {
  checkAsset('adaptive icon', adaptive.foregroundImage, { size: 1024, alpha: true });
}
if (adaptive && !adaptive.backgroundColor) {
  problems.push('adaptive icon: android.adaptiveIcon.backgroundColor is not set');
}

if (!config.ios?.bundleIdentifier) problems.push('ios.bundleIdentifier is not set');
if (!config.android?.package) problems.push('android.package is not set');
if (!fs.existsSync(path.join(ROOT, 'eas.json'))) {
  problems.push('eas.json is missing; EAS will have no build profiles to choose from');
}

const projectId = config.extra?.eas?.projectId;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!projectId) {
  problems.push('extra.eas.projectId is not set');
} else if (!UUID.test(projectId)) {
  notes.push(
    'extra.eas.projectId is still a placeholder. It cannot be generated offline —\n' +
      '   Expo assigns it server-side against a logged-in account. As the account owner:\n' +
      '       npx eas-cli@latest login\n' +
      '       npx eas-cli@latest init --force\n' +
      '   then commit the app.json it rewrites.',
  );
}

for (const line of ok) console.log(`  ok    ${line}`);
for (const line of notes) console.log(`  note  ${line}`);
for (const line of problems) console.log(`  FAIL  ${line}`);

console.log(
  problems.length > 0
    ? '\nNot ready — fix the FAIL lines above.'
    : notes.length > 0
      ? '\nAssets are good. The note above is the only thing left, and it needs your Expo account.'
      : '\nReady for a cloud build.',
);
process.exit(problems.length > 0 ? 1 : 0);
