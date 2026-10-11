// Упражнения: генерация вопросов и прохождение серии.
import { loadHanzi, loadStrokeTypes } from './data.js';
import { createWriter, hzLinks, miniChar } from './hanzi.js';
import { h, keyToPinyin, pinyinHtml, say, sayButton, shuffle, toneOf, withTone } from './ui.js';

const TONE_NAMES = { 1: 'ˉ ровный высокий', 2: 'ˊ восходящий', 3: 'ˇ низкий', 4: 'ˋ падающий' };

// ---------- Генерация: чистые функции, их проверяют tests/ ----------

// Вопрос заданного типа про иероглиф ch. pool — знаки, из которых берутся неверные варианты.
export function makeQuestion(type, ch, chars, pool, rnd = Math.random) {
  const e = chars[ch];
  const others = (count, key) => {
    const seen = new Set([key(ch)]);
    return shuffle(pool, rnd).filter((c) => !seen.has(key(c)) && seen.add(key(c))).slice(0, count);
  };
  switch (type) {
    case 'meaning':
      return { type, ch, options: shuffle([ch, ...others(3, (c) => chars[c].meaning)], rnd), answer: ch };
    case 'char':
      return { type, ch, options: shuffle([ch, ...others(3, (c) => c)], rnd), answer: ch };
    case 'pinyin': {
      const tone = toneOf(e.pinyin);
      const options = [...new Set([1, 2, 3, 4, ...(tone === 5 ? [5] : [])].map((t) => withTone(e.pinyin, t)))];
      return { type, ch, options: shuffle(options, rnd), answer: withTone(e.pinyin, tone) };
    }
    case 'order': {
      const n = e.strokes.length;
      if (n < 2) return null;
      const k = Math.floor(rnd() * (n - 1)); // впереди остается хотя бы две черты
      const rest = shuffle([...Array(n).keys()].slice(k + 1), rnd).slice(0, 3);
      return { type, ch, k, options: shuffle([k, ...rest], rnd), answer: k };
    }
    case 'write':
      return { type, ch };
    default:
      throw new Error(`неизвестный тип упражнения: ${type}`);
  }
}

// Серия: типы по кругу, иероглифы по кругу в случайном порядке.
export function buildSession(types, targets, chars, pool, count, rnd = Math.random) {
  const order = shuffle(targets, rnd);
  const out = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const q = makeQuestion(types[i % types.length], order[i % order.length], chars, pool, rnd);
    if (q) out.push(q);
  }
  return out;
}

// Тон на слух: ключи вида ma3.
export const toneSession = (keys, count, rnd = Math.random) =>
  shuffle(keys, rnd).slice(0, count).map((key) => ({ type: 'tone', key, options: [1, 2, 3, 4], answer: Number(key.slice(-1)) }));

// Звук на слух: наборы похожих слогов вида «ba1/pa1», звучит один из них.
export function soundSession(sets, count, rnd = Math.random) {
  return shuffle(Array.from({ length: count }, (_, i) => {
    const options = sets[i % sets.length].split('/');
    const key = options[Math.floor(rnd() * options.length)];
    return { type: 'sound', key, options: shuffle(options, rnd), answer: key };
  }), rnd);
}

// ---------- Прохождение ----------

// make() возвращает новый набор вопросов: так работает кнопка «Новая серия».
export function runner(make, { chars = {}, title = 'Практика', onFinish } = {}) {
  const root = h('div', { class: 'quiz' });
  let questions = [];
  let i = 0;
  let wrong = [];

  const start = (qs) => {
    questions = qs;
    i = 0;
    wrong = [];
    next();
  };

  const first = make();
  const intro = () => root.replaceChildren(h('div', { class: 'quiz-intro' },
    h('p', {}, h('b', {}, title), ` · заданий: ${first.length}. Каждый ответ сразу проверяется, ошибки разбираются.`),
    h('button', { type: 'button', class: 'btn primary', onclick: () => start(first) }, 'Начать')));

  async function next() {
    if (i >= questions.length) return finish();
    const q = questions[i];
    const bar = h('div', { class: 'quiz-bar' }, h('span', { style: `width:${(i / questions.length) * 100}%` }));
    const box = h('div', { class: 'quiz-q' });
    root.replaceChildren(h('div', { class: 'quiz-head' }, `${title} · вопрос ${i + 1} из ${questions.length}`), bar, box);
    await render(q, box, chars, (ok, note) => answered(q, box, ok, note));
  }

  function answered(q, box, ok, note) {
    if (!ok) wrong.push(q);
    const go = h('button', { type: 'button', class: 'btn primary', onclick: () => { i++; next(); } }, i + 1 < questions.length ? 'Дальше' : 'Итог');
    box.append(h('div', { class: `quiz-feedback ${ok ? 'ok' : 'bad'}` }, h('b', {}, ok ? 'Верно!' : 'Не совсем.'), note ?? '', h('div', {}, go)));
    go.focus();
  }

  function finish() {
    const score = (questions.length - wrong.length) / questions.length;
    onFinish?.(score);
    const verdict = score >= 0.9 ? 'Отлично!' : score >= 0.7 ? 'Хорошо.' : 'Карточки урока стоит пересмотреть и пройти серию еще раз.';
    const missed = [...new Set(wrong.map((q) => q.ch ?? keyToPinyin(q.key)))];
    root.replaceChildren(h('div', { class: 'quiz-result' },
      h('p', { class: 'quiz-score' }, `${questions.length - wrong.length} из ${questions.length}`),
      h('p', {}, verdict),
      missed.length ? h('p', { html: `Ошибки: ${hzLinks(missed.join(' '))}` }) : null,
      h('div', { class: 'quiz-actions' },
        wrong.length ? h('button', { type: 'button', class: 'btn', onclick: () => start(shuffle(wrong)) }, 'Ошибки еще раз') : null,
        h('button', { type: 'button', class: 'btn primary', onclick: () => start(make()) }, 'Новая серия'))));
  }

  intro();
  return root;
}

