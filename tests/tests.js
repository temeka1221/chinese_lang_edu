// Тесты логики курса. Открываются через сервер: http://localhost:8000/tests/
import { loadChars, loadStrokeTypes, loadWords } from '../js/data.js';
import { buildSession, makePhraseQuestion, makeQuestion, phraseSession, segment, soundSession, toneSession } from '../js/exercises.js';
import { strokeViewer, withStrokeCyr } from '../js/hanzi.js';
import { INTERVALS, NEW_WORDS_PER_DAY, exportProgress, grade, importProgress, load, newWords, schedule, waitingWords } from '../js/progress.js';
import { colorize, fallbackKeys, keyToPinyin, numbered, pinyinHtml, plain, plural, toneOf, withTone } from '../js/ui.js';

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, e.message]);
  }
}

function eq(actual, expected) {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(`ожидалось ${b}, получено ${a}`);
}

function ok(value, message) {
  if (!value) throw new Error(message);
}

// Повторяемый генератор случайных чисел (mulberry32).
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

await test('тон по знаку над гласной', () => {
  eq(['mā', 'má', 'mǎ', 'mà', 'ma', 'nǚ'].map(toneOf), [1, 2, 3, 4, 5, 3]);
});

await test('слог в имя файла записи', () => {
  eq(['mù', 'nǚ', 'lǜ', 'ma', 'Zhōng'].map(numbered), ['mu4', 'nv3', 'lv4', 'ma5', 'zhong1']);
});

await test('запасные слоги: два третьих тона подряд и замена легкого тона', () => {
  const has = (k) => ['le4', 'bu2', 'bu4'].includes(k);
  eq(fallbackKeys('wǒ xiǎng nǐ', has), ['wo2', 'xiang2', 'ni3']);
  eq(fallbackKeys('shuǐjiǎo', has), ['shui2', 'jiao3']);
  eq(fallbackKeys('Nǐ hǎo! Wǒ hěn hǎo.', has), ['ni2', 'hao3', 'wo2', 'hen2', 'hao3']);
  eq(fallbackKeys('báibái le', has), ['bai2', 'bai2', 'le4']);
  eq(fallbackKeys('shì bu shì', has), ['shi4', 'bu4', 'shi4']);
  eq(fallbackKeys('shénme', has), ['shen2', 'me5']);
});

await test('знак тона ставится на нужную гласную', () => {
  eq(withTone('hao', 3), 'hǎo');
  eq(withTone('liu', 4), 'liù');
  eq(withTone('gui', 4), 'guì');
  eq(withTone('dou', 1), 'dōu');
  eq(withTone('xie', 4), 'xiè');
  eq(withTone('lüe', 4), 'lüè');
  eq(withTone('nü', 3), 'nǚ');
  eq(withTone('er', 4), 'èr');
  eq(withTone('mǎ', 1), 'mā');
});

await test('ключ записи превращается в пиньинь', () => {
  eq(['ma3', 'lv4', 'yi1'].map(keyToPinyin), ['mǎ', 'lǜ', 'yī']);
  eq(plain('Zhōngguó'), 'Zhongguo');
});

await test('пиньинь слов: слоги находятся сами, пробелы и апострофы остаются', () => {
  const div = document.createElement('div');
  div.innerHTML = pinyinHtml("Xī'ān");
  eq([...div.children].map((s) => s.textContent), ['Xī', 'ān']);
  div.innerHTML = pinyinHtml('yí ge rén');
  eq(div.textContent, 'yí ge rén');
  eq([...div.children].map((s) => s.className), ['t2', 't5', 't2']);
});

await test('пиньинь в тексте раскрашивается по слогам', () => {
  const el = document.createElement('span');
  el.textContent = 'Nǐ hǎo! Zhōngguó, kěnéng, ma';
  colorize(el);
  eq([...el.children].map((s) => s.textContent), ['Nǐ', 'hǎo', 'Zhōng', 'guó', 'kě', 'néng', 'ma']);
  eq([...el.children].map((s) => s.className), ['t3', 't3', 't1', 't2', 't3', 't2', 't5']);
  eq(el.textContent, 'Nǐ hǎo! Zhōngguó, kěnéng, ma');
});

