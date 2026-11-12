// Прогресс хранится в localStorage этого браузера.
const KEY = 'zh-course-v1';
const DAY = 86_400_000;

// Коробки Лейтнера: через сколько дней карточка вернется из коробки 1, 2, 3, 4, 5.
export const INTERVALS = [1, 3, 7, 14, 30];
// Новые слова приходят в повторение понемногу.
export const NEW_WORDS_PER_DAY = 10;

const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // без хранилища прогресс живет до перезагрузки страницы
  }
}

export function load() {
  const s = read();
  s.lessons ??= {};
  s.cards ??= {};
  return s;
}

// Лучший результат практики урока в долях от 0 до 1.
export function saveScore(lessonId, score) {
  const s = load();
  const l = (s.lessons[lessonId] ??= {});
  l.score = Math.max(score, l.score ?? 0);
  write(s);
}

// Место чтения: номер раздела урока, на котором остановился читатель.
export function savePlace(lessonId, at) {
  const s = load();
  (s.lessons[lessonId] ??= {}).at = at;
  write(s);
}

// Урок пройден: его иероглифы попадают в первую коробку и вернутся завтра.
export function completeLesson(lessonId, chars, now = Date.now()) {
  const s = load();
  const l = (s.lessons[lessonId] ??= {});
  l.done = true;
  delete l.at;
  for (const ch of chars) s.cards[ch] ??= { box: 1, due: startOfDay(now) + DAY };
  write(s);
}

// Верный ответ переносит карточку в следующую коробку, ошибка возвращает в первую.
export function schedule(card, ok, now = Date.now()) {
  const box = ok ? Math.min((card?.box ?? 0) + 1, INTERVALS.length) : 1;
  return { box, due: startOfDay(now) + INTERVALS[box - 1] * DAY };
}

const introducedToday = (s, now) => (s.intro?.day === startOfDay(now) ? s.intro.n : 0);

// Слова пройденных уроков, которых еще нет в коробках. words — Map из loadWords(), порядок уроков сохраняется.
export const waitingWords = (words, s = load()) =>
  [...words.keys()].filter((w) => s.lessons[words.get(w).lesson]?.done && !s.cards[w]);

// Новые слова на сегодня: не больше NEW_WORDS_PER_DAY в день.
export const newWords = (words, s = load(), now = Date.now()) =>
  waitingWords(words, s).slice(0, Math.max(0, NEW_WORDS_PER_DAY - introducedToday(s, now)));

// Знаки попадают в коробки кнопкой «Урок пройден», слово — при первом ответе, и тогда оно идет в счет дня.
export function grade(key, ok, now = Date.now()) {
  const s = load();
  if (!s.cards[key]) s.intro = { day: startOfDay(now), n: introducedToday(s, now) + 1 };
  s.cards[key] = schedule(s.cards[key], ok, now);
  write(s);
}

export const dueCards = (s = load(), now = Date.now()) =>
  Object.keys(s.cards).filter((ch) => s.cards[ch].due <= now).sort((a, b) => s.cards[a].box - s.cards[b].box);

export function reset() {
  write({});
}

// Весь прогресс одной строкой JSON: для переноса на другое устройство или новый адрес сайта.
export const exportProgress = () => JSON.stringify(load());

export function importProgress(text) {
  let s;
  try {
    s = JSON.parse(text);
  } catch {
    s = null;
  }
  if (!s || typeof s !== 'object' || typeof s.lessons !== 'object' || typeof s.cards !== 'object') {
    throw new Error('это не файл прогресса курса');
  }
  write(s);
}
