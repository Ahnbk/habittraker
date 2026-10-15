import { h } from './util.js';
import { icon } from './icons.js';

/* ---------- 오버레이 스택 (안드로이드 뒤로가기로 닫힘) ---------- */
const stack = [];

export function pushOverlay(el, { onClose, locked = false } = {}) {
  const entry = { el, onClose, locked, disposed: false };
  stack.push(entry);
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  history.pushState({ ov: stack.length }, '');
  return entry;
}
function dispose(entry) {
  if (entry.disposed) return;
  entry.disposed = true;
  entry.el.classList.remove('show');
  entry.el.classList.add('hiding');
  setTimeout(() => entry.el.remove(), 240);
  entry.onClose?.();
}
export function closeOverlay(entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  dispose(entry);
  if (i === stack.length) history.back(); // 맨 위였다면 쌓아둔 히스토리 한 칸 되돌림
}
window.addEventListener('popstate', e => {
  const depth = e.state?.ov || 0;
  while (stack.length > depth) {
    const top = stack[stack.length - 1];
    if (top.locked) { history.pushState({ ov: stack.length }, ''); return; }
    stack.pop();
    dispose(top);
  }
});

/* ---------- 바텀시트 / 확인창 / 진행창 ---------- */
export function sheet({ title, text, build, actions = [], locked = false, onClose } = {}) {
  const wrap = h('div', { class: 'overlay sheet-wrap' });
  const body = h('div', { class: 'sheet-body' });
  const acts = h('div', { class: 'sheet-actions' });
  const panel = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'grab' }),
    title && h('h2', {}, title),
    text && h('p', { class: 'sheet-text' }, text),
    body, acts);
  wrap.append(panel);
  let entry;
  const close = () => closeOverlay(entry);
  for (const a of actions) {
    acts.append(h('button', {
      class: `btn ${a.kind || 'ghost'}`,
      onclick: async ev => {
        const r = await a.onClick?.({ close, btn: ev.currentTarget });
        if (r !== false) close();
      }
    }, a.icon && icon(a.icon, 22), a.label));
  }
  build?.(body, { close });
  wrap.addEventListener('click', e => { if (e.target === wrap && !locked) close(); });
  entry = pushOverlay(wrap, { onClose, locked });
  return { el: panel, body, close, entry };
}

export function confirmSheet({ title, text, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    sheet({
      title, text,
      actions: [
        { label: ok, kind: danger ? 'danger' : 'primary', onClick: () => { result = true; } },
        { label: cancel, kind: 'ghost' }
      ],
      onClose: () => resolve(result)
    });
  });
}

export function choiceSheet({ title, text, options, ok = '확인' }) {
  return new Promise(resolve => {
    let value = null;
    let chosen = options[0]?.value;
    sheet({
      title, text,
      build(body) {
        const row = h('div', { class: 'choices' });
        options.forEach((o, i) => {
          const b = h('button', {
            class: 'choice' + (i === 0 ? ' on' : ''),
            onclick: () => {
              chosen = o.value;
              row.querySelectorAll('.choice').forEach(x => x.classList.toggle('on', x === b));
            }
          }, o.label);
          row.append(b);
        });
        body.append(row);
      },
      actions: [
        { label: ok, kind: 'primary', onClick: () => { value = chosen; } },
        { label: '취소', kind: 'ghost' }
      ],
      onClose: () => resolve(value)
    });
  });
}

export function progressDialog(title) {
  const fill = h('i');
  const txt = h('div', { class: 'ptext' });
  const s = sheet({ title, locked: true, build: b => b.append(h('div', { class: 'pbar' }, fill), txt) });
  return {
    update(f, t) {
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;
      if (t != null) txt.textContent = t;
    },
    close() { s.entry.locked = false; s.close(); }
  };
}

/* ---------- 토스트 ---------- */
let toastEl = null;
let toastTimer = 0;
export function toast({ text, thumb, action, onAction, ms = 4500 }) {
  hideToast();
  const el = h('div', { class: 'toast', role: 'status' },
    thumb && h('img', { src: thumb, alt: '' }),
    h('span', { class: 't' }, text),
    action && h('button', { class: 't-act', onclick: () => { hideToast(); onAction?.(); } }, action));
  document.getElementById('toasts').append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  toastEl = el;
  toastTimer = setTimeout(hideToast, ms);
}
export function hideToast() {
  clearTimeout(toastTimer);
  const el = toastEl;
  toastEl = null;
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 220);
}

/* ---------- 공통 조각 ---------- */
export const iconBtn = (name, label, onclick, cls = '') =>
  h('button', { class: `icon-btn ${cls}`, 'aria-label': label, onclick }, icon(name));

export const settingsBtn = () => iconBtn('gear', '설정', () => { location.hash = '#/settings'; });

export function bar({ left, title, sub, right = [] }) {
  return h('header', { class: 'bar' },
    left,
    h('div', { class: 'bar-title' }, h('div', { class: 't1' }, title), sub && h('div', { class: 't2' }, sub)),
    ...right);
}

export function pickFiles({ accept, multiple = false }) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.multiple = multiple;
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export function onMealsChanged(fn) {
  window.addEventListener('meals-changed', fn);
  return () => window.removeEventListener('meals-changed', fn);
}

export function swipe(el, { left, right }) {
  let x0 = 0, y0 = 0, t0 = 0;
  el.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - t0 < 700) {
      (dx < 0 ? left : right)?.();
    }
  }, { passive: true });
}
