import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

// Enumerate *all* locally hosted files rather than assuming assets only live
// under dist/assets. This includes both app fonts and every ASL diagram.
function walk(root, relative = '') {
  return readdirSync(join(root, relative), { withFileTypes: true })
    .flatMap(entry => {
      const path = posix.join(relative, entry.name);
      return entry.isDirectory() ? walk(root, path) : entry.isFile() ? [path] : [];
    });
}
const root = 'dist';
const files = walk(root).filter(path => path !== 'sw.js' && path !== 'CNAME' && !path.startsWith('.')).sort();
if (!files.includes('index.html') || !files.includes('manifest.webmanifest'))
  throw new Error('Offline shell files are missing from dist/');

const urls = files.map(path => '/' + path.split('/').map(encodeURIComponent).join('/'));
const hash = createHash('sha256');
hash.update(readFileSync(join(root, 'sw.js')));
for (const path of files) {
  hash.update(path);
  hash.update(readFileSync(join(root, path)));
}
const revision = hash.digest('hex').slice(0, 16);
const swPath = join(root, 'sw.js');
let source = readFileSync(swPath, 'utf8');
if (!source.includes("const CACHE_REVISION = 'DEV';") || !source.includes('const PRECACHE_URLS = [];'))
  throw new Error('Service worker offline placeholders not found');
source = source
  .replace("const CACHE_REVISION = 'DEV';", `const CACHE_REVISION = '${revision}';`)
  .replace('const PRECACHE_URLS = [];', `const PRECACHE_URLS = ${JSON.stringify(urls)};`);
writeFileSync(swPath, source);
console.log(`Offline bundle: ${files.length} files, build ${revision}`);
