import { h, dateLabel, dayTag, timeStr, addDays, todayKey } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { lazyImages } from '../lazy.js';
import { iconBtn, onMealsChanged, swipe } from '../ui.js';
import { openViewer } from '../viewer.js';
import { importFromGallery } from '../flows.js';
import { pref } from '../prefs.js';
import { back, replace } from '../nav.js';
import { backupBanner } from '../banner.js';

// 하루 화면. home=true 이면 앱의 "오늘" 첫 화면.
export default function mount(root, { key, home = false }) {
  const prev = addDays(key, -1), next = addDays(key, 1);
  const isFuture = next > todayKey();
  const goPrev = () => replace(`#/day/${prev}`);
  const goNext = () => { if (!isFuture) replace(next === todayKey() ? '#/today' : `#/day/${next}`); };

  const titleEl = h('div', { class: 't1' }, home ? '오늘' : dateLabel(key));
  const subEl = h('div', { class: 't2' });
  const list = h('div', { class: 'day-list scroll' });
  const bannerBox = h('div', { class: 'banner-box' });
  const bn = home ? backupBanner(bannerBox) : null;
  root.append(
    h('header', { class: 'bar' },
      !home && iconBtn('left', '달력으로', () => back('#/cal')),
      h('div', { class: 'bar-title' }, titleEl, subEl),
      h('div', { class: 'daynav' },
        iconBtn('left', '전날', goPrev, 'sm'),
        iconBtn('right', '다음날', goNext, isFuture ? 'sm disabled' : 'sm'))),
    list,
    home && bannerBox);
  swipe(list, { left: goNext, right: goPrev });

  const permHint = h('p', { class: 'e2 hint', hidden: true }, '처음에는 카메라 사용 허용 창이 떠요. "허용"을 눌러 주세요.');
  let lazy;
  async function draw() {
    bn?.refresh();
    await db.allMeals();
    const layout = await pref('dayLayout');
    const meals = db.mealsOnDay(key);
    const last = meals[meals.length - 1];
    subEl.textContent = home
      ? `${dateLabel(key)} · ${meals.length ? `식사 ${meals.length}회 · 마지막 ${timeStr(last.takenAt)}` : '아직 기록 없음'}`
      : `${dayTag(key)} · ${meals.length ? `식사 ${meals.length}회` : '기록 없음'}`;
    lazy?.destroy();
    lazy = lazyImages({ root: list, margin: '800px 0px', load: id => db.getPhoto(id) });
    list.classList.toggle('g2', layout === 'grid');
    list.replaceChildren();
    if (!meals.length) {
      list.append(h('div', { class: 'empty' },
        icon(home ? 'sun' : 'camera', 56),
        h('p', { class: 'e1' }, home ? '오늘 첫 식사를 기록해 보세요' : '이 날은 기록이 없어요'),
        home && h('p', { class: 'e2' }, '먹기 전에 아래 주황 버튼으로 한 장 찍으면 끝이에요'),
        home && permHint));
    if (!meals.length && home) navigator.permissions?.query({ name: 'camera' }).then(st => { permHint.hidden = st.state !== 'prompt'; }).catch(() => {});
    }
    for (const m of meals) {
      const img = h('img', { alt: `${timeStr(m.takenAt)} 식사 사진`, draggable: 'false' });
      img.dataset.id = m.id;
      img.style.aspectRatio = `${m.w} / ${m.h}`;
      list.append(h('button', { class: 'meal-card', onclick: () => openViewer(m.id), 'aria-label': `${timeStr(m.takenAt)} 사진 보기` },
        img, h('span', { class: 'time' }, timeStr(m.takenAt))));
      lazy.observe(img);
    }
    if (!home || meals.length) {
      list.append(h('button', { class: 'btn ghost add-old', onclick: importFromGallery }, icon('image', 22), '갤러리에서 사진 추가'));
    }
  }
  const un = onMealsChanged(draw);
  draw();
  return () => { un(); lazy?.destroy(); bn?.destroy(); };
}
