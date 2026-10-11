// Тренажер черт, карточка иероглифа, справочник черт и всплывающее окно со знаком.
import { loadChars, loadHanzi, loadStrokeTypes } from './data.js';
import { esc, h, pinyinHtml, plural, sayButton } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
export const S = 300; // логический размер поля, в нем же считаются координаты
const PAD = 18;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

export const KIND = {
  pictogram: 'картинка',
  indicative: 'указатель',
  ideogram: 'смысловое сочетание',
  phonosemantic: 'смысл + звук',
  loan: 'взят по созвучию',
};

export const strokesWord = (n) => plural(n, 'черта', 'черты', 'черт');

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.append(el);
  return el;
}

const pathD = (pts) => `M${pts.map((p) => p.join(' ')).join('L')}`;
const lengthOf = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// Начало осевой линии отодвигается назад, чтобы толстая анимированная линия закрыла скругленный край черты.
function extendStart(pts, dist) {
  if (pts.length < 2) return pts;
  const [[x0, y0], [x1, y1]] = pts;
  const len = Math.hypot(x0 - x1, y0 - y1) || 1;
  return [[x0 + ((x0 - x1) / len) * dist, y0 + ((y0 - y1) / len) * dist], ...pts.slice(1)];
}

// Иероглиф в SVG: черты до done темные, current выделена, остальные бледным контуром (если ghost).
export function drawChar(svg, data, { done = data.strokes.length, current = -1, ghost = true } = {}) {
  const tf = HanziWriter.getScalingTransform(S, S, PAD);
  const g = svgEl('g', { transform: tf.transform }, svg);
  data.strokes.forEach((d, i) => {
    const cls = i === current ? 'st-current' : i < done ? 'st-done' : 'st-todo';
    if (cls !== 'st-todo' || ghost) svgEl('path', { d, class: cls }, g);
  });
  return { g, tf };
}

export function miniChar(data, opts) {
  const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, 'aria-hidden': 'true' });
  drawChar(svg, data, opts);
  return svg;
}

function animateStroke(g, d, median, animate, onDone) {
  const id = `clip${++uid}`;
  svgEl('path', { d }, svgEl('clipPath', { id }, g));
  const pts = extendStart(median, 100);
  const len = lengthOf(pts) + 100;
  const path = svgEl('path', {
    d: pathD(pts), class: 'st-anim', 'clip-path': `url(#${id})`,
    'stroke-dasharray': `${len} ${len}`, 'stroke-dashoffset': animate ? len : 0,
  }, g);
  if (!animate) return onDone();
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
    { duration: Math.max(350, len * 0.9), easing: 'ease-in-out', fill: 'forwards' }).onfinish = onDone;
}

function arrow(g, median) {
  const id = `arrow${++uid}`;
  const marker = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3, markerHeight: 3, orient: 'auto' }, g);
  svgEl('path', { d: 'M0 0L10 5L0 10z', class: 'st-arrowhead' }, marker);
  svgEl('path', { d: pathD(median), class: 'st-arrow', 'marker-end': `url(#${id})` }, g);
}

// Номера черт у их начала, чуть снаружи, против направления движения кисти.
function numbers(svg, data, tf, idxs, cls) {
  const layer = svgEl('g', { class: cls }, svg);
  for (const i of idxs) {
    const m = data.medians[i];
    const [x0, y0] = m[0];
    const [x1, y1] = m[Math.min(2, m.length - 1)];
    const len = Math.hypot(x0 - x1, y0 - y1) || 1;
    const clamp = (v) => Math.min(S - 11, Math.max(11, v));
    const cx = clamp(tf.x + x0 * tf.scale + ((x0 - x1) / len) * 13);
    const cy = clamp(S - tf.y - y0 * tf.scale - ((y0 - y1) / len) * 13);
    svgEl('circle', { cx, cy, r: 10 }, layer);
    svgEl('text', { x: cx, y: cy }, layer).textContent = i + 1;
  }
}

