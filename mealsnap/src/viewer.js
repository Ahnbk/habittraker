import { h, dateLabelFull, timeStr, toLocalInput, dateKey } from './util.js';
import { icon } from './icons.js';
import * as db from './db.js';
import { lazyImages } from './lazy.js';
import { iconBtn, pushOverlay, closeOverlay, sheet, confirmSheet, toast } from './ui.js';

// 전체 기록을 시간순으로 좌우로 넘겨 보는 전체화면 뷰어.
export async function openViewer(startId, { onClose } = {}) {
  let list = [...(await db.allMeals())];
  if (!list.length) return;
  let idx = Math.max(0, list.findIndex(m => m.id === startId));
  let entry, lazy, ro;

  const scroller = h('div', { class: 'v-scroller' });
  const timeEl = h('div', { class: 'v-time' });
  const subEl = h('div', { class: 'v-sub' });
  const top = h('div', { class: 'v-top' },
    iconBtn('close', '닫기', () => closeOverlay(entry), 'v-btn'),
    h('div', { class: 'v-info' }, timeEl, subEl));
  const bottom = h('div', { class: 'v-bottom' },
    h('button', { class: 'v-act', onclick: editTime }, icon('clock', 24), h('span', {}, '시간 수정')),
    h('button', { class: 'v-act danger', onclick: remove }, icon('trash', 24), h('span', {}, '삭제')));
  const root = h('div', { class: 'overlay viewer' }, scroller, top, bottom);

  function build() {
    lazy?.destroy();
    scroller.replaceChildren();
    lazy = lazyImages({ root: scroller, margin: '0px 250% 0px 250%', load: id => db.getPhoto(id) });
    for (const m of list) {
      const img = h('img', { alt: '', draggable: 'false' });
      img.dataset.id = m.id;
      scroller.append(h('div', { class: 'slide' }, img));
    }
    scroller.scrollLeft = idx * scroller.clientWidth;
    for (const img of scroller.querySelectorAll('img')) lazy.observe(img);
    info();
  }
  function info() {
    const m = list[idx];
    if (!m) return;
    timeEl.textContent = timeStr(m.takenAt);
    subEl.textContent = `${dateLabelFull(m.dateKey)} · ${idx + 1} / ${list.length}`;
  }
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = scroller.clientWidth || 1;
      const i = Math.min(list.length - 1, Math.max(0, Math.round(scroller.scrollLeft / w)));
      if (i !== idx) { idx = i; info(); }
    });
  }, { passive: true });
  scroller.addEventListener('click', () => root.classList.toggle('chrome-off'));

  const go = d => {
    const i = Math.min(list.length - 1, Math.max(0, idx + d));
    scroller.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' });
  };
  const onKey = e => {
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Escape') closeOverlay(entry);
  };
  window.addEventListener('keydown', onKey);

  function editTime() {
    const m = list[idx];
    const input = h('input', { type: 'datetime-local', class: 'dt-input', value: toLocalInput(m.takenAt), max: toLocalInput(Date.now() + 60000) });
    sheet({
      title: '먹은 시간 수정',
      text: '깜빡하고 나중에 찍었다면 실제로 먹은 시간으로 바꿔 주세요.',
      build: b => b.append(input),
      actions: [
        {
          label: '저장', kind: 'primary',
          onClick: async () => {
            const t = new Date(input.value).getTime();
            if (!Number.isFinite(t)) return false;
            await db.updateMeal(m.id, { takenAt: t, tzOffset: new Date(t).getTimezoneOffset(), dateKey: dateKey(t) });
            list = [...(await db.allMeals())];
            idx = list.findIndex(x => x.id === m.id);
            build();
          }
        },
        { label: '취소', kind: 'ghost' }
      ]
    });
  }
  async function remove() {
    const m = list[idx];
    const ok = await confirmSheet({
      title: '이 사진을 삭제할까요?',
      text: `${dateLabelFull(m.dateKey)} ${timeStr(m.takenAt)} 기록이 지워져요.`,
      ok: '삭제', danger: true
    });
    if (!ok) return;
    await db.deleteMeal(m.id);
    list = list.filter(x => x.id !== m.id);
    if (!list.length) { closeOverlay(entry); toast({ text: '삭제했어요' }); return; }
    idx = Math.min(idx, list.length - 1);
    build();
    toast({ text: '삭제했어요' });
  }

  ro = new ResizeObserver(() => {
    if (root.isConnected) scroller.scrollLeft = idx * scroller.clientWidth;
  });
  entry = pushOverlay(root, {
    onClose: () => {
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      lazy?.destroy();
      onClose?.(list[idx]?.id);
    }
  });
  build();
  ro.observe(scroller);
}
