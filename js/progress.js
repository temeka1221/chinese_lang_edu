// Прогресс хранится в localStorage этого браузера.
const KEY = 'zh-course-v1';
const DAY = 86_400_000;

// Коробки Лейтнера: через сколько дней карточка вернется из коробки 1, 2, 3, 4, 5.
export const INTERVALS = [1, 3, 7, 14, 30];

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

// Урок пройден: его иероглифы попадают в первую коробку и вернутся завтра.
export function completeLesson(lessonId, chars, now = Date.now()) {
  const s = load();
  (s.lessons[lessonId] ??= {}).done = true;
  for (const ch of chars) s.cards[ch] ??= { box: 1, due: startOfDay(now) + DAY };
  write(s);
}

// Верный ответ переносит карточку в следующую коробку, ошибка возвращает в первую.
export function schedule(card, ok, now = Date.now()) {
  const box = ok ? Math.min((card?.box ?? 0) + 1, INTERVALS.length) : 1;
  return { box, due: startOfDay(now) + INTERVALS[box - 1] * DAY };
}

export function grade(ch, ok, now = Date.now()) {
  const s = load();
  s.cards[ch] = schedule(s.cards[ch], ok, now);
  write(s);
}

export const dueCards = (s = load(), now = Date.now()) =>
  Object.keys(s.cards).filter((ch) => s.cards[ch].due <= now).sort((a, b) => s.cards[a].box - s.cards[b].box);

export function reset() {
  write({});
}
