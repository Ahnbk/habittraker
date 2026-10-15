import { h, dateLabelFull, timeStr } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { lazyImages } from '../lazy.js';
import { iconBtn, onMealsChanged } from '../ui.js';
import { pref } from '../prefs.js';
import { openViewer } from '../viewer.js';

// 메신저 대화방처럼: 오래된 기록이 위, 최신이 아래. 열면 맨 아래(최근)에서 시작.
export default function mount(root) {
  const list = h('div', { class: 'tl scroll' });
  const toBottom = h('button', { class: 'to-bottom', 'aria-label': '최근으로', hidden: true, onclick: () => toLatest(true) }, icon('down', 22));
  const dateInput = h('input', { type: 'date', class: 'hidden-date', 'aria-label': '날짜로 이동' });
  dateInput.addEventListener('change', () => jumpTo(dateInput.value));

  root.append(
    h('header', { class: 'bar' },
      h('div', { class: 'bar-title' }, h('div', { class: 't1' }, '타임라인'), h('div', { class: 't2', id: 'tl-sub' })),
      iconBtn('jump', '날짜로 이동', () => { try { dateInput.showPicker(); } catch { dateInput.click(); } }),
      dateInput),
    list, toBottom);

  let lazy, first = true, newestFirst = false;
  function jumpTo(key) {
    if (!key) return;
    const secs = [...list.querySelectorAll('section')];
    const target = (newestFirst ? secs.find(s => s.dataset.key <= key) : secs.find(s => s.dataset.key >= key)) || secs[secs.length - 1];
    target?.scrollIntoView({ block: 'start' });
  }
  const toLatest = smooth => list.scrollTo({ top: newestFirst ? 0 : list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  list.addEventListener('scroll', () => {
    const far = newestFirst ? list.scrollTop : list.scrollHeight - list.scrollTop - list.clientHeight;
    toBottom.hidden = far < list.clientHeight * 1.2;
  }, { passive: true });
  const onRetap = ev => { if (ev.detail === 'tl') toLatest(true); };
  window.addEventListener('tab-retap', onRetap);

  async function draw() {
    let meals = await db.allMeals();
    const wasNewestFirst = newestFirst;
    newestFirst = (await pref('tlOrder')) === 'top';
    toBottom.classList.toggle('up', newestFirst);
    if (newestFirst) meals = [...meals].reverse();
    if (wasNewestFirst !== newestFirst) first = true;
    const keepFromBottom = list.scrollHeight - list.scrollTop;
    const keepFromTop = list.scrollTop;
    lazy?.destroy();
    lazy = lazyImages({ root: list, margin: '900px 0px', load: id => db.getPhoto(id) });
    list.replaceChildren();
    root.querySelector('#tl-sub').textContent = meals.length ? `전체 ${meals.length}장` : '';
    if (!meals.length) {
      list.append(h('div', { class: 'empty' }, icon('chat', 56), h('p', { class: 'e1' }, '아직 기록이 없어요'), h('p', { class: 'e2' }, '사진을 찍으면 여기에 대화처럼 쌓여요')));
      return;
    }
    let sec = null, curKey = '';
    for (const m of meals) {
      if (m.dateKey !== curKey) {
        curKey = m.dateKey;
        sec = h('section', { 'data-key': curKey }, h('div', { class: 'day-pill' }, h('span', {}, dateLabelFull(curKey))));
        list.append(sec);
      }
      const img = h('img', { alt: '', draggable: 'false' });
      img.dataset.id = m.id;
      img.style.aspectRatio = `${m.w} / ${m.h}`;
      sec.append(h('div', { class: 'msg' },
        h('span', { class: 'mtime' }, timeStr(m.takenAt)),
        h('button', { class: 'bubble', 'data-id': m.id, onclick: () => openViewer(m.id, { onClose: id => id && focus(id) }), 'aria-label': `${timeStr(m.takenAt)} 사진 보기` }, img)));
      lazy.observe(img);
    }
    if (first) { first = false; toLatest(false); }
    else list.scrollTop = newestFirst ? keepFromTop : list.scrollHeight - keepFromBottom;
  }
  function focus(id) {
    const el = list.querySelector(`.bubble[data-id="${id}"]`);
    el?.scrollIntoView({ block: 'center' });
  }
  const un = onMealsChanged(draw);
  draw();
  return () => { un(); lazy?.destroy(); window.removeEventListener('tab-retap', onRetap); };
}
