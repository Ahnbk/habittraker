export const VERSION = '1.0.1';
// Android 앱(APK) 안에서 실행 중이면 네이티브 브리지가 있다.
export const native = () => window.MealsnapNative || null;
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

const fmtLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// '하루 시작 시각'(예: 4시)이면 새벽 4시 전의 식사는 전날로 묶는다. 저장된 시각 자체는 그대로.
let dayShift = 0;
export const setDayStart = hour => { dayShift = hour * 3600000; };
export const dateKey = ms => fmtLocal(new Date(ms - dayShift));
export const realDateKey = ms => fmtLocal(new Date(ms));
export const todayKey = () => dateKey(Date.now());
export const parseKey = k => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return fmtLocal(d);
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
  return `${fmtLocal(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
