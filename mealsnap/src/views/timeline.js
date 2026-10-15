import { h, dateLabelFull, timeStr } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { lazyImages } from '../lazy.js';
import { iconBtn, onMealsChanged } from '../ui.js';
import { openViewer } from '../viewer.js';
import { pref } from '../prefs.js';

const CHUNK = 400; // 한 번에 그리는 기록 수 (많아도 열자마자 빠르게). 스크롤하면 이어서 불러온다.

// 메신저 대화방처럼: 기본은 오래된 기록이 위, 최신이 아래. 열면 최근에서 시작.
export default function mount(root) {
  const list = h('div', { class: 'tl scroll' });
  const toBottom = h('button', { class: 'to-bottom', 'aria-label': '최근으로', hidden: true, onclick: () => toLatest(true) }, icon('down', 22));
  const dateInput = h('input', { type: 'date', class: 'hidden-date', 'aria-label': '날짜로 이동' });
  dateInput.addEventListener('change', () => jumpTo(dateInput.value));
  const sub = h('div', { class: 't2' });

  root.append(
    h('header', { class: 'bar' },
      h('div', { class: 'bar-title' }, h('div', { class: 't1' }, '타임라인'), sub),
      iconBtn('jump', '날짜로 이동', () => { try { dateInput.showPicker(); } catch { dateInput.click(); } }),
      dateInput),
    list, toBottom);

  let lazy, ordered = [], newestFirst = false, lo = 0, hi = 0, first = true, busy = false;

  const toLatest = smooth => list.scrollTo({ top: newestFirst ? 0 : list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  const onRetap = ev => { if (ev.detail === 'tl') toLatest(true); };
  window.addEventListener('tab-retap', onRetap);

  function anchor() {
    const top = list.getBoundingClientRect().top;
    for (const el of list.querySelectorAll('.bubble')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top + 8) return { id: el.dataset.id, off: r.top - top };
    }
    return null;
  }
  function build(keep) {
    lazy?.destroy();
    lazy = lazyImages({ root: list, margin: '900px 0px', load: id => db.getPhoto(id) });
    list.replaceChildren();
    if (!ordered.length) {
      list.append(h('div', { class: 'empty' }, icon('chat', 56), h('p', { class: 'e1' }, '아직 기록이 없어요'), h('p', { class: 'e2' }, '사진을 찍으면 여기에 대화처럼 쌓여요')));
      return;
    }
    let sec = null, curKey = '';
    for (const m of ordered.slice(lo, hi)) {
      if (m.dateKey !== curKey) {
        curKey = m.dateKey;
        sec = h('section', { 'data-key': curKey }, h('div', { class: 'day-pill' }, h('span', {}, dateLabelFull(curKey))));
        list.append(sec);
      }
      const img = h('img', { alt: `${timeStr(m.takenAt)} 식사 사진`, draggable: 'false' });
      img.dataset.id = m.id;
      img.style.aspectRatio = `${m.w} / ${m.h}`;
      sec.append(h('div', { class: 'msg' },
        h('span', { class: 'mtime' }, timeStr(m.takenAt)),
        h('button', { class: 'bubble', 'data-id': m.id, onclick: () => openViewer(m.id, { onClose: id => id && focus(id) }), 'aria-label': `${timeStr(m.takenAt)} 사진 보기` }, img)));
      lazy.observe(img);
    }
    if (keep) {
      const el = list.querySelector(`.bubble[data-id="${keep.id}"]`);
      if (el) list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - keep.off;
    }
  }
  function range(count) {
    if (newestFirst) { lo = 0; hi = Math.min(ordered.length, count); }
    else { hi = ordered.length; lo = Math.max(0, ordered.length - count); }
  }
  async function load() {
    const all = await db.allMeals();
    const wasNewest = newestFirst;
    newestFirst = (await pref('tlOrder')) === 'top';
    toBottom.classList.toggle('up', newestFirst);
    ordered = newestFirst ? [...all].reverse() : all;
    sub.textContent = all.length ? `전체 ${all.length}장` : '';
    const keep = first || wasNewest !== newestFirst ? null : anchor();
    range(Math.max(CHUNK, hi - lo));
    build(keep);
    if (first || wasNewest !== newestFirst) { first = false; toLatest(false); }
  }

  // 더 오래된 기록(바닥 모드는 위, 최신순 모드는 아래)을 스크롤 끝 근처에서 이어 붙인다.
  function more() {
    if (busy) return;
    const nearOld = newestFirst
      ? list.scrollHeight - list.scrollTop - list.clientHeight < list.clientHeight * 1.5 && hi < ordered.length
      : list.scrollTop < list.clientHeight * 1.5 && lo > 0;
    if (!nearOld) return;
    busy = true;
    const keep = anchor();
    if (newestFirst) hi = Math.min(ordered.length, hi + CHUNK); else lo = Math.max(0, lo - CHUNK);
    build(keep);
    requestAnimationFrame(() => { busy = false; });
  }
  list.addEventListener('scroll', () => {
    const far = newestFirst ? list.scrollTop : list.scrollHeight - list.scrollTop - list.clientHeight;
    toBottom.hidden = far < list.clientHeight * 1.2;
    more();
  }, { passive: true });

  function jumpTo(key) {
    if (!key || !ordered.length) return;
    let idx = ordered.findIndex(m => (newestFirst ? m.dateKey <= key : m.dateKey >= key));
    if (idx < 0) idx = ordered.length - 1;
    if (idx < lo || idx >= hi) {
      if (newestFirst) hi = Math.min(ordered.length, idx + 30); else lo = Math.max(0, idx - 30);
      build(null);
    }
    const secs = [...list.querySelectorAll('section')];
    const target = secs.find(s => (newestFirst ? s.dataset.key <= key : s.dataset.key >= key)) || secs[secs.length - 1];
    target?.scrollIntoView({ block: 'start' });
  }
  function focus(id) {
    list.querySelector(`.bubble[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
  }

  const un = onMealsChanged(load);
  load();
  return () => { un(); lazy?.destroy(); window.removeEventListener('tab-retap', onRetap); };
}
