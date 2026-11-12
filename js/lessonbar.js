// Панель урока: оглавление с текущим разделом, возврат к месту чтения, показ пиньиня и перевода в списках слов.
import { load, savePlace } from './progress.js';
import { h, pageUrl } from './ui.js';

const VIEW_KEY = 'zh-course-view';

function readView() {
  try {
    return { py: true, ru: true, ...JSON.parse(localStorage.getItem(VIEW_KEY)) };
  } catch {
    return { py: true, ru: true };
  }
}

// Кнопки «пиньинь» и «перевод»: скрытое в списках слов размыто и открывается нажатием на строку.
function viewToggles() {
  const view = readView();
  const buttons = [['py', 'пиньинь'], ['ru', 'перевод']].map(([key, text]) => h('button', {
    type: 'button',
    class: 'view-toggle',
    title: `Показывать ${text} в списках слов`,
    onclick: () => {
      view[key] = !view[key];
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      } catch {
        // без хранилища выбор живет до перезагрузки страницы
      }
      apply();
    },
  }, text));
  const apply = () => {
    document.documentElement.classList.toggle('hide-py', !view.py);
    document.documentElement.classList.toggle('hide-ru', !view.ru);
    buttons[0].setAttribute('aria-pressed', view.py);
    buttons[1].setAttribute('aria-pressed', view.ru);
    for (const li of document.querySelectorAll('.words li.shown')) li.classList.remove('shown');
  };
  apply();
  document.addEventListener('click', (e) => {
    const li = e.target.closest('.words li');
    if (li && !e.target.closest('.hz, .say')) li.classList.toggle('shown');
  });
  return buttons;
}

export function lessonBar(lessonId) {
  const sections = [...document.querySelectorAll('main > section')].map((el, i) => {
    el.id ||= `sec-${i + 1}`;
    return { el, title: el.querySelector('h2, h3')?.textContent.trim() ?? `Раздел ${i + 1}` };
  });
  const label = h('span');
  const links = sections.map((s) => h('a', { href: `#${s.el.id}` }, s.title));
  const toc = h('details', { class: 'toc' }, h('summary', {}, label),
    h('div', { class: 'toc-panel' },
      h('a', { class: 'toc-home', href: pageUrl('index.html') }, '← Все уроки'),
      h('ol', {}, links.map((a) => h('li', {}, a)))));
  document.addEventListener('click', (e) => {
    if (e.target.closest('.toc-panel a') || !toc.contains(e.target)) toc.open = false;
  });
  const bar = h('nav', { class: 'lesson-bar', 'aria-label': 'Разделы урока' },
    h('div', { class: 'lesson-bar-in' }, toc, document.querySelector('.words') ? viewToggles() : null));
  document.querySelector('.topbar').after(bar);

  // Место, где чтение остановилось в прошлый раз.
  const saved = load().lessons[lessonId];
  if (!saved?.done && saved?.at >= 1 && sections[saved.at]) {
    document.querySelector('.lesson-head').after(h('p', { class: 'resume' },
      `В прошлый раз чтение остановилось на разделе «${sections[saved.at].title}». `,
      h('a', { class: 'btn', href: `#${sections[saved.at].el.id}` }, 'Перейти к разделу')));
  }

  let current = null;
  let queued = false;
  const update = () => {
    queued = false;
    const line = bar.getBoundingClientRect().bottom + 24;
    const depth = document.documentElement.scrollHeight - innerHeight;
    // Короткий последний раздел не доходит до верха экрана, поэтому конец страницы считается им.
    const at = depth > 0 && scrollY >= depth - 4 ? sections.length - 1
      : sections.findLastIndex((s) => s.el.getBoundingClientRect().top <= line);
    bar.style.setProperty('--read', `${depth > 0 ? Math.min(100, (scrollY / depth) * 100) : 0}%`);
    if (at === current) return;
    current = at;
    label.textContent = at < 0 ? `Разделы урока: ${sections.length}` : `${at + 1} из ${sections.length} · ${sections[at].title}`;
    links.forEach((a, i) => a.toggleAttribute('aria-current', i === at));
    if (at >= 0) savePlace(lessonId, at);
  };
  addEventListener('scroll', () => {
    if (!queued) setTimeout(update, 100);
    queued = true;
  }, { passive: true });
  update();
}
