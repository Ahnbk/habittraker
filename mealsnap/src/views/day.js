import { h, dateLabel, dayTag, timeStr, addDays, todayKey } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { lazyImages } from '../lazy.js';
import { iconBtn, settingsBtn, onMealsChanged, swipe } from '../ui.js';
import { openViewer } from '../viewer.js';
import { importFromGallery } from '../flows.js';

export default function mount(root, { key }) {
  const prev = addDays(key, -1), next = addDays(key, 1);
  const isFuture = next > todayKey();
  const titleEl = h('div', { class: 't1' }, dateLabel(key));
  const subEl = h('div', { class: 't2' });
  const list = h('div', { class: 'day-list scroll' });
  root.append(
    h('header', { class: 'bar' },
      iconBtn('left', '달력으로', () => { location.hash = '#/'; }),
      h('div', { class: 'bar-title' }, titleEl, subEl),
      h('div', { class: 'daynav' },
        iconBtn('left', '전날', () => { location.hash = `#/day/${prev}`; }, 'sm'),
        iconBtn('right', '다음날', () => { if (!isFuture) location.hash = `#/day/${next}`; }, isFuture ? 'sm disabled' : 'sm')),
      settingsBtn()),
    list);
  swipe(list, { left: () => { if (!isFuture) location.hash = `#/day/${next}`; }, right: () => { location.hash = `#/day/${prev}`; } });

  let lazy;
  async function draw() {
    await db.allMeals();
    const meals = db.mealsOnDay(key);
    subEl.textContent = `${dayTag(key)} · ${meals.length ? `식사 ${meals.length}회` : '기록 없음'}`;
    lazy?.destroy();
    lazy = lazyImages({ root: list, margin: '800px 0px', load: id => db.getPhoto(id) });
    list.replaceChildren();
    if (!meals.length) {
      list.append(h('div', { class: 'empty' },
        icon('camera', 56),
        h('p', { class: 'e1' }, '이 날은 기록이 없어요'),
        key === todayKey() && h('p', { class: 'e2' }, '아래 주황 버튼으로 먹기 전에 한 장 찍어 보세요')));
    }
    for (const m of meals) {
      const img = h('img', { alt: '', draggable: 'false' });
      img.dataset.id = m.id;
      img.style.aspectRatio = `${m.w} / ${m.h}`;
      list.append(h('button', { class: 'meal-card', onclick: () => openViewer(m.id), 'aria-label': `${timeStr(m.takenAt)} 사진 보기` },
        img, h('span', { class: 'time' }, timeStr(m.takenAt))));
      lazy.observe(img);
    }
    list.append(h('button', { class: 'btn ghost add-old', onclick: importFromGallery }, icon('image', 22), '갤러리에서 사진 추가'));
  }
  const un = onMealsChanged(draw);
  draw();
  return () => { un(); lazy?.destroy(); };
}
