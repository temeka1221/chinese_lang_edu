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

// Слова из карточек, которые целиком состоят из знаков курса: Map «слово -> { pinyin, meaning, lesson }»
// в порядке уроков. Урок слова — тот, где изучен его последний знак.
export async function loadWords() {
  const chars = await loadChars();
  const words = new Map();
  for (const e of Object.values(chars)) {
    for (const [hz, pinyin, meaning] of e.words ?? []) {
      const parts = [...hz];
      if (words.has(hz) || chars[hz] || !parts.every((c) => chars[c])) continue;
      words.set(hz, { pinyin, meaning, lesson: parts.map((c) => chars[c].lesson).sort().at(-1) });
    }
  }
  return new Map([...words].sort(([, a], [, b]) => a.lesson.localeCompare(b.lesson)));
}

// Иероглифы урока в порядке chars.json.
export const charsOf = (chars, lessonId) => Object.keys(chars).filter((ch) => chars[ch].lesson === lessonId);
