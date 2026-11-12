// Упражнения: генерация вопросов и прохождение серии.
import { loadHanzi, loadStrokeTypes } from './data.js';
import { createWriter, hzLinks, miniChar } from './hanzi.js';
import { h, keyToPinyin, pinyinHtml, plain, say, sayButton, shuffle, syllableSpans, toneOf, withTone } from './ui.js';

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
      // Два слога в двух тонах: приходится вспомнить и слог, и тон. Второй слог по возможности похож на верный.
      const tone = toneOf(e.pinyin);
      const base = plain(e.pinyin);
      const others = shuffle(pool, rnd).map((c) => plain(chars[c].pinyin)).filter((p) => p !== base);
      const other = others.find((p) => p[0] === base[0] || p.slice(-2) === base.slice(-2)) ?? others[0];
      const wrongTone = shuffle([1, 2, 3, 4].filter((t) => t !== tone), rnd)[0];
      const options = other
        ? [base, other].flatMap((p) => [withTone(p, tone), withTone(p, wrongTone)])
        : [1, 2, 3, 4, ...(tone === 5 ? [5] : [])].map((t) => withTone(base, t));
      return { type, ch, options: shuffle(options, rnd), answer: withTone(base, tone) };
    }
    case 'hear': {
      // На слух: варианты читаются по-разному, первыми берутся созвучные (тот же слог в другом тоне, та же первая буква).
      const base = plain(e.pinyin);
      const far = (c) => (plain(chars[c].pinyin) === base ? 0 : plain(chars[c].pinyin)[0] === base[0] ? 1 : 2);
      const heard = new Set([e.pinyin]);
      const rest = shuffle(pool, rnd).sort((a, b) => far(a) - far(b))
        .filter((c) => !heard.has(chars[c].pinyin) && heard.add(chars[c].pinyin)).slice(0, 3);
      return rest.length ? { type, ch, options: shuffle([ch, ...rest], rnd), answer: ch } : null;
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

// ---------- Фразы: чистые функции ----------

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

// Фраза делится на плитки по словам пиньиня: «Nǐ jiào shénme míngzi?» -> 你 / 叫 / 什么 / 名字.
// tiles задает свое деление («三 百 六 十 五»), когда плитки нужны мельче слов.
// Заглавная буква в начале предложения убирается, иначе она выдает первую плитку.
export function segment(hz, py, tiles) {
  const chars = [...hz].filter((c) => CJK.test(c));
  const spans = syllableSpans(py);
  const sizes = tiles ? tiles.split(' ').map((g) => [...g].length)
    : spans.reduce((acc, s) => (s.word ? [...acc, 1] : [...acc.slice(0, -1), acc.at(-1) + 1]), []);
  if (chars.length !== spans.length || sizes.reduce((a, b) => a + b, 0) !== chars.length) return null;
  let i = 0;
  return sizes.map((n) => {
    const part = spans.slice(i, i + n).map((s, k) => {
      const text = s.start ? s.text[0].toLowerCase() + s.text.slice(1) : s.text;
      return k && /^[aeo]/.test(plain(text)) ? `'${text}` : text; // shí'èr
    });
    const tile = { hz: chars.slice(i, i + n).join(''), py: part.join('') };
    i += n;
    return tile;
  });
}

// Вопрос по фразе { hz, py, ru, gap, tiles }. list — все фразы блока, из них берутся неверные переводы.
// gap — варианты для пропуска, первый из них верный и должен совпадать с одной из плиток.
export function makePhraseQuestion(type, phrase, list, rnd = Math.random) {
  const tokens = segment(phrase.hz, phrase.py, phrase.tiles);
  if (!tokens) return null;
  switch (type) {
    case 'build': {
      if (tokens.length < 3) return null;
      let bank = shuffle(tokens, rnd);
      if (bank.every((t, i) => t.hz === tokens[i].hz)) bank = [...bank.slice(1), bank[0]]; // плитки не лежат готовым ответом
      return { type, phrase, tokens, bank };
    }
    case 'gap': {
      const at = phrase.gap ? tokens.findIndex((t) => t.hz === phrase.gap[0]) : -1;
      return at < 0 ? null : { type, phrase, tokens, at, options: shuffle(phrase.gap, rnd), answer: phrase.gap[0] };
    }
    case 'listen': {
      // Числа сравниваются с числами, фразы с фразами.
      const kind = (p) => /^\d+$/.test(p.ru);
      const others = [...new Set(shuffle(list, rnd).filter((p) => p.ru !== phrase.ru && kind(p) === kind(phrase)).map((p) => p.ru))];
      return others.length < 2 ? null : { type, phrase, options: shuffle([phrase.ru, ...others.slice(0, 3)], rnd), answer: phrase.ru };
    }
    default:
      throw new Error(`неизвестный тип упражнения: ${type}`);
  }
}

// Серия по фразам: типы по кругу, для каждого берется подходящая фраза, которая встречалась в серии реже других.
export function phraseSession(types, phrases, count, rnd = Math.random) {
  const order = shuffle(phrases, rnd);
  const fits = Object.fromEntries(types.map((t) => [t, order.filter((p) => makePhraseQuestion(t, p, phrases, rnd))]));
  const seen = new Map();
  const times = (p) => seen.get(p) ?? 0;
  const out = [];
  for (let i = 0; out.length < count && i < count * 2; i++) {
    const type = types[i % types.length];
    const phrase = fits[type].reduce((best, p) => (best && times(best) <= times(p) ? best : p), null);
    if (!phrase) continue;
    seen.set(phrase, times(phrase) + 1);
    out.push(makePhraseQuestion(type, phrase, phrases, rnd));
  }
  return out;
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
    const verdict = score >= 0.9 ? 'Отлично!' : score >= 0.7 ? 'Хорошо.' : 'Материал урока стоит пересмотреть и пройти серию еще раз.';
    const missed = [...new Set(wrong.map((q) => q.ch ?? q.phrase?.hz ?? keyToPinyin(q.key)))];
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

// Плитка слова: знаки и пиньинь под ними.
const tokParts = (t) => [h('span', { class: 'tok-hz', lang: 'zh-CN' }, t.hz), h('span', { class: 'tok-py', html: pinyinHtml(t.py) })];

// Разбор фразы после ответа: любой знак открывает свой порядок черт.
const phraseNote = (p) => h('div', { class: 'quiz-note' },
  h('span', { class: 'quiz-note-char', html: hzLinks(p.hz) }), ' ', span(pinyinHtml(p.py)), ` — ${p.ru} `, sayButton(p.hz, p.py));

async function render(q, box, chars, done) {
  const e = chars[q.ch];
  switch (q.type) {
    case 'build': {
      const line = h('div', { class: 'build-line', 'aria-label': 'Собранная фраза' });
      const bank = h('div', { class: 'build-bank', 'aria-label': 'Слова' });
      const check = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => {
        const ok = [...line.children].map((b) => b.dataset.part).join('') === q.tokens.map((t) => t.hz).join('');
        for (const b of line.children) b.disabled = true;
        check.remove();
        say(q.phrase.hz, q.phrase.py);
        done(ok, phraseNote(q.phrase));
      } }, 'Проверить');
      // Нажатие переносит плитку в строку ответа, повторное возвращает ее обратно.
      const move = (b) => {
        (b.parentElement === bank ? line : bank).append(b);
        check.disabled = bank.children.length > 0;
      };
      for (const t of q.bank) {
        bank.append(h('button', { type: 'button', class: 'tok', 'data-part': t.hz, onclick: (ev) => move(ev.currentTarget) }, tokParts(t)));
      }
      box.append(h('p', {}, /^\d+$/.test(q.phrase.ru) ? `Число по-китайски: ${q.phrase.ru}` : `Фраза по-китайски: «${q.phrase.ru}»`),
        line, bank, h('div', { class: 'quiz-actions' }, check));
      break;
    }
    case 'gap':
      box.append(h('p', {}, `Какое слово пропущено? «${q.phrase.ru}»`),
        h('div', { class: 'gap-line' }, q.tokens.map((t, i) => (i === q.at
          ? h('span', { class: 'tok tok-gap' }, '?')
          : h('span', { class: 'tok' }, tokParts(t))))),
        choices(q.options, q.answer, (w) => h('span', { lang: 'zh-CN', class: 'option-word' }, w),
          (ok) => { say(q.phrase.hz, q.phrase.py); done(ok, phraseNote(q.phrase)); }));
      break;
    case 'listen': {
      const play = () => say(q.phrase.hz, q.phrase.py);
      box.append(h('p', {}, /^\d+$/.test(q.phrase.ru) ? 'Какое число звучит?' : 'Что значит эта фраза?'),
        h('button', { type: 'button', class: 'btn say-big', onclick: play }, '🔊 Еще раз'),
        choices(q.options, q.answer, (ru) => ru, (ok) => done(ok, phraseNote(q.phrase))));
      play();
      break;
    }
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
    case 'hear': {
      const play = () => say(q.ch, e.pinyin);
      box.append(h('p', {}, 'Какой знак звучит?'),
        h('button', { type: 'button', class: 'btn say-big', onclick: play }, '🔊 Еще раз'),
        choices(q.options, q.answer, (c) => h('span', { lang: 'zh-CN', class: 'option-char' }, c),
          (ok) => done(ok, charNote(q.ch, e, !ok)), 'chars'));
      play();
      break;
    }
    case 'order': {
      const [data, types] = await Promise.all([loadHanzi(q.ch), loadStrokeTypes()]);
      const name = e.strokes[q.k];
      box.append(h('p', {}, `Какая черта идет следующей в ${q.ch}?`),
        h('div', { class: 'quiz-pic grid' }, miniChar(data, { done: q.k })),
        choices(q.options, q.answer, (i) => h('span', { class: 'grid option-pic' }, miniChar(data, { done: q.k, current: i })),
          (ok) => done(ok, h('div', { class: 'quiz-note' }, `Черта ${q.k + 1}: `, h('span', { lang: 'zh-CN' }, name),
            ` ${types[name].pinyin} (${types[name].cyr}) — ${types[name].ru}.`)), 'pics'));
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
