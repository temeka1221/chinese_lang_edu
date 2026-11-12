// Прописи: лист для письма от руки по знакам урока или по любому набору знаков.
import { charsOf, loadChars, loadHanzi, loadLessons } from './data.js';
import { miniChar, strokesWord } from './hanzi.js';
import { h, initPage } from './ui.js';

initPage();

const COLS = 10; // клеток в строке
const TRACE = 4; // серых знаков для обводки после образца
const GUIDES = '<path class="sheet-guides" d="M150 0V300M0 150H300M0 0L300 300M300 0L0 300"/><rect class="sheet-box" x="1" y="1" width="298" height="298"/>';

const [lessons, chars] = await Promise.all([loadLessons(), loadChars()]);
const select = document.querySelector('[data-lesson]');
const input = document.querySelector('[data-chars]');
const note = document.querySelector('[data-note]');
const sheet = document.querySelector('[data-sheet]');

// Клетка с разметкой 米字格: образец, серый знак для обводки или пустая.
function cell(data, kind) {
  const svg = miniChar(data, kind === 'empty' ? { done: 0, ghost: false } : {});
  svg.insertAdjacentHTML('afterbegin', GUIDES);
  svg.classList.add('sheet-cell', kind);
  return svg;
}

function block(ch, data) {
  const e = chars[ch];
  const n = data.strokes.length;
  const kinds = (row) => Array.from({ length: COLS }, (_, i) => (row ? 'empty' : i === 0 ? 'solid' : i <= TRACE ? 'trace' : 'empty'));
  return h('section', { class: 'sheet-char' },
    h('div', { class: 'sheet-head' },
      h('b', { lang: 'zh-CN' }, ch), e ? ` ${e.pinyin} — ${e.meaning}` : '', h('span', {}, ` · ${n} ${strokesWord(n)}`)),
    h('div', { class: 'sheet-frames', 'aria-label': 'Порядок черт' },
      [...Array(n).keys()].map((i) => miniChar(data, { done: i, current: i, ghost: false }))),
    [0, 1].map((row) => h('div', { class: 'sheet-row' }, kinds(row).map((kind) => cell(data, kind)))));
}

let turn = 0;
async function render() {
  const my = ++turn;
  const list = [...new Set(input.value.match(/[㐀-䶿一-鿿]/g) ?? [])];
  const loaded = await Promise.all(list.map((ch) => loadHanzi(ch).catch(() => null)));
  if (my !== turn) return; // пока грузились контуры, набор знаков изменился
  const missing = list.filter((_, i) => !loaded[i]);
  note.textContent = !list.length ? 'В поле «Знаки» пока нет иероглифов.'
    : missing.length ? `Нет данных о чертах для знаков: ${missing.join(' ')}.` : '';
  const lesson = lessons.find((l) => l.id === select.value);
  sheet.replaceChildren(
    h('p', { class: 'sheet-title' }, `Китайский с нуля · прописи${lesson ? ` · урок ${Number(lesson.id)}. ${lesson.title}` : ''}`),
    ...list.map((ch, i) => loaded[i] && block(ch, loaded[i])).filter(Boolean));
}

const withChars = lessons.filter((l) => charsOf(chars, l.id).length);
select.append(...withChars.map((l) => h('option', { value: l.id }, `Урок ${Number(l.id)}. ${l.title}`)),
  h('option', { value: '' }, 'Свой набор знаков'));

const query = new URLSearchParams(location.search);
select.value = withChars.some((l) => l.id === query.get('lesson')) ? query.get('lesson') : withChars[0].id;
input.value = charsOf(chars, select.value).join('');

select.addEventListener('change', () => {
  if (select.value) input.value = charsOf(chars, select.value).join('');
  render();
});
input.addEventListener('input', () => {
  select.value = '';
  render();
});
document.querySelector('[data-print]').addEventListener('click', () => print());
render();
