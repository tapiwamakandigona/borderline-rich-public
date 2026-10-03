// F16 check: the hosted playtest build is one self-contained HTML file under 2 MB with a PWA manifest.
import { readFileSync, statSync } from 'node:fs';

const file = 'dist-single/index.html';
const fail = (msg) => { console.error(`check-single: FAIL — ${msg}`); process.exit(1); };
let size;
try { size = statSync(file).size; } catch { fail(`${file} missing — run npm run build:single`); }
const html = readFileSync(file, 'utf8');
const LIMIT = 2 * 1024 * 1024;
if (size >= LIMIT) fail(`${(size / 1048576).toFixed(2)} MB >= 2 MB`);
if (!/<link rel="manifest" href="data:application\/manifest\+json;base64,/.test(html)) fail('inline PWA manifest missing');
const external = [...html.matchAll(/(?:src|href)="(?!data:|https?:|#)([^"]+)"/g)].map((m) => m[1]);
if (external.length) fail(`relative asset references would not load when hosted: ${external.slice(0, 5).join(', ')}`);
if (html.includes('__BR')) fail('test hook leaked into the shipped build');
if (!html.includes('<script type="module"')) fail('app script not inlined');
console.log(`check-single: OK — ${(size / 1048576).toFixed(2)} MB, manifest inline, no relative assets, no test hook`);
