// Страница урока: шапка из course.json, карточки, справочник черт, проверки, практика, итог и навигация.
import { charsOf, loadChars, loadLessons } from './data.js';
import { buildSession, runner, soundSession, toneSession } from './exercises.js';
import { charCard, enableCharPopups, framesStrip, linkHanzi, strokeTypeTable, strokeViewer, wordList } from './hanzi.js';
import { completeLesson, load, saveScore } from './progress.js';
import { h, initPage, pageUrl, shuffle } from './ui.js';

initPage();
enableCharPopups();

const id = document.body.dataset.lesson;
const [lessons, chars] = await Promise.all([loadLessons(), loadChars()]);
const index = lessons.findIndex((l) => l.id === id);
const lesson = lessons[index];
const own = charsOf(chars, id);
const learned = Object.keys(chars).filter((ch) => chars[ch].lesson <= id);
const earlier = learned.filter((ch) => chars[ch].lesson < id);

document.title = `Урок ${Number(id)}. ${lesson.title} · Китайский с нуля`;
document.querySelector('.lesson-head').prepend(
  h('p', { class: 'lesson-kicker' }, `Модуль ${lesson.moduleNo} · ${lesson.module}`),
  h('h1', {}, h('span', { class: 'lesson-no' }, `Урок ${Number(id)}`), lesson.title),
  h('p', { class: 'lesson-meta' }, `≈ ${lesson.minutes} минут`),
);

// Карточки иероглифов: по умолчанию все знаки урока.
for (const el of document.querySelectorAll('[data-cards]')) {
  el.classList.add('cards');
  el.append(...await Promise.all((el.dataset.cards ? [...el.dataset.cards] : own).map((ch) => charCard(ch))));
}

for (const el of document.querySelectorAll('[data-strokes]')) el.append(await strokeViewer(el.dataset.strokes));

for (const el of document.querySelectorAll('[data-stroke-types]')) el.append(await strokeTypeTable(el.dataset.strokeTypes));

for (const el of document.querySelectorAll('[data-frames]')) el.replaceWith(await framesStrip(el.dataset.frames));

// <ul data-words><li data-hz="大人" data-py="dàrén">взрослый</li></ul>
for (const el of document.querySelectorAll('[data-words]')) {
  el.replaceWith(wordList([...el.children].map((li) => [li.dataset.hz, li.dataset.py, li.textContent.trim()])));
}

// Мини-проверки: <div class="check" data-answer="2"><p>Вопрос</p><ol><li>…</li></ol><p class="why">…</p></div>
for (const box of document.querySelectorAll('.check')) {
  const answer = Number(box.dataset.answer) - 1;
  const list = box.querySelector('ol, ul');
  const options = h('div', { class: 'options' });
  [...list.children].forEach((li, i) => options.append(h('button', {
    type: 'button',
    class: 'option',
    html: li.innerHTML,
    onclick: (e) => {
      for (const b of options.children) b.disabled = true;
      options.children[answer].classList.add('ok');
      if (i !== answer) e.currentTarget.classList.add('bad');
      box.classList.add('answered');
    },
  })));
  list.replaceWith(options);
}

linkHanzi(document.querySelector('main'));

// Практика: data-exercises="meaning char pinyin order write", "tone" с data-syllables или "sound" с data-sets.
// data-from="earlier" — разминка по прошлым урокам, ее результат не сохраняется; data-from="all" — все знаки до урока.
for (const el of document.querySelectorAll('[data-exercises]')) {
  const types = el.dataset.exercises.split(' ');
  const count = Number(el.dataset.count ?? 12);
  const warmup = el.dataset.from === 'earlier';
  const targets = { earlier: () => shuffle(earlier).slice(0, count), all: () => learned }[el.dataset.from]?.() ?? own;
  const make = types[0] === 'tone' ? () => toneSession(el.dataset.syllables.split(' '), count)
    : types[0] === 'sound' ? () => soundSession(el.dataset.sets.split(' '), count)
      : () => buildSession(types, warmup ? shuffle(earlier).slice(0, count) : targets, chars, learned, count);
  el.append(runner(make, {
    chars,
    title: el.dataset.title ?? 'Практика',
    onFinish: warmup ? null : (score) => saveScore(id, score),
  }));
}

// Итог: отметка о прохождении и переход дальше.
const nextLesson = lessons[index + 1];
const prevLesson = lessons[index - 1];
for (const el of document.querySelectorAll('[data-done]')) {
  const mark = () => el.replaceChildren(h('p', { class: 'done-note' },
    `✓ Урок пройден.${own.length ? ' Его иероглифы добавлены в повторение, первые карточки вернутся завтра.' : ''}`));
  if (load().lessons[id]?.done) mark();
  else {
    el.append(h('button', { type: 'button', class: 'btn primary', onclick: () => { completeLesson(id, own); mark(); } }, 'Урок пройден'));
  }
}

const navLink = (l, dir, cls) => l && h('a', { href: pageUrl(l.file), class: cls },
  h('span', { class: 'dir' }, dir), `Урок ${Number(l.id)}. ${l.title}`);
document.querySelector('main').append(h('nav', { class: 'lesson-nav' },
  navLink(prevLesson, '← Назад', 'prev') ?? h('span'), navLink(nextLesson, 'Дальше →', 'next')));

// Переход по ссылке на карточку (#char-人) после того, как карточки построены.
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
