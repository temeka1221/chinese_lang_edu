// Копия курса на устройстве: страницы, код, данные и записи кладутся в кэш, из которого их отдает sw.js.
const CACHE = 'zh-course-v1'; // то же имя, что в sw.js
const KEY = 'zh-course-offline';
const FIXED = /\/data\/(?:audio\/(?:syl|word)|hanzi)\/[^/]+\.(?:mp3|json)$/; // записи и контуры черт не меняются
const root = new URL('../', import.meta.url);

export const offlineSupported = 'caches' in window && 'serviceWorker' in navigator;

// Когда копия сохранена в последний раз (мс) или 0.
export const savedAt = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};

// Скачивает файлы из offline.json. Неизменные файлы, которые уже лежат в кэше, пропускаются.
export async function saveOffline(onProgress = () => {}) {
  const { files } = await (await fetch(new URL('offline.json', root), { cache: 'no-cache' })).json();
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const todo = files.map((f) => new URL(f, root)).filter((u) => !(FIXED.test(u.pathname) && have.has(u.pathname)));
  const total = todo.length;
  let done = 0;
  const worker = async () => {
    for (let u = todo.pop(); u; u = todo.pop()) {
      const response = await fetch(u, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${u.pathname}: ${response.status}`);
      await cache.put(u.pathname, response);
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  localStorage.setItem(KEY, Date.now());
}
