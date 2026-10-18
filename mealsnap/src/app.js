import { h, $, todayKey, setDayStart, native } from './util.js';
import { icon } from './icons.js';
import * as db from './db.js';
import { toast } from './ui.js';
import { openCamera, systemCamera } from './camera.js';
import { requestPersist } from './meals.js';
import { pref, applyTheme, startHash } from './prefs.js';
import { track, replace, retap } from './nav.js';
import calendar from './views/calendar.js';
import day from './views/day.js';
import timeline from './views/timeline.js';
import settings from './views/settings.js';

const view = $('#view');
const nav = $('#nav');
let current = null;

const ROUTES = [
  [/^#\/today$/, () => ({ mount: day, depth: 1, tab: 'today', params: { key: todayKey(), home: true } })],
  [/^#\/cal$/, () => ({ mount: calendar, depth: 1, tab: 'cal' })],
  [/^#\/day\/(\d{4}-\d\d-\d\d)$/, m => ({ mount: day, depth: 2, tab: 'cal', params: { key: m[1] } })],
  [/^#\/timeline$/, () => ({ mount: timeline, depth: 1, tab: 'tl' })],
  [/^#\/settings$/, () => ({ mount: settings, depth: 1, tab: 'set' })]
];

function route() {
  const hash = location.hash;
  let r = null;
  for (const [re, make] of ROUTES) { const m = hash.match(re); if (m) { r = make(m); break; } }
  r ||= ROUTES[0][1]();
  track(hash);
  const prev = current?.depth ?? 0;
  const dir = !prev ? '' : r.depth > prev ? 'in-fwd' : r.depth < prev ? 'in-back' : 'in-fade';
  const root = h('div', { class: `view ${dir}` });
  current?.unmount?.();
  current?.root.remove();
  view.append(root);
  current = { root, depth: r.depth, tab: r.tab, key: r.params?.key, home: !!r.params?.home, unmount: r.mount(root, r.params || {}) };
  nav.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === r.tab;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
}

async function capture() {
  const n = (!native() && (await pref('shootMode')) === 'system') ? await systemCamera() : await openCamera();
  if (n > 0) {
    toast({
      text: `${n}장 저장했어요`, ms: 3000,
      ...(current?.tab !== 'today' ? { action: '오늘 보기', onAction: () => replace('#/today') } : {})
    });
  }
}

const tab = (hash, key, ico, label) => h('a', {
  class: 'tab', href: hash, 'data-tab': key,
  onclick: e => {
    e.preventDefault();
    if (location.hash === hash) retap(key);
    else replace(hash);
  }
}, icon(ico, 26), h('span', {}, label));

nav.append(
  tab('#/today', 'today', 'sun', '오늘'),
  tab('#/cal', 'cal', 'calendar', '달력'),
  h('button', { id: 'shutter', 'aria-label': '사진 찍기', onclick: capture }, icon('camera', 34)),
  tab('#/timeline', 'tl', 'chat', '타임라인'),
  tab('#/settings', 'set', 'gear', '설정'));

window.addEventListener('hashchange', route);
// 자정을 넘겨 다시 열었을 때 "오늘" 화면이 어제에 머물지 않게.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && current?.home && current.key !== todayKey()) route();
});

(async () => {
  await db.allMeals();
  setDayStart(await pref('dayStart'));
  const start = await pref('start');
  applyTheme(await pref('theme'));
  const fresh = !/^#\/(today|cal|timeline|settings|day\/)/.test(location.hash);
  if (fresh) history.replaceState(history.state, '', startHash(start));
  route();
  requestPersist();
  if (fresh && start === 'camera' && !sessionStorage.getItem('opened')) {
    sessionStorage.setItem('opened', '1');
    capture();
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !native()) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast({ text: '새 버전이 적용됐어요', action: '다시 열기', onAction: () => location.reload(), ms: 12000 });
  });
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
}
