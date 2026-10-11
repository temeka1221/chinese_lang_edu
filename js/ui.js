// Общие помощники: разметка, пиньинь, звук, шапка сайта.
import { dataUrl, loadAudioIndex } from './data.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Форма слова после числа: plural(2, 'черта', 'черты', 'черт') -> «черты».
export function plural(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return few;
  return many;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function shuffle(list, rnd = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Пиньинь ----------

const MARKS = { '\u0304': 1, '\u0301': 2, '\u030c': 3, '\u0300': 4 };
const MARK_OF = { 1: '\u0304', 2: '\u0301', 3: '\u030c', 4: '\u0300' };
const VOWELS = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const SYLLABLE = new RegExp(
  `(?:[zcs]h|[bpmfdtnlgkhjqxrzcsyw])?[${VOWELS}]+(?:ng(?![${VOWELS}])|n(?![${VOWELS}])|r(?![${VOWELS}]))?`,
  'giu',
);
export const SYLLABLE_KEY = /^[a-zv]+[1-5]$/;

// Тон по знаку над гласной: 1–4, без знака 5 (легкий тон).
export function toneOf(syllable) {
  for (const c of syllable.normalize('NFD')) if (MARKS[c]) return MARKS[c];
  return 5;
}

// mù -> mu4, nǚ -> nv3: так названы файлы записей.
export function numbered(syllable) {
  let out = '';
  let tone = 5;
  for (const c of syllable.toLowerCase().normalize('NFD')) {
    if (MARKS[c]) tone = MARKS[c];
    else if (c === '\u0308') out = `${out.slice(0, -1)}v`;
    else out += c;
  }
  return out + tone;
}

export const plain = (syllable) => syllable.normalize('NFD').replace(/[\u0300\u0301\u0304\u030c]/g, '').normalize('NFC');

// Знак тона ставится на a или e, в сочетании ou на o, иначе на последнюю гласную (liù, guì).
export function withTone(syllable, tone) {
  const base = plain(syllable);
  if (!MARK_OF[tone]) return base;
  const low = base.toLowerCase();
  let i = low.search(/[ae]/);
  if (i < 0) i = low.indexOf('ou');
  if (i < 0) for (let j = low.length - 1; j >= 0 && i < 0; j--) if ('iouü'.includes(low[j])) i = j;
  if (i < 0) return base;
  return (base.slice(0, i + 1) + MARK_OF[tone] + base.slice(i + 1)).normalize('NFC');
}

// ma3 -> mǎ, lv4 -> lǜ
export const keyToPinyin = (key) => withTone(key.slice(0, -1).replace(/v/g, 'ü'), Number(key.slice(-1)));

// Пиньинь в обычной орфографии («rénkǒu», «yí ge rén», «Xī'ān») -> HTML, каждый слог в цвете своего тона.
export const pinyinHtml = (pinyin) => esc(pinyin).replace(SYLLABLE, (s) => `<span class="t${toneOf(s)}">${s}</span>`);

// Пиньинь в тексте урока: <span class="py">Nǐ hǎo!</span>. Знаки препинания остаются на месте.
export function colorize(el) {
  el.innerHTML = pinyinHtml(el.textContent);
}

// ---------- Звук ----------

export const syllablesOf = (pinyin) => pinyin.match(SYLLABLE) ?? [];

let manifest;
let player; // один элемент на всю страницу: iOS разрешает ему играть после первого нажатия
let turn = 0; // новое нажатие прерывает то, что звучит сейчас
let warned = false;

const fileOf = (key) => {
  if (manifest.word.includes(key)) return `audio/word/${encodeURIComponent(key)}.mp3`;
  if (SYLLABLE_KEY.test(key) && manifest.syl.includes(key)) return `audio/syl/${key}.mp3`;
  return null;
};

function play(file) {
  player ??= new Audio();
  return new Promise((resolve) => {
    player.onended = player.onerror = resolve;
    player.src = dataUrl(file);
    player.play().catch(resolve);
  });
}

// key: иероглиф, слово, слог вида ma3 или несколько частей через пробел («妈妈 ma4 ma3 吗»).
// Порядок: запись носителя, затем синтезатор речи с китайским голосом, затем слоги носителя по очереди.
export async function say(key, pinyin) {
  manifest ??= await loadAudioIndex().catch(() => ({ word: [], syl: [] }));
  const my = ++turn;
  player?.pause();
  window.speechSynthesis?.cancel();
  const parts = key.trim().split(/\s+/);
  for (const part of parts) {
    if (my !== turn) return;
    await sayOne(part, parts.length === 1 ? pinyin : null, () => my === turn);
  }
}

async function sayOne(key, pinyin, current) {
  const syl = pinyin ? syllablesOf(pinyin) : [];
  const file = fileOf(key) ?? (syl.length === 1 ? fileOf(numbered(syl[0])) : null);
  if (file) return play(file);
  if (SYLLABLE_KEY.test(key) || await speak(key)) return;
  const keys = syl.map(numbered);
  if (keys.length && keys.every(fileOf)) {
    for (const k of keys) if (current()) await play(fileOf(k));
    return;
  }
  if (!warned) {
    warned = true;
    toast('Для этого слова нет записи носителя, а в браузере нет китайского голоса. Лучше всего курс звучит в Microsoft Edge: китайские голоса в нем уже есть.');
  }
}

async function chineseVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  let voices = synth.getVoices();
  if (!voices.length) { // список голосов загружается не сразу
    voices = await new Promise((resolve) => {
      synth.addEventListener('voiceschanged', () => resolve(synth.getVoices()), { once: true });
      setTimeout(() => resolve(synth.getVoices()), 1500);
    });
  }
  const zh = voices.filter((v) => /^zh[-_]CN$/i.test(v.lang));
  return zh.find((v) => /xiaoxiao|晓晓|yunxi|云希|google|huihui|tingting/i.test(v.name)) ?? zh[0] ?? null;
}

// true, если фраза прочитана китайским голосом.
async function speak(text) {
  const voice = await chineseVoice();
  if (!voice) return false;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    u.onend = () => resolve(true);
    u.onerror = (e) => resolve(e.error === 'interrupted' || e.error === 'canceled');
    setTimeout(() => window.speechSynthesis.speak(u), 50); // сразу после cancel() Chrome иногда теряет фразу
  });
}

export const sayButton = (key, pinyin, label = '') =>
  h('button', { class: 'say', type: 'button', 'data-say': key, 'data-py': pinyin, title: 'Послушать' }, label);

// ---------- Страница ----------

export function toast(text) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 7000);
}

const pageUrl = (file) => new URL(`../${file}`, import.meta.url).href;

export function initPage() {
  document.documentElement.classList.add('ready');
  const here = location.href.split(/[?#]/)[0];
  const link = (file, text) => h('a', { href: pageUrl(file), 'aria-current': here === pageUrl(file) ? 'page' : null }, text);
  document.body.prepend(h('nav', { class: 'topbar' },
    h('a', { class: 'brand', href: pageUrl('index.html') }, h('span', { class: 'brand-mark' }, '中'), h('span', { class: 'brand-text' }, 'Китайский с нуля')),
    h('div', { class: 'topbar-links' }, link('index.html', 'Уроки'), link('dictionary.html', 'Словарь'), link('review.html', 'Повторение')),
  ));
  for (const el of document.querySelectorAll('.py')) colorize(el);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-say]');
    if (btn) say(btn.dataset.say, btn.dataset.py);
  });
}

export { pageUrl };
