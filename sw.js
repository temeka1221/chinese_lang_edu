// Служебный воркер: курс открывается без сети.
// Страницы, код и данные берутся из сети, копия ложится в кэш и отдается, когда сети нет.
// Записи и контуры черт не меняются, поэтому они сразу берутся из кэша.
const CACHE = 'zh-course-v1';
const FIXED = /\/data\/(?:audio\/(?:syl|word)|hanzi)\/[^/]+\.(?:mp3|json)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(FIXED.test(url.pathname) ? fixed(request, url) : fresh(request, url));
});

// Ключ кэша — путь без параметров: sheets.html?lesson=02 и sheets.html хранятся одной записью.
async function fresh(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) cache.put(url.pathname, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(url.pathname)
      ?? (url.pathname.endsWith('/') ? await cache.match(`${url.pathname}index.html`) : undefined);
    if (cached) return cached;
    throw error;
  }
}

// Из сети файл берется целиком, без Range: частичный ответ в кэш положить нельзя.
async function fixed(request, url) {
  const cache = await caches.open(CACHE);
  let response = await cache.match(url.pathname);
  if (!response) {
    response = await fetch(url.pathname);
    if (response.ok) cache.put(url.pathname, response.clone());
  }
  return ranged(request, response);
}

// Плееру, особенно в Safari, на запрос с Range нужен ответ 206 с нужным куском файла.
async function ranged(request, response) {
  const range = /^bytes=(\d+)-(\d*)/.exec(request.headers.get('range') ?? '');
  if (!range || !response.ok) return response;
  const body = await response.arrayBuffer();
  const from = Number(range[1]);
  const to = Math.min(range[2] ? Number(range[2]) : Infinity, body.byteLength - 1);
  return new Response(body.slice(from, to + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Range': `bytes ${from}-${to}/${body.byteLength}`,
      'Content-Length': String(to - from + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