// Hanzi Writer с цветами курса: анимация и проверка рисования.
export function createWriter(target, ch, size, options = {}) {
  return HanziWriter.create(target, ch, {
    width: size,
    height: size,
    padding: Math.round((size * PAD) / S),
    showCharacter: false,
    strokeColor: css('--ink'),
    outlineColor: css('--outline'),
    highlightColor: css('--accent'),
    drawingColor: css('--ink'),
    drawingWidth: Math.max(4, Math.round(size / 45)),
    strokeAnimationSpeed: 1,
    strokeHighlightSpeed: 1.5,
    delayBetweenStrokes: 250,
    charDataLoader: (c, ok, fail) => loadHanzi(c).then(ok, fail),
    ...options,
  });
}

// Лента порядка черт: кадр k показывает черты с первой по k-ю, последняя выделена.
function frames(data, onPick) {
  return [...Array(data.strokes.length).keys()].map((i) => h('button', {
    type: 'button', class: 'frame grid', title: `Черта ${i + 1}`, onclick: () => onPick(i + 1),
  }, miniChar(data, { done: i, current: i, ghost: false }), h('span', { class: 'frame-no' }, i + 1)));
}

// Лента в тексте урока: <span data-frames="十"></span>. Клик открывает знак на нужном шаге.
export async function framesStrip(ch) {
  return h('span', { class: 'strip inline-strip', lang: 'zh-CN' }, frames(await loadHanzi(ch), (k) => popupChar(ch, k)));
}

const MODES = [['steps', 'По шагам'], ['animate', 'Целиком'], ['trace', 'Обводка'], ['memory', 'По памяти']];

