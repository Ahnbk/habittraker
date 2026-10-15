import { h, $ } from './util.js';
import { icon } from './icons.js';
import * as db from './db.js';
import { toast } from './ui.js';
import { openCamera } from './camera.js';
import { requestPersist } from './meals.js';
import calendar from './views/calendar.js';
import day from './views/day.js';
import timeline from './views/timeline.js';
import settings from './views/settings.js';

const view = $('#view');
const nav = $('#nav');
let current = null;

const ROUTES = [
  [/^#\/?$/, () => ({ mount: calendar, depth: 1, tab: 'cal' })],
  [/^#\/day\/(\d{4}-\d\d-\d\d)$/, m => ({ mount: day, depth: 2, tab: 'cal', params: { key: m[1] } })],
  [/^#\/timeline$/, () => ({ mount: timeline, depth: 1, tab: 'tl' })],
  [/^#\/settings$/, () => ({ mount: settings, depth: 3, tab: '' })]
];

function route() {
  const hash = location.hash || '#/';
  let r = null;
  for (const [re, make] of ROUTES) { const m = hash.match(re); if (m) { r = make(m); break; } }
  r ||= ROUTES[0][1]();
  const prev = current?.depth ?? 0;
  const root = h('div', { class: `view ${!prev ? '' : r.depth > prev ? 'in-fwd' : r.depth < prev ? 'in-back' : 'in-fade'}` });
  current?.unmount?.();
  current?.root.remove();
  view.append(root);
  current = { root, depth: r.depth, unmount: r.mount(root, r.params || {}) };
  nav.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === r.tab));
}

async function capture() {
  const n = await openCamera();
  if (n > 0) toast({ text: `${n}장 저장했어요`, ms: 2500 });
}

nav.append(
  h('a', { class: 'tab', href: '#/', 'data-tab': 'cal' }, icon('calendar', 26), h('span', {}, '달력')),
  h('button', { id: 'shutter', 'aria-label': '사진 찍기', onclick: capture }, icon('camera', 34)),
  h('a', { class: 'tab', href: '#/timeline', 'data-tab': 'tl' }, icon('chat', 26), h('span', {}, '타임라인')));

window.addEventListener('hashchange', route);
route();

(async () => {
  await db.allMeals();
  requestPersist();
  if (await db.getSetting('autoCamera', false) && !sessionStorage.getItem('opened')) {
    sessionStorage.setItem('opened', '1');
    capture();
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
}
