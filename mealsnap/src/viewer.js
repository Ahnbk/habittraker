import { h, dateLabelFull, realDateKey, timeStr, toLocalInput, dateKey } from './util.js';
import { icon } from './icons.js';
import * as db from './db.js';
import { iconBtn, pushOverlay, closeOverlay, sheet, confirmSheet, toast } from './ui.js';

const R = 3;          // 현재 위치 앞뒤로 실제 DOM을 만들어 두는 슬라이드 수
const MAX_ZOOM = 5;

// 전체 기록을 시간순으로 좌우로 넘겨 보는 전체화면 뷰어. 더블탭/핀치로 확대.
export async function openViewer(startId, { onClose } = {}) {
  let list = [...(await db.allMeals())];
  if (!list.length) return;
  let idx = Math.max(0, list.findIndex(m => m.id === startId));
  let entry, W = 0, H = 0;
  const slides = new Map(); // index -> { el, img, url }
  let z = { s: 1, x: 0, y: 0 };

  const track = h('div', { class: 'v-track' });
  const scroller = h('div', { class: 'v-scroller' }, track);
  const timeEl = h('div', { class: 'v-time' });
  const subEl = h('div', { class: 'v-sub' });
  const top = h('div', { class: 'v-top' },
    iconBtn('close', '닫기', () => closeOverlay(entry), 'v-btn'),
    h('div', { class: 'v-info' }, timeEl, subEl));
  const bottom = h('div', { class: 'v-bottom' },
    h('button', { class: 'v-act', onclick: editTime }, icon('clock', 24), h('span', {}, '시간 수정')),
    h('button', { class: 'v-act danger', onclick: remove }, icon('trash', 24), h('span', {}, '삭제')));
  const hint = h('div', { class: 'v-hint' }, '두 번 탭하면 확대');
  const root = h('div', { class: 'overlay viewer' }, scroller, top, bottom, hint);

  /* ---------- 슬라이드 윈도우 ---------- */
  function drop(i) {
    const s = slides.get(i);
    if (!s) return;
    if (s.url) URL.revokeObjectURL(s.url);
    s.el.remove();
    slides.delete(i);
  }
  function make(i) {
    const m = list[i];
    const img = h('img', { alt: `${dateLabelFull(realDateKey(m.takenAt))} ${timeStr(m.takenAt)} 식사 사진`, draggable: 'false' });
    const el = h('div', { class: 'slide', role: 'group', 'aria-label': `${i + 1} / ${list.length}` }, img);
    el.style.cssText = `left:${i * W}px;width:${W}px`;
    const s = { el, img, url: null };
    slides.set(i, s);
    track.append(el);
    db.getPhoto(m.id).then(blob => {
      if (!blob || slides.get(i) !== s) return;
      s.url = URL.createObjectURL(blob);
      img.src = s.url;
      img.onload = () => img.classList.add('loaded');
    });
  }
  function sync() {
    for (const i of [...slides.keys()]) if (Math.abs(i - idx) > R) drop(i);
    for (let i = Math.max(0, idx - R); i <= Math.min(list.length - 1, idx + R); i++) if (!slides.has(i)) make(i);
  }
  function layout() {
    W = scroller.clientWidth; H = scroller.clientHeight;
    track.style.width = `${list.length * W}px`;
    for (const [i, s] of slides) s.el.style.cssText = `left:${i * W}px;width:${W}px`;
  }
  function build() {
    for (const i of [...slides.keys()]) drop(i);
    layout();
    resetZoom();
    sync();
    scroller.scrollLeft = idx * W;
    info();
  }
  function info() {
    const m = list[idx];
    if (!m) return;
    timeEl.textContent = timeStr(m.takenAt);
    subEl.textContent = `${dateLabelFull(realDateKey(m.takenAt))} · ${idx + 1} / ${list.length}`;
  }

  let raf = 0;
  scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.min(list.length - 1, Math.max(0, Math.round(scroller.scrollLeft / (W || 1))));
      if (i !== idx) { idx = i; resetZoom(); info(); sync(); }
    });
  }, { passive: true });

  const go = d => {
    const i = Math.min(list.length - 1, Math.max(0, idx + d));
    scroller.scrollTo({ left: i * W, behavior: 'smooth' });
  };
  const onKey = e => {
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Escape') closeOverlay(entry);
  };
  window.addEventListener('keydown', onKey);

  /* ---------- 확대 (더블탭 / 핀치 / 이동) ---------- */
  const curImg = () => slides.get(idx)?.img;
  function clampZ() {
    const img = curImg();
    if (!img) return;
    const mx = Math.max(0, (img.clientWidth * z.s - W) / 2);
    const my = Math.max(0, (img.clientHeight * z.s - H) / 2);
    z.x = Math.min(mx, Math.max(-mx, z.x));
    z.y = Math.min(my, Math.max(-my, z.y));
  }
  function applyZ() {
    const img = curImg();
    if (img) img.style.transform = z.s > 1.001 ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    const zoomed = z.s > 1.001;
    root.classList.toggle('zoomed', zoomed);
    scroller.style.overflowX = zoomed ? 'hidden' : '';
  }
  function resetZoom() {
    z = { s: 1, x: 0, y: 0 };
    for (const s of slides.values()) s.img.style.transform = '';
    applyZ();
    root.classList.remove('chrome-off-z');
  }
  function zoomAt(cx, cy, ns) {
    const r = ns / z.s;
    z.x = cx - (cx - z.x) * r;
    z.y = cy - (cy - z.y) * r;
    z.s = ns;
    clampZ();
    applyZ();
  }
  const rel = (x, y) => { const b = scroller.getBoundingClientRect(); return [x - b.left - W / 2, y - b.top - H / 2]; };

  let pinch = null, pan = null;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  scroller.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = { d: dist(a, b), s: z.s };
      pan = null;
    } else if (e.touches.length === 1 && z.s > 1.001) {
      pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });
  scroller.addEventListener('touchmove', e => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const [cx, cy] = rel((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      zoomAt(cx, cy, Math.min(MAX_ZOOM, Math.max(1, pinch.s * dist(a, b) / pinch.d)));
      root.classList.add('chrome-off');
      hint.classList.remove('on');
    } else if (pan && e.touches.length === 1 && z.s > 1.001) {
      e.preventDefault();
      const t = e.touches[0];
      z.x += t.clientX - pan.x; z.y += t.clientY - pan.y;
      pan = { x: t.clientX, y: t.clientY };
      clampZ(); applyZ();
    }
  }, { passive: false });
  scroller.addEventListener('touchend', e => {
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) { pan = null; if (z.s < 1.05) resetZoom(); }
    else if (e.touches.length === 1 && z.s > 1.001) pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  // 한 번 탭 = 버튼 숨김/표시, 두 번 탭 = 확대/원래대로
  let tapTimer = 0, lastTap = 0, lx = 0, ly = 0;
  scroller.addEventListener('click', e => {
    const now = Date.now();
    if (now - lastTap < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 48) {
      clearTimeout(tapTimer);
      lastTap = 0;
      hint.classList.remove('on');
      if (z.s > 1.001) { resetZoom(); root.classList.remove('chrome-off'); }
      else { const [cx, cy] = rel(e.clientX, e.clientY); zoomAt(cx, cy, 2.5); root.classList.add('chrome-off'); }
      return;
    }
    lastTap = now; lx = e.clientX; ly = e.clientY;
    tapTimer = setTimeout(() => root.classList.toggle('chrome-off'), 300);
  });

  /* ---------- 시간 수정 / 삭제 ---------- */
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
      text: `${dateLabelFull(realDateKey(m.takenAt))} ${timeStr(m.takenAt)} 기록이 지워져요.`,
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

  const ro = new ResizeObserver(() => {
    if (!root.isConnected) return;
    layout();
    scroller.scrollLeft = idx * W;
  });
  entry = pushOverlay(root, {
    onClose: () => {
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      clearTimeout(tapTimer);
      for (const i of [...slides.keys()]) drop(i);
      onClose?.(list[idx]?.id);
    }
  });
  build();
  ro.observe(scroller);
  // 확대 안내는 처음 몇 번만
  try {
    const n = +(localStorage.getItem('zoomHint') || 0);
    if (n < 3) { localStorage.setItem('zoomHint', n + 1); hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 2600); }
  } catch { /* 저장소 불가 시 생략 */ }
}
