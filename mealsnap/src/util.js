export const VERSION = '0.1.0';
export const pad = n => String(n).padStart(2, '0');
export const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export const dateKey = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const todayKey = () => dateKey(Date.now());
export const parseKey = k => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d.getTime());
};
export const timeStr = ms => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const dateLabel = key => {
  const d = parseKey(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
};
export const dateLabelFull = key => {
  const d = parseKey(key);
  return `${d.getFullYear()}년 ${dateLabel(key)}`;
};
export const dayTag = key => {
  const t = todayKey();
  if (key === t) return '오늘';
  if (key === addDays(t, -1)) return '어제';
  return `${parseKey(key).getFullYear()}년`;
};
export const toLocalInput = ms => {
  const d = new Date(ms);
  return `${dateKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtBytes = b => {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(b < 1e7 ? 1 : 0)}MB`;
  return `${(b / 1024 ** 3).toFixed(2)}GB`;
};
export const fmtAgo = ms => {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
};
export const newId = takenAt =>
  takenAt.toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8).padStart(6, '0');