// Варианты ответа: после выбора правильный подсвечивается, остальные блокируются.
function choices(options, answer, label, onPick, cls = '') {
  const wrap = h('div', { class: `options ${cls}` });
  for (const opt of options) {
    wrap.append(h('button', {
      type: 'button',
      class: 'option',
      onclick: (e) => {
        for (const b of wrap.children) b.disabled = true;
        wrap.children[options.indexOf(answer)].classList.add('ok');
        if (opt !== answer) e.currentTarget.classList.add('bad');
        onPick(opt === answer);
      },
    }, label(opt)));
  }
  return wrap;
}

const big = (ch) => h('div', { class: 'quiz-char', lang: 'zh-CN' }, ch);
const span = (html) => h('span', { html });

// Короткая справка о знаке после ответа.
const charNote = (ch, e, wrong) => h('div', { class: 'quiz-note' },
  h('span', { lang: 'zh-CN', class: 'quiz-note-char' }, ch), ' ', span(pinyinHtml(e.pinyin)), ` — ${e.meaning} `, sayButton(ch, e.pinyin),
  wrong && e.mnemonic ? h('p', { class: 'muted', html: hzLinks(`Ассоциация: ${[e.mnemonic].flat()[0]}`) }) : null);

async function render(q, box, chars, done) {
  const e = chars[q.ch];
  switch (q.type) {
    case 'meaning':
      box.append(h('p', {}, 'Что значит этот иероглиф?'), big(q.ch),
        choices(q.options, q.answer, (c) => chars[c].meaning, (ok) => done(ok, charNote(q.ch, e, !ok))));
      break;
    case 'char':
      box.append(h('p', {}, `Какой иероглиф значит «${e.meaning}»?`),
        choices(q.options, q.answer, (c) => h('span', { lang: 'zh-CN', class: 'option-char' }, c),
          (ok) => done(ok, charNote(q.ch, e, !ok)), 'chars'));
      break;
    case 'pinyin':
      box.append(h('p', {}, 'Как читается этот иероглиф?'), big(q.ch),
        choices(q.options, q.answer, (p) => p, (ok) => { say(q.ch, e.pinyin); done(ok, charNote(q.ch, e, !ok)); }));
      break;
    case 'order': {
      const [data, types] = await Promise.all([loadHanzi(q.ch), loadStrokeTypes()]);
      const name = e.strokes[q.k];
      box.append(h('p', {}, `Какая черта идет следующей в ${q.ch}?`),
        h('div', { class: 'quiz-pic grid' }, miniChar(data, { done: q.k })),
        choices(q.options, q.answer, (i) => h('span', { class: 'grid option-pic' }, miniChar(data, { done: q.k, current: i })),
          (ok) => done(ok, h('div', { class: 'quiz-note' }, `Черта ${q.k + 1}: `, h('span', { lang: 'zh-CN' }, name),
            ` ${types[name].pinyin} — ${types[name].ru}.`)), 'pics'));
      break;
    }
    case 'write': {
      const field = h('div', { class: 'quiz-write grid' });
      let finished = false;
      const finish = (ok, note) => {
        if (finished) return;
        finished = true;
        giveUp.remove();
        done(ok, note);
      };
      const giveUp = h('button', { type: 'button', class: 'btn', onclick: () => {
        writer.cancelQuiz();
        writer.showOutline();
        writer.animateCharacter();
        finish(false, charNote(q.ch, e, true));
      } }, 'Не помню');
      box.append(h('p', { html: `Иероглиф по памяти: «${e.meaning}», ${pinyinHtml(e.pinyin)}` }), field, giveUp);
      const writer = createWriter(field, q.ch, Math.min(260, box.clientWidth || 260), { showOutline: false });
      writer.quiz({
        showHintAfterMisses: 3,
        onComplete: ({ totalMistakes }) => finish(totalMistakes <= 3,
          h('div', { class: 'quiz-note' }, totalMistakes ? `Ошибок: ${totalMistakes}. ` : 'Без ошибок. ', charNote(q.ch, e, false))),
      });
      break;
    }
    case 'sound': {
      const play = () => say(q.key);
      box.append(h('p', {}, 'Какой слог звучит?'),
        h('button', { type: 'button', class: 'btn say-big', onclick: play }, '🔊 Еще раз'),
        choices(q.options, q.answer, (k) => keyToPinyin(k), (ok) => done(ok,
          h('div', { class: 'quiz-note' }, 'Звучал слог ', span(pinyinHtml(keyToPinyin(q.key))), '.'))));
      play();
      break;
    }
    case 'tone': {
      const play = () => say(q.key);
      box.append(h('p', {}, 'Какой тон звучит?'),
        h('button', { type: 'button', class: 'btn say-big', onclick: play }, '🔊 Еще раз'),
        choices(q.options, q.answer, (t) => `${t} · ${TONE_NAMES[t]}`, (ok) => done(ok,
          h('div', { class: 'quiz-note' }, 'Звучал слог ', span(`<span class="t${q.answer}">${keyToPinyin(q.key)}</span>`), ` — ${q.answer}-й тон.`))));
      play();
      break;
    }
  }
}
