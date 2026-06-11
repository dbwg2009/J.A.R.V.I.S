// Builds src/app.jsx → app.js (plain React.createElement calls, no JSX) and
// stamps a content-hash cache key into index.html's script tag.
// Usage: cd scripts && npm install && npm run build
import { transformFileSync } from '@babel/core';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const out = transformFileSync(path.join(root, 'src', 'app.jsx'), {
  presets: [['@babel/preset-react']],
  comments: false,
  compact: true,
  babelrc: false,
  configFile: false,
}).code;

writeFileSync(path.join(root, 'app.js'), out);

const hash = createHash('md5').update(out).digest('hex').slice(0, 8);
const htmlPath = path.join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const updated = html.replace(/app\.js\?v=[0-9a-f]+/g, `app.js?v=${hash}`);
if (!updated.includes(`app.js?v=${hash}`)) {
  throw new Error('index.html is missing the app.js?v=... script tag');
}
writeFileSync(htmlPath, updated);

console.log(`Built app.js (${(out.length / 1024).toFixed(1)} KB) — cache key v=${hash}`);