export async function strokeViewer(ch, { step: startStep = 0 } = {}) {
  const [data, chars, types] = await Promise.all([loadHanzi(ch), loadChars(), loadStrokeTypes()]);
  const n = data.strokes.length;
  const names = chars[ch]?.strokes;
  const nameOf = (i) => (names ? ` · ${names[i]}` : '');
  let step = startStep;
  let writer = null;
  let mode = 'steps';

  const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, class: 'stage-svg', role: 'img', 'aria-label': `Порядок черт знака ${ch}` });
  const hw = h('div', { class: 'stage-hw', hidden: true });
  const stage = h('div', { class: 'stage grid' }, svg, hw);
  const caption = h('div', { class: 'caption', 'aria-live': 'polite' });
  const setCaption = (html) => { caption.innerHTML = html; };
  const prev = h('button', { type: 'button', class: 'ctl', title: 'Предыдущая черта', onclick: () => show(step - 1) }, '◀');
  const next = h('button', { type: 'button', class: 'ctl', title: 'Следующая черта', onclick: () => show(step + 1) }, '▶');
  const again = h('button', { type: 'button', class: 'ctl', title: 'Еще раз', onclick: () => (mode === 'steps' ? show(step) : setMode(mode)) }, '↻');
  const modes = h('div', { class: 'modes', role: 'group', 'aria-label': 'Режим' },
    MODES.map(([m, label]) => h('button', { type: 'button', 'data-mode': m, onclick: () => setMode(m) }, label)));
  const strip = h('div', { class: 'strip', 'aria-label': 'Порядок черт по кадрам' }, frames(data, (k) => show(k)));
  const root = h('div', { class: 'viewer', tabindex: '0' }, modes, stage, h('div', { class: 'controls' }, prev, again, next), caption, strip);
  root.addEventListener('keydown', (e) => {
    if (mode !== 'steps') return;
    if (e.key === 'ArrowLeft') show(step - 1);
    else if (e.key === 'ArrowRight') show(step + 1);
    else return;
    e.preventDefault();
  });

  function show(k, animate = true) {
    step = Math.max(0, Math.min(n, k));
    svg.replaceChildren();
    if (step === 0) {
      const { tf } = drawChar(svg, data);
      numbers(svg, data, tf, [...Array(n).keys()], 'num');
      setCaption(`<b>${n} ${strokesWord(n)}</b>. Цифры у начала черт показывают порядок, кнопка ▶ ведет по чертам одну за другой.`);
    } else {
      const cur = step - 1;
      const { g, tf } = drawChar(svg, data, { done: cur });
      animateStroke(g, data.strokes[cur], data.medians[cur], animate && !reduceMotion, () => arrow(g, data.medians[cur]));
      numbers(svg, data, tf, [cur], 'num num-current');
      const t = names && types[names[cur]];
      setCaption(`<b>Черта ${step} из ${n}</b>${t ? ` · <span lang="zh-CN">${names[cur]}</span> ${t.pinyin} — ${t.ru}` : ''}`
        + (t ? `<p>${esc(t.how)}</p><p class="muted">Образ: ${esc(t.like)}</p>` : ''));
    }
    prev.disabled = step === 0;
    next.disabled = step === n;
    [...strip.children].forEach((f, i) => f.toggleAttribute('aria-current', i === step - 1));
  }

  function setMode(m) {
    mode = m;
    for (const b of modes.children) b.setAttribute('aria-pressed', b.dataset.mode === m);
    const steps = m === 'steps';
    svg.style.display = steps ? '' : 'none';
    hw.hidden = steps;
    strip.hidden = !steps;
    prev.hidden = next.hidden = !steps;
    writer?.cancelQuiz();
    if (steps) return show(step, false);
    writer ??= createWriter(hw, ch, Math.round(Math.min(stage.clientWidth || S, S)),
      { radicalColor: data.radStrokes ? css('--radical') : null });
    if (m === 'animate') {
      writer.updateColor('outlineColor', css('--outline'));
      writer.showOutline();
      writer.hideCharacter({ duration: 0 });
      setCaption(data.radStrokes ? 'Все черты по порядку. Цветом выделен ключ — смысловая часть знака.' : 'Все черты по порядку.');
      writer.animateCharacter({ onComplete: () => setCaption('Готово. Кнопка ↻ повторяет анимацию.') });
      return;
    }
    const trace = m === 'trace';
    writer.updateColor('outlineColor', css(trace ? '--trace' : '--outline'));
    if (trace) writer.showOutline(); else writer.hideOutline();
    setCaption(trace
      ? 'Обводка, как в китайских прописях: черты рисуются мышью или пальцем поверх красного контура, по порядку и в нужную сторону.'
      : 'По памяти: контура нет. После трех промахов на поле мигает подсказка.');
    writer.quiz({
      showHintAfterMisses: 3,
      onCorrectStroke: ({ strokeNum }) => setCaption(`Верно: черта ${strokeNum + 1} из ${n}${nameOf(strokeNum)}.`),
      onMistake: ({ strokeNum }) => setCaption(`Не та черта или не то направление. Сейчас нужна черта ${strokeNum + 1}${nameOf(strokeNum)}.`),
      onComplete: ({ totalMistakes }) => setCaption(totalMistakes
        ? `Готово! Ошибок: ${totalMistakes}. Кнопка ↻ начинает заново.`
        : 'Готово, без единой ошибки! Кнопка ↻ начинает заново.'),
    });
  }

  setMode('steps');
  return root;
}

// Китайские знаки в тексте становятся ссылками на всплывающее окно с порядком черт.
export const hzLinks = (text) => esc(text).replace(/[\u3400-\u4dbf\u4e00-\u9fff]/g, (c) => `<span class="hz" lang="zh-CN">${c}</span>`);

export function wordList(words) {
  return h('ul', { class: 'words' }, words.map(([hz, py, ru]) => h('li', {},
    h('span', { class: 'word-hz', lang: 'zh-CN', html: hzLinks(hz) }),
    h('span', { class: 'word-py', html: pinyinHtml(py) }),
    h('span', { class: 'word-ru' }, ru),
    sayButton(hz, py))));
}

// mnemonic — список образов, sound — зацепка для чтения и тона.
const NOTES = [['mnemonic', 'Ассоциации'], ['sound', 'Как запомнить чтение'], ['origin', 'История'], ['write', 'Как писать'], ['trap', 'Не перепутать']];

