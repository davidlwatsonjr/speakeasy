import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import vm from 'node:vm';

const ROOT = 'dist';
const ORIGIN = 'https://speakeasy.davidlwatsonjr.com';
function list(dir, relative = '') {
  return readdirSync(join(dir, relative), { withFileTypes: true })
    .flatMap(item => {
      const name = posix.join(relative, item.name);
      return item.isDirectory() ? list(dir, name) : item.isFile() ? [name] : [];
    });
}
const files = list(ROOT).filter(path => path !== 'sw.js' && path !== 'CNAME' && !path.startsWith('.')).sort();
const expected = files.map(path => '/' + path.split('/').map(encodeURIComponent).join('/'));
const available = new Set(expected);
const html = readFileSync(join(ROOT,'index.html'), 'utf8');
const sw = readFileSync(join(ROOT,'sw.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT,'manifest.webmanifest'), 'utf8'));

assert.match(sw, /const CACHE_REVISION = '[a-f0-9]{16}';/, 'Service worker must use a version-specific cache');
const urlsMatch = sw.match(/const PRECACHE_URLS = (\[[^\n]+\]);/);
assert.ok(urlsMatch, 'Built service worker must contain a complete precache list');
const urls = JSON.parse(urlsMatch[1]);
assert.deepEqual(urls, expected, 'Every published file must be included exactly once in the offline cache');

assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons) assert.ok(available.has(icon.src), `Missing manifest icon ${icon.src}`);
for (const letter of 'abcdefghijklmnopqrstuvwxyz') assert.ok(available.has(`/asl/${letter}.svg`), `Missing ASL ${letter}`);
assert.ok(available.has('/icons/apple-touch-icon.png'));
assert.ok(available.has('/icons/favicon-48.png'));
assert.ok(files.some(file => file.endsWith('.woff2')), 'Local self-hosted fonts are missing');

const styles = files.filter(path => path.endsWith('.css')).map(file => readFileSync(join(ROOT, file), 'utf8')).join('\n');
assert.match(styles, /DM Sans Variable/, 'DM Sans must be bundled locally');
assert.match(styles, /Outfit Variable/, 'Outfit must be bundled locally');
assert.doesNotMatch(styles, /@import\s+url\(['"]?https?:/i, 'CSS must not load remote stylesheets');
assert.doesNotMatch(styles, /url\(['"]?https?:/i, 'CSS must not load remote assets');
for (const file of files.filter(path => path.endsWith('.html'))) {
  const page = readFileSync(join(ROOT, file), 'utf8');
  assert.doesNotMatch(page, /<(?:script|img|iframe)\b[^>]*(?:src)=["'](?:https?:)?\/\//i, 'HTML must not load remote assets');
  assert.doesNotMatch(page, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](?:https?:)?\/\//i, 'HTML must not load remote stylesheets');
  assert.match(page, /<link rel="canonical" href="https:\/\/speakeasy\.davidlwatsonjr\.com\//, 'HTML needs a canonical URL');
  assert.match(page, /<h1>/, 'Each indexable page needs a pre-rendered heading');
}
for (const id of ['asl','braille','morse']) assert.ok(available.has('/learn/' + id + '.html'));
assert.ok(available.has('/robots.txt') && available.has('/sitemap.xml'));

const listeners = new Map();
const allCaches = new Map();
const getKey = request => {
  const value = typeof request === 'string' ? request : request.url;
  return new URL(value, ORIGIN).pathname;
};
const reply = (path, ok = true) => ({ok, path, clone() { return reply(this.path, this.ok); }});
let connected = true;
let skipped = false;
let claimed = false;
const fetchMock = async request => {
  if (!connected) throw new Error('Simulated airplane mode');
  const path = getKey(request);
  if (!available.has(path) && path !== '/') return reply(path, false);
  return reply(path);
};
function cacheFor(name) {
  if (!allCaches.has(name)) allCaches.set(name, new Map());
  const entries = allCaches.get(name);
  return {
    async addAll(paths) {
      for (const path of paths) assert.ok(available.has(getKey(path)), `Failed to install uncached ${path}`);
      for (const path of paths) entries.set(getKey(path), reply(path));
    },
    async put(request, response) { entries.set(getKey(request), response); },
    async match(request) { return entries.get(getKey(request)); },
  };
}
const cachesMock = {
  open: async name => cacheFor(name),
  keys: async () => [...allCaches.keys()],
  delete: async name => allCaches.delete(name),
  async match(request) {
    for (const entries of allCaches.values()) {
      const response = entries.get(getKey(request));
      if (response) return response;
    }
  },
};
const self = {
  location: {origin: ORIGIN},
  addEventListener(type, listener) { listeners.set(type, listener); },
  async skipWaiting() { skipped = true; },
  clients: { async claim() { claimed = true; } },
};
class FakeResponse {
  constructor(body, {status = 200} = {}) { this.body = body; this.status = status; this.ok = status >= 200 && status < 300; }
  static error() { return new FakeResponse('', {status: 503}); }
  clone() { return new FakeResponse(this.body, {status:this.status}); }
}
vm.runInNewContext(sw, {self, caches:cachesMock, fetch:fetchMock, URL, Response:FakeResponse});
for (const name of ['install','activate','fetch']) assert.ok(listeners.has(name), `Missing SW ${name} listener`);
async function lifecycle(name) {
  const pending = [];
  listeners.get(name)({waitUntil(promise) {pending.push(promise);}});
  await Promise.all(pending);
}
allCaches.set('speakeasy-app-v1', new Map());
allCaches.set('unrelated-app-cache', new Map());
await lifecycle('install');
await lifecycle('activate');
assert.ok(skipped && claimed, 'Service worker must immediately claim clients');
assert.ok(!allCaches.has('speakeasy-app-v1'), 'Old SpeakEasy cache should be removed');
assert.ok(allCaches.has('unrelated-app-cache'), 'Unrelated caches must be preserved');

connected = false;
async function offlineGet(path, mode) {
  const request = { url: ORIGIN + path, method: 'GET', mode };
  const background = [];
  let responsePromise;
  listeners.get('fetch')({
    request,
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { background.push(promise); },
  });
  assert.ok(responsePromise, `Fetch was not intercepted: ${path}`);
  const response = await responsePromise;
  assert.ok(response.ok, `Failed airplane-mode fetch for ${path}`);
  await Promise.all(background);
  return response;
}
await offlineGet('/', 'navigate');
await offlineGet('/index.html', 'navigate');
assert.equal((await offlineGet('/?course=braille', 'navigate')).path, '/index.html');
for (const id of ['asl','braille','morse']) {
  const page = '/learn/' + id + '.html';
  assert.equal((await offlineGet(page, 'navigate')).path, page, 'Guide must not resolve to the app shell');
}
await offlineGet('/manifest.webmanifest', 'same-origin');
await offlineGet('/icons/icon-192.png', 'same-origin');
await offlineGet('/icons/maskable-512.png', 'same-origin');
await offlineGet('/asl/a.svg', 'same-origin');
await offlineGet('/asl/j.svg', 'same-origin');
await offlineGet('/asl/z.svg', 'same-origin');
for (const ext of ['.js','.css','.woff2']) {
  const asset = expected.find(path => path.endsWith(ext));
  assert.ok(asset, `Expected built ${ext} asset`);
  await offlineGet(asset, 'same-origin');
}
console.log(`Offline verified: ${urls.length} local assets precached, root and standalone navigation, JS/CSS/fonts, icons, and ASL signs work with fetch disabled.`);