await test('форма слова после числа', () => {
  eq([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, 'черта', 'черты', 'черт')),
    ['черта', 'черты', 'черт', 'черт', 'черт', 'черта', 'черты', 'черт']);
});

await test('коробки Лейтнера', () => {
  const D = 86_400_000;
  const now = new Date(2026, 9, 11, 15, 30).getTime();
  const today = new Date(2026, 9, 11).getTime();
  eq(INTERVALS, [1, 3, 7, 14, 30]);
  eq(schedule({ box: 1 }, true, now), { box: 2, due: today + 3 * D });
  eq(schedule({ box: 4 }, false, now), { box: 1, due: today + D });
  eq(schedule({ box: 5 }, true, now), { box: 5, due: today + 30 * D });
});

await test('прогресс: файл выгружается и загружается обратно, мусор отклоняется', () => {
  const saved = exportProgress();
  try {
    importProgress(JSON.stringify({ lessons: { '02': { done: true } }, cards: { 人: { box: 3, due: 1 } } }));
    eq(load().cards['人'].box, 3);
    let failed = false;
    try { importProgress('{"hello": 1}'); } catch { failed = true; }
    ok(failed, 'файл без lessons и cards принят');
  } finally {
    importProgress(saved);
  }
});

const chars = await loadChars();
const pool = Object.keys(chars);

await test('слова для повторения: только из знаков курса, урок по последнему знаку', async () => {
  const words = await loadWords();
  ok(words.size > 50, `слов мало: ${words.size}`);
  for (const [hz, w] of words) {
    ok([...hz].every((c) => chars[c]), `${hz}: есть знак вне курса`);
    eq(w.lesson, [...hz].map((c) => chars[c].lesson).sort().at(-1));
  }
  eq(words.get('明天').lesson, '07');
  eq([...words.values()].map((w) => w.lesson), [...words.values()].map((w) => w.lesson).sort());
});

await test('новые слова: из пройденных уроков, порция на день, счет сбрасывается назавтра', async () => {
  const words = await loadWords();
  const saved = exportProgress();
  const now = new Date(2026, 9, 11, 15, 30).getTime();
  const D = 86_400_000;
  try {
    importProgress(JSON.stringify({ lessons: {}, cards: {} }));
    eq(newWords(words, load(), now), []);
    importProgress(JSON.stringify({ lessons: { '02': { done: true }, '04': { done: true } }, cards: {} }));
    const first = newWords(words, load(), now);
    eq(first.length, NEW_WORDS_PER_DAY);
    ok(first.every((w) => ['02', '04'].includes(words.get(w).lesson)), 'слово из непройденного урока');
    eq(words.get(first[0]).lesson, '02');
    grade(first[0], true, now);
    eq(load().cards[first[0]].box, 1);
    const rest = newWords(words, load(), now);
    eq(rest.length, NEW_WORDS_PER_DAY - 1);
    ok(!rest.includes(first[0]), 'слово из коробки снова пришло как новое');
    eq(newWords(words, load(), now + D).length, Math.min(NEW_WORDS_PER_DAY, waitingWords(words).length));
  } finally {
    importProgress(saved);
  }
});

