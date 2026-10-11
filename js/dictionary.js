// Словарь: все знаки этапа по урокам, поиск по знаку, пиньиню без тонов и значению.
import { charsOf, loadChars, loadLessons } from './data.js';
import { enableCharPopups, popupChar } from './hanzi.js';
import { h, initPage, pinyinHtml, plain } from './ui.js';

initPage();
enableCharPopups();

const [lessons, chars] = await Promise.all([loadLessons(), loadChars()]);
const input = document.querySelector('[data-search]');
const out = document.querySelector('[data-list]');
const norm = (s) => plain(s).toLowerCase().replace(/ü/g, 'u').replace(/\s+/g, '');

function render() {
  const raw = input.value.trim().toLowerCase();
  const q = norm(raw);
  const match = (ch) => !raw || ch === raw || norm(chars[ch].pinyin).startsWith(q) || chars[ch].meaning.toLowerCase().includes(raw);
  const sections = lessons.map((l) => {
    const list = charsOf(chars, l.id).filter(match);
    return list.length && h('section', {},
      h('h2', {}, `Урок ${Number(l.id)}. ${l.title}`),
      h('div', { class: 'tiles' }, list.map((ch) => h('button', { type: 'button', class: 'tile', onclick: () => popupChar(ch) },
        h('span', { class: 'tile-char', lang: 'zh-CN' }, ch),
        h('span', { class: 'tile-py', html: pinyinHtml(chars[ch].pinyin) }),
        h('span', { class: 'tile-ru' }, chars[ch].meaning)))));
  }).filter(Boolean);
  out.replaceChildren(...(sections.length ? sections : [h('p', { class: 'muted' }, 'Ничего не найдено.')]));
}

input.addEventListener('input', render);
render();
