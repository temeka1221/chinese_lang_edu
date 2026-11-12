// Повторение по коробкам Лейтнера: узнать знак или слово, написать знак по памяти.
import { loadChars, loadWords } from './data.js';
import { createWriter, enableCharPopups, hzLinks } from './hanzi.js';
import { INTERVALS, dueCards, grade, load, newWords, waitingWords } from './progress.js';
import { h, initPage, pinyinHtml, plural, refreshBadge, say, sayButton, shuffle } from './ui.js';

initPage();
enableCharPopups();

const [chars, words] = await Promise.all([loadChars(), loadWords()]);
const entry = (key) => chars[key] ?? words.get(key);
const root = document.querySelector('[data-review]');
const boxes = document.querySelector('[data-boxes]');

function renderBoxes() {
  refreshBadge();
  const cards = Object.values(load().cards);
  boxes.replaceChildren(...INTERVALS.map((days, i) => h('div', { class: 'box-stat' },
    h('b', {}, String(cards.filter((c) => c.box === i + 1).length)),
    `коробка ${i + 1}: раз в ${days} ${plural(days, 'день', 'дня', 'дней')}`)));
}

function startScreen(note) {
  renderBoxes();
  const s = load();
  const due = dueCards(s).filter(entry);
  const fresh = newWords(words, s);
  const head = note ? h('p', { class: 'done-note' }, note) : null;
  if (!Object.keys(s.cards).length && !fresh.length) {
    return root.replaceChildren(h('p', {}, 'Карточек пока нет. Они появляются после кнопки «Урок пройден» в конце урока.'));
  }
  if (!due.length && !fresh.length) {
    // Слова сверх дневной порции ждут завтрашнего дня.
    const soon = Math.min(...Object.values(s.cards).map((c) => c.due), ...(waitingWords(words, s).length ? [Date.now() + 86_400_000] : []));
    const date = new Date(soon).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    return root.replaceChildren(head ?? '', h('p', {}, `На сегодня все повторено. Следующие карточки ждут ${date}.`));
  }
  const parts = [
    due.length ? `${due.length} ${plural(due.length, 'карточка', 'карточки', 'карточек')}` : null,
    fresh.length ? `${fresh.length} ${plural(fresh.length, 'новое слово', 'новых слова', 'новых слов')}` : null,
  ].filter(Boolean);
  root.replaceChildren(head ?? '',
    h('p', {}, `К повторению: ${parts.join(' и ')}.`),
    h('button', { type: 'button', class: 'btn primary', onclick: () => session(due, fresh) }, 'Начать'));
}

// Сначала идут карточки по расписанию, за ними новые слова в порядке уроков.
function session(due, fresh) {
  const queue = [...shuffle(due), ...fresh];
  const total = queue.length;
  const graded = new Set();
  let right = 0;

  const next = () => {
    if (!queue.length) return startScreen(`Сессия завершена: с первого раза ${right} из ${total}.`);
    const ch = queue.shift();
    const first = !graded.has(ch);
    const card = load().cards[ch];
    // Знак, который уже удалось узнать, иногда предлагается написать по памяти.
    const write = first && chars[ch] && card.box >= 2 && Math.random() < 0.5;
    const result = (ok) => {
      if (first) {
        graded.add(ch);
        grade(ch, ok);
        if (ok) right++;
      }
      if (!ok) queue.push(ch); // ошибка: знак вернется в конце этой же сессии
      renderBoxes();
    };
    // Знакомое слово иногда приходит на слух, без знаков.
    const byEar = first && !chars[ch] && card?.box >= 2 && Math.random() < 0.5;
    const left = `Осталось: ${queue.length + 1}${card ? '' : ' · новое слово'}`;
    (write ? writeCard : recallCard)(ch, entry(ch), left, result, next, byEar);
  };
  next();
}

const reveal = (ch, e) => h('div', { class: 'review-answer' },
  h('div', { class: 'card-py', html: pinyinHtml(e.pinyin) }, sayButton(ch, e.pinyin)),
  h('div', { class: 'card-meaning' }, e.meaning),
  chars[ch]
    ? h('p', { class: 'muted', html: hzLinks(`Ассоциация: ${[e.mnemonic].flat()[0]}`) })
    : h('p', { class: 'muted', html: hzLinks(`Знаки слова: ${[...ch].join(' ')}`) }), // каждый знак открывает свою карточку
  e.sound ? h('p', { class: 'muted', html: hzLinks(`Чтение: ${e.sound}`) }) : null);

function recallCard(ch, e, left, result, next, byEar = false) {
  const answer = h('div', {});
  const written = h('div', { class: `quiz-char${chars[ch] ? '' : ' quiz-word'}`, lang: 'zh-CN' }, ch);
  const face = byEar ? h('button', { type: 'button', class: 'btn say-big', onclick: () => say(ch, e.pinyin) }, '🔊 Еще раз') : written;
  const show = h('button', { type: 'button', class: 'btn primary', onclick: () => {
    say(ch, e.pinyin);
    face.replaceWith(written);
    answer.replaceChildren(reveal(ch, e), h('div', { class: 'quiz-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { result(false); next(); } }, 'Не вспомнилось'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { result(true); next(); } }, 'Вспомнилось')));
  } }, 'Ответ');
  answer.append(show);
  root.replaceChildren(h('div', { class: 'review-card' },
    h('p', { class: 'muted' }, `${left} · ${byEar ? 'слово на слух' : 'чтение и значение'}`),
    face,
    answer));
  show.focus();
  if (byEar) say(ch, e.pinyin);
}

function writeCard(ch, e, left, result, next) {
  const field = h('div', { class: 'quiz-write grid' });
  const after = h('div', {});
  let done = false;
  const finish = (ok, text) => {
    if (done) return;
    done = true;
    result(ok);
    after.replaceChildren(h('p', {}, text), reveal(ch, e),
      h('button', { type: 'button', class: 'btn primary', onclick: next }, 'Дальше'));
  };
  const giveUp = h('button', { type: 'button', class: 'btn', onclick: () => {
    writer.cancelQuiz();
    writer.showOutline();
    writer.animateCharacter();
    giveUp.remove();
    finish(false, 'Порядок черт показан анимацией.');
  } }, 'Не помню');
  root.replaceChildren(h('div', { class: 'review-card' },
    h('p', { class: 'muted' }, `${left} · письмо по памяти`),
    h('p', { html: `«${e.meaning}», ${pinyinHtml(e.pinyin)}` }, ' ', sayButton(ch, e.pinyin)),
    field, giveUp, after));
  const writer = createWriter(field, ch, Math.min(260, field.clientWidth || 260), { showOutline: false });
  writer.quiz({
    showHintAfterMisses: 3,
    onComplete: ({ totalMistakes }) => {
      giveUp.remove();
      finish(totalMistakes <= 3, totalMistakes ? `Ошибок: ${totalMistakes}.` : 'Без ошибок!');
    },
  });
}

startScreen();
