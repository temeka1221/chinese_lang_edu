// Загрузка данных курса. Каждый файл читается один раз за страницу.
const base = new URL('../data/', import.meta.url);
const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(new URL(path, base)).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const loadCourse = () => load('course.json');
export const loadChars = () => load('chars.json');
export const loadStrokeTypes = () => load('stroke-types.json');
export const loadAudioIndex = () => load('audio/index.json');
export const loadHanzi = (ch) => load(`hanzi/${encodeURIComponent(ch)}.json`);

export const dataUrl = (path) => new URL(path, base).href;

// Плоский список уроков с названием модуля.
export async function loadLessons() {
  const course = await loadCourse();
  return course.modules.flatMap((m, i) => m.lessons.map((l) => ({ ...l, module: m.title, moduleNo: i + 1 })));
}

// Иероглифы урока в порядке chars.json.
export const charsOf = (chars, lessonId) => Object.keys(chars).filter((ch) => chars[ch].lesson === lessonId);