await test('в вариантах есть правильный ответ и нет повторов', () => {
  const rnd = seeded(1);
  for (const ch of pool) {
    for (const type of ['meaning', 'char', 'pinyin', 'order']) {
      const q = makeQuestion(type, ch, chars, pool, rnd);
      if (!q) {
        ok(type === 'order' && chars[ch].strokes.length < 2, `${ch}, ${type}: вопрос не построен`);
        continue;
      }
      ok(q.options.includes(q.answer), `${ch}, ${type}: нет правильного ответа`);
      eq(new Set(q.options).size, q.options.length);
      if (type === 'meaning') eq(new Set(q.options.map((c) => chars[c].meaning)).size, q.options.length);
      if (type === 'pinyin') {
        eq(q.options.length, 4);
        eq(q.answer, chars[ch].pinyin);
        eq(new Set(q.options.map(plain)).size, 2); // два слога, каждый в двух тонах
      }
      if (type === 'order') ok(q.options.every((i) => i >= q.k && i < chars[ch].strokes.length), `${ch}: черта вне знака`);
    }
  }
});

await test('серия упражнений нужной длины', () => {
  const s = buildSession(['meaning', 'char', 'pinyin', 'order', 'write'], pool, chars, pool, 12, seeded(2));
  eq(s.length, 12);
  ok(new Set(s.map((q) => q.type)).size === 5, 'в серии есть не все типы заданий');
});

await test('тон на слух: ответ берется из ключа', () => {
  eq(toneSession(['ma1', 'ma2', 'ma3', 'ma4'], 4, seeded(3)).map((q) => q.answer).sort(), [1, 2, 3, 4]);
});

await test('звук на слух: правильный слог среди вариантов своего набора', () => {
  const s = soundSession(['ba1/pa1', 'ji1/qi1/xi1'], 6, seeded(4));
  eq(s.length, 6);
  for (const q of s) ok(q.options.includes(q.answer) && q.options.length >= 2, `вопрос ${JSON.stringify(q)}`);
});

await test('фраза делится на плитки по словам пиньиня', () => {
  const show = (tokens) => tokens.map((t) => `${t.hz}:${t.py}`);
  eq(show(segment('你叫什么名字？', 'Nǐ jiào shénme míngzi?')), ['你:nǐ', '叫:jiào', '什么:shénme', '名字:míngzi']);
  eq(show(segment('我叫安娜。你呢？', 'Wǒ jiào Ānnà. Nǐ ne?')), ['我:wǒ', '叫:jiào', '安娜:Ānnà', '你:nǐ', '呢:ne']);
  eq(show(segment('十二个月', "shí'èr ge yuè")), ["十二:shí'èr", '个:ge', '月:yuè']);
  eq(show(segment('三百六十五', 'sānbǎi liùshíwǔ', '三 百 六 十 五')), ['三:sān', '百:bǎi', '六:liù', '十:shí', '五:wǔ']);
  eq(show(segment('爸爸、妈妈和我。', 'Bàba, māma hé wǒ.')), ['爸爸:bàba', '妈妈:māma', '和:hé', '我:wǒ']);
  eq(segment('你好', 'nǐ'), null);
});

await test('задания на фразы: сборка, пропуск, перевод на слух', () => {
  const list = [
    { hz: '我没有姐姐。', py: 'Wǒ méiyǒu jiějie.', ru: 'У меня нет старшей сестры.', gap: ['没有', '不有', '不是'] },
    { hz: '你有妹妹吗？', py: 'Nǐ yǒu mèimei ma?', ru: 'У тебя есть младшая сестра?', gap: ['吗', '呢', '和'] },
    { hz: '这是我爸爸。', py: 'Zhè shì wǒ bàba.', ru: 'Это мой папа.' },
    { hz: '大家好！', py: 'Dàjiā hǎo!', ru: 'Всем привет!' },
    { hz: '四十', py: 'sìshí', ru: '40' }, { hz: '十四', py: 'shísì', ru: '14' }, { hz: '一百', py: 'yìbǎi', ru: '100' },
  ];
  const rnd = seeded(5);
  for (let n = 0; n < 20; n++) {
    const b = makePhraseQuestion('build', list[0], list, rnd);
    eq(b.bank.map((x) => x.hz).sort(), b.tokens.map((x) => x.hz).sort());
    ok(b.bank.some((x, i) => x.hz !== b.tokens[i].hz), 'плитки лежат готовым ответом');
  }
  eq(makePhraseQuestion('build', list[3], list, rnd), null); // две плитки собирать незачем
  const g = makePhraseQuestion('gap', list[1], list, rnd);
  eq([g.tokens[g.at].hz, g.answer, [...g.options].sort()], ['吗', '吗', ['吗', '呢', '和'].sort()]);
  eq(makePhraseQuestion('gap', list[2], list, rnd), null);
  const l = makePhraseQuestion('listen', list[4], list, rnd);
  ok(l.options.includes('40') && l.options.every((o) => /^\d+$/.test(o)), `числа сравниваются с числами: ${l.options}`);
  const s = phraseSession(['build', 'gap', 'listen'], list, 9, rnd);
  eq(s.length, 9);
  eq(s.slice(0, 3).map((q) => q.type), ['build', 'gap', 'listen']);
});