const noteBody = (value) => (Array.isArray(value)
  ? h('ul', {}, value.map((v) => h('li', { html: hzLinks(v) })))
  : h('p', { html: hzLinks(value) }));

export async function charCard(ch, { step } = {}) {
  const e = (await loadChars())[ch];
  const facts = [`${e.strokes.length} ${strokesWord(e.strokes.length)}`, `ключ ${e.radical}`, KIND[e.kind],
    e.parts && `состав ${e.parts.join(' + ')}`, e.trad && `полная форма ${e.trad}`];
  return h('article', { class: 'card', id: `char-${ch}` },
    h('div', { class: 'card-viewer' }, await strokeViewer(ch, { step })),
    h('div', { class: 'card-body' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-char', lang: 'zh-CN' }, ch),
        h('div', {},
          h('div', { class: 'card-py', html: pinyinHtml(e.pinyin) }, sayButton(ch, e.pinyin)),
          h('div', { class: 'card-meaning' }, e.meaning, e.emoji ? ` ${e.emoji}` : ''),
          h('div', { class: 'card-facts', html: hzLinks(facts.filter(Boolean).join(' · ')) }))),
      NOTES.filter(([k]) => e[k]).map(([k, title]) => h('section', { class: `note ${k}` }, h('h4', {}, title), noteBody(e[k]))),
      e.words?.length ? h('section', { class: 'card-words' }, h('h4', {}, 'Слова'), wordList(e.words)) : null));
}

let dialog;

export async function popupChar(ch, step) {
  dialog ??= document.body.appendChild(h('dialog', { class: 'popup', onclick: (e) => e.target === dialog && dialog.close() }));
  const chars = await loadChars();
  let body;
  try {
    body = chars[ch]
      ? await charCard(ch, { step })
      : h('div', { class: 'popup-solo' }, h('div', { class: 'card-char', lang: 'zh-CN' }, ch), await strokeViewer(ch, { step }),
        h('p', { class: 'muted' }, 'Этого знака нет среди карточек этапа, но порядок его черт можно посмотреть.'));
  } catch {
    body = h('p', {}, `Для знака ${ch} нет данных о чертах.`);
  }
  dialog.replaceChildren(h('div', { class: 'popup-inner' },
    h('button', { class: 'popup-close', type: 'button', 'aria-label': 'Закрыть', onclick: () => dialog.close() }, '×'), body));
  if (!dialog.open) dialog.showModal();
}

// Каждый иероглиф в тексте страницы открывает порядок своих черт. Кнопки и виджеты не трогаются.
export function linkHanzi(root) {
  const skip = 'button, .hz, svg, title, [data-cards], [data-strokes], [data-stroke-types], [data-exercises]';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(n.data) && !n.parentElement.closest(skip)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) n.replaceWith(document.createRange().createContextualFragment(hzLinks(n.data)));
}

export function enableCharPopups() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.hz');
    if (el) popupChar(el.textContent);
  });
}

// Таблица типов черт: пример знака с выделенной чертой, клик открывает этот знак на нужном шаге.
export async function strokeTypeTable(group) {
  const types = await loadStrokeTypes();
  const list = Object.entries(types).filter(([, t]) => (group === 'basic') === Boolean(t.basic));
  const data = await Promise.all(list.map(([, t]) => loadHanzi(t.example[0])));
  return h('div', { class: 'stroke-types' }, list.map(([name, t], i) => {
    const [ch, idx] = t.example;
    return h('button', { type: 'button', class: 'stroke-type', onclick: () => popupChar(ch, idx + 1) },
      h('span', { class: 'type-pic grid' }, miniChar(data[i], { current: idx })),
      h('span', { class: 'type-text' },
        h('span', { class: 'type-name' }, h('span', { lang: 'zh-CN' }, name), ` ${t.pinyin}`),
        h('span', { class: 'type-ru' }, t.ru),
        h('span', { class: 'type-how' }, t.how),
        h('span', { class: 'type-like' }, `Образ: ${t.like}`)));
  }));
}
