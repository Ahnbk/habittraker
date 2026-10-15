// 보기 설정. 값은 설정 화면에서 바꾸고, 각 화면이 열릴 때 읽는다.
import * as db from './db.js';

export const DEFAULTS = { start: 'today', calStyle: 'photo', dayLayout: 'grid', tlOrder: 'bottom', theme: 'auto' };

export const pref = k => db.getSetting(`pref_${k}`, DEFAULTS[k]);
export async function setPref(k, v) {
  await db.setSetting(`pref_${k}`, v);
  if (k === 'theme') applyTheme(v);
}
export function applyTheme(v) {
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
}
export const startHash = s => ({ today: '#/today', cal: '#/cal', timeline: '#/timeline', camera: '#/today' }[s] || '#/today');