await test('фразы уроков: делятся на плитки, пропуск совпадает с плиткой, серия набирается', async () => {
  let blocks = 0;
  for (const file of ['09-numbers', '10-greetings', '11-family', '12-final']) {
    const doc = new DOMParser().parseFromString(await (await fetch(`../lessons/${file}.html`)).text(), 'text/html');
    for (const el of doc.querySelectorAll('[data-exercises]')) {
      const list = [...el.querySelectorAll('li[data-hz]')].map((li) => ({
        hz: li.dataset.hz, py: li.dataset.py, ru: li.textContent.trim(), gap: li.dataset.gap?.split(' '), tiles: li.dataset.tiles,
      }));
      if (!list.length) continue;
      blocks++;
      for (const p of list) {
        const tokens = segment(p.hz, p.py, p.tiles);
        ok(tokens, `${file}: ${p.hz} не делится на плитки`);
        if (p.gap) ok(tokens.some((x) => x.hz === p.gap[0]), `${file}: в ${p.hz} нет плитки ${p.gap[0]}`);
        if (p.gap) eq(new Set(p.gap).size, p.gap.length);
      }
      eq(new Set(list.map((p) => p.ru)).size, list.length);
      const count = Number(el.dataset.count);
      const types = el.dataset.exercises.split(' ');
      const s = phraseSession(types, list, count, seeded(6));
      eq(s.length, count);
      eq(new Set(s.map((q) => q.type)).size, types.length);
    }
  }
  eq(blocks, 4);
});

await test('названия черт с русской транскрипцией', async () => {
  const types = await loadStrokeTypes();
  ok(Object.values(types).every((t) => t.cyr), 'у каждой черты есть транскрипция');
  eq(withStrokeCyr('Рамка: 竖, 横折钩. Последней — 横.', types), 'Рамка: 竖 (шу), 横折钩 (хэн-чжэ-гоу). Последней — 横 (хэн).');
});

await test('тренажер: обзор, шаг вперед, подпись с названием черты', async () => {
  const v = await strokeViewer('十');
  document.body.append(v);
  eq(v.querySelectorAll('.stage-svg .st-done').length, 2);
  eq(v.querySelectorAll('.frame').length, 2);
  v.querySelector('[title="Следующая черта"]').click();
  ok(v.querySelector('.st-anim'), 'нет анимированной черты');
  const text = v.querySelector('.caption').textContent;
  ok(text.includes('Черта 1 из 2') && text.includes('横 héng (хэн)'), `подпись: ${text}`);
  v.remove();
});

const failed = results.filter(([, passed]) => !passed);
document.querySelector('[data-summary]').textContent =
  `ИТОГ: ${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length}`;
document.querySelector('[data-results]').append(...results.map(([name, passed, err]) => {
  const li = document.createElement('li');
  li.textContent = `${passed ? 'PASS' : 'FAIL'} ${name}${err ? `: ${err}` : ''}`;
  li.className = passed ? 't2' : 't1';
  return li;
}));
