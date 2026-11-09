// 보기 설정. 값은 설정 화면에서 바꾸고, 각 화면이 열릴 때 읽는다.
import * as db from './db.js';
import { setDayStart, dateKey } from './util.js';

export const DEFAULTS = { start: 'today', calStyle: 'photo', dayLayout: 'grid', tlOrder: 'bottom', theme: 'auto', shootMode: 'app', dayStart: 0 };

export const pref = k => db.getSetting(`pref_${k}`, DEFAULTS[k]);
export async function setPref(k, v) {
  await db.setSetting(`pref_${k}`, v);
  if (k === 'theme') applyTheme(v);
  if (k === 'dayStart') { setDayStart(v); await db.rekey(dateKey); }
}
export function applyTheme(v) {
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
  syncBars();
}
// APK에서 상태바/내비게이션바 색을 현재 테마에 맞춘다.
export function syncBars() {
  const n = window.MealsnapNative;
  if (!n) return;
  const t = document.documentElement.dataset.theme;
  n.setDark(t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncBars);
export const startHash = s => ({ today: '#/today', cal: '#/cal', timeline: '#/timeline', camera: '#/today' }[s] || '#/today');
