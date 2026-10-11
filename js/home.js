// Главная: продолжение курса, карта уроков, перенос и сброс прогресса.
import { loadChars, loadLessons } from './data.js';
import { dueCards, exportProgress, importProgress, load, reset } from './progress.js';
import { h, initPage, pageUrl, plural } from './ui.js';

initPage();

const [lessons, chars] = await Promise.all([loadLessons(), loadChars()]);
const state = load();
const due = dueCards(state).length;
const next = lessons.find((l) => !state.lessons[l.id]?.done);
const hours = Math.round(lessons.reduce((sum, l) => sum + l.minutes, 0) / 60);
const total = Object.keys(chars).length;

document.querySelector('[data-stats]').textContent =
  `${lessons.length} ${plural(lessons.length, 'урок', 'урока', 'уроков')} · ${total} ${plural(total, 'иероглиф', 'иероглифа', 'иероглифов')} в карточках · около ${hours} часов занятий`;

document.querySelector('[data-continue]').append(
  next
    ? h('a', { class: 'btn primary', href: pageUrl(next.file) }, next.id === '00' ? 'Начать с урока 0' : `Продолжить: урок ${Number(next.id)}`)
    : h('span', { class: 'done-note' }, 'Все уроки этапа пройдены!'),
  h('a', { class: 'btn', href: pageUrl('review.html') }, due ? `Повторение: ${due} ${plural(due, 'карточка', 'карточки', 'карточек')}` : 'Повторение'),
  h('a', { class: 'btn', href: pageUrl('dictionary.html') }, 'Словарь'),
);

const map = document.querySelector('[data-map]');
let list;
for (const l of lessons) {
  if (l.id === lessons.find((x) => x.module === l.module).id) {
    list = h('ol', { class: 'lesson-list' });
    map.append(h('div', { class: 'module' }, h('h3', {}, `Модуль ${l.moduleNo}. ${l.module}`), list));
  }
  const st = state.lessons[l.id];
  list.append(h('li', { class: `lesson-item${st?.done ? ' done' : ''}` },
    h('a', { href: pageUrl(l.file) },
      h('span', { class: 'lesson-num', 'aria-label': st?.done ? 'пройден' : null }, st?.done ? '✓' : String(Number(l.id))),
      h('span', {}, h('span', { class: 'lesson-title' }, l.title), h('span', { class: 'lesson-about' }, l.about)),
      h('span', { class: 'lesson-time' }, `${l.minutes} мин${st?.score != null ? ` · ${Math.round(st.score * 100)}%` : ''}`))));
}

document.querySelector('[data-export]').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([exportProgress()], { type: 'application/json' }));
  h('a', { href: url, download: `kitajskij-progress-${new Date().toISOString().slice(0, 10)}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
document.body.append(picker);
document.querySelector('[data-import]').addEventListener('click', () => picker.click());
picker.addEventListener('change', async () => {
  const file = picker.files[0];
  picker.value = '';
  if (!file || !confirm('Загрузить прогресс из файла? Текущий прогресс в этом браузере заменится.')) return;
  try {
    importProgress(await file.text());
    location.reload();
  } catch (e) {
    alert(`Файл не загружен: ${e.message}.`);
  }
});

document.querySelector('[data-reset]').addEventListener('click', () => {
  if (confirm('Сбросить прогресс уроков и повторения в этом браузере?')) {
    reset();
    location.reload();
  }
});
