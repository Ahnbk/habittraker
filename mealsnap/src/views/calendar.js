import { h, pad, WD, todayKey } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { thumbUrl } from '../lazy.js';
import { iconBtn, onMealsChanged, swipe } from '../ui.js';
import { pref } from '../prefs.js';
import { backupBanner } from '../banner.js';

const state = { y: null, m: null }; // 달력 보던 달을 기억 (하루 화면에서 돌아와도 유지)

export default function mount(root) {
  const now = new Date();
  if (state.y == null) { state.y = now.getFullYear(); state.m = now.getMonth(); }

  const title = h('button', { class: 'month-title', onclick: () => jump(now.getFullYear(), now.getMonth(), 0) });
  const todayChip = h('button', { class: 'chip', onclick: () => jump(now.getFullYear(), now.getMonth(), 0) }, '오늘');
  const weekRow = h('div', { class: 'weekdays' }, WD.map((d, i) => h('span', { class: i === 0 ? 'sun' : i === 6 ? 'sat' : '' }, d)));
  const grid = h('div', { class: 'grid' });
  const bannerBox = h('div', { class: 'banner-box' });
  const bn = backupBanner(bannerBox);
  const body = h('div', { class: 'cal-body' }, weekRow, grid);

  root.append(
    h('header', { class: 'bar' },
      h('div', { class: 'bar-title row' }, title, todayChip),
      iconBtn('left', '이전 달', () => shift(-1)),
      iconBtn('right', '다음 달', () => shift(1))),
    body, bannerBox);

  function jump(y, m, dir) { state.y = y; state.m = m; draw(dir); }
  function shift(d) {
    const t = new Date(state.y, state.m + d, 1);
    jump(t.getFullYear(), t.getMonth(), d);
  }
  swipe(body, { left: () => shift(1), right: () => shift(-1) });

  async function draw(dir = 0) {
    const meals = await db.allMeals();
    const plain = (await pref('calStyle')) === 'count';
    grid.classList.toggle('plain', plain);
    const { y, m } = state;
    const prefix = `${y}-${pad(m + 1)}-`;
    const info = new Map();
    for (const x of meals) {
      if (!x.dateKey.startsWith(prefix)) continue;
      const e = info.get(x.dateKey) || { n: 0 };
      e.n++; e.last = x;
      info.set(x.dateKey, e);
    }
    title.textContent = `${y}년 ${m + 1}월`;
    todayChip.hidden = y === now.getFullYear() && m === now.getMonth();

    const lead = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((lead + days) / 7);
    const today = todayKey();
    grid.style.setProperty('--rows', rows);
    grid.replaceChildren();
    for (let i = 0; i < lead; i++) grid.append(h('span', { class: 'cell blank' }));
    for (let d = 1; d <= days; d++) {
      const key = `${prefix}${pad(d)}`;
      const e = info.get(key);
      const dow = (lead + d - 1) % 7;
      grid.append(h('a', {
        href: `#/day/${key}`,
        class: `cell${e ? ' has' : ''}${key === today ? ' today' : ''}${key > today ? ' future' : ''}`,
        'aria-label': `${m + 1}월 ${d}일${e ? `, 식사 ${e.n}회` : ''}`
      },
      e && !plain && h('img', { src: thumbUrl(e.last), alt: '', draggable: 'false' }),
      h('span', { class: `d${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}` }, d),
      e && h('span', { class: 'n' }, e.n)));
    }
    grid.classList.remove('slide-l', 'slide-r');
    if (dir) { void grid.offsetWidth; grid.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
    bn.refresh();
  }

  const un = [onMealsChanged(() => draw(0)), bn.destroy];
  const retapOff = (() => { const f = ev => { if (ev.detail === 'cal') jump(now.getFullYear(), now.getMonth(), 0); }; window.addEventListener('tab-retap', f); return () => window.removeEventListener('tab-retap', f); })();
  un.push(retapOff);
  draw(0);
  return () => un.forEach(f => f());
}
