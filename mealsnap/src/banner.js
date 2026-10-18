// 백업 상기 배너. "오늘"과 "달력" 두 화면이 같이 쓴다. 7일간 닫기 가능.
import { h } from './util.js';
import { icon } from './icons.js';
import * as db from './db.js';
import { runBackupFlow } from './flows.js';

export function backupBanner(box) {
  async function refresh() {
    box.replaceChildren();
    const meals = await db.allMeals();
    if (!meals.length) return;
    const last = await db.getSetting('lastBackupAt', null);
    const hidden = await db.getSetting('bannerHiddenAt', 0);
    if (Date.now() - hidden < 7 * 86400000) return;
    const need = last ? Date.now() - last > 14 * 86400000 : Date.now() - meals[0].takenAt > 3 * 86400000;
    if (!need) return;
    box.append(h('div', { class: 'banner', role: 'status' },
      h('span', { class: 'bt' }, last ? `백업한 지 ${Math.floor((Date.now() - last) / 86400000)}일 지났어요` : '아직 백업한 적이 없어요'),
      h('button', { class: 'b-act', onclick: () => runBackupFlow(false) }, '백업'),
      h('button', { class: 'b-x', 'aria-label': '일주일간 닫기', onclick: async () => { await db.setSetting('bannerHiddenAt', Date.now()); box.replaceChildren(); } }, icon('close', 20))));
  }
  window.addEventListener('backup-done', refresh);
  return { refresh, destroy: () => window.removeEventListener('backup-done', refresh) };
}
