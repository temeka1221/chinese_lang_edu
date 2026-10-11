// Тесты логики курса. Открываются через сервер: http://localhost:8000/tests/
import { loadChars } from '../js/data.js';
import { buildSession, makeQuestion, soundSession, toneSession } from '../js/exercises.js';
import { strokeViewer } from '../js/hanzi.js';
import { INTERVALS, schedule } from '../js/progress.js';
import { colorize, keyToPinyin, numbered, pinyinHtml, plain, plural, toneOf, withTone } from '../js/ui.js';

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

const chars = await loadChars();
const pool = Object.keys(chars);

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
      if (type === 'pinyin') ok(q.options.length >= 4, `${ch}: мало вариантов чтения`);
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

await test('тренажер: обзор, шаг вперед, подпись с названием черты', async () => {
  const v = await strokeViewer('十');
  document.body.append(v);
  eq(v.querySelectorAll('.stage-svg .st-done').length, 2);
  eq(v.querySelectorAll('.frame').length, 2);
  v.querySelector('[title="Следующая черта"]').click();
  ok(v.querySelector('.st-anim'), 'нет анимированной черты');
  const text = v.querySelector('.caption').textContent;
  ok(text.includes('Черта 1 из 2') && text.includes('横'), `подпись: ${text}`);
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
