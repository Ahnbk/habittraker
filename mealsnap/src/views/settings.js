import { h, fmtBytes, fmtAgo, VERSION } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { PRESETS } from '../image.js';
import { usage } from '../storage.js';
import { iconBtn } from '../ui.js';
import { runBackupFlow, runRestoreFlow, runRecompressFlow, runDeleteOldFlow, importFromGallery } from '../flows.js';
import { requestPersist } from '../meals.js';

const row = (ico, label, sub, onclick) =>
  h('button', { class: 'row-btn', onclick },
    icon(ico, 24),
    h('span', { class: 'rb-t' }, h('b', {}, label), sub && h('small', {}, sub)),
    icon('right', 20));

export default function mount(root) {
  const page = h('div', { class: 'settings scroll' });
  root.append(
    h('header', { class: 'bar' },
      iconBtn('left', '뒤로', () => { history.length > 1 ? history.back() : (location.hash = '#/'); }),
      h('div', { class: 'bar-title' }, h('div', { class: 't1' }, '설정'))),
    page);

  async function draw() {
    const meals = await db.allMeals();
    const preset = await db.getSetting('preset', 'std');
    const auto = await db.getSetting('autoCamera', false);
    const lastBackup = await db.getSetting('lastBackupAt', null);
    const u = await usage();

    const seg = h('div', { class: 'seg' }, Object.entries(PRESETS).map(([k, p]) =>
      h('button', {
        class: 'seg-b' + (k === preset ? ' on' : ''),
        onclick: async () => { await db.setSetting('preset', k); draw(); }
      }, h('b', {}, p.label), h('small', {}, `${p.max}px`), h('small', {}, p.est))));

    const toggle = h('button', {
      class: 'row-btn', role: 'switch', 'aria-checked': String(!!auto),
      onclick: async () => { await db.setSetting('autoCamera', !auto); draw(); }
    }, icon('camera', 24), h('span', { class: 'rb-t' }, h('b', {}, '앱을 열면 바로 카메라'), h('small', {}, '켜면 실행 즉시 촬영 화면이 떠요')),
    h('span', { class: 'switch' + (auto ? ' on' : '') }, h('i')));

    page.replaceChildren(
      h('h3', {}, '백업 · 복원'),
      h('div', { class: 'group' },
        h('p', { class: 'note' }, lastBackup ? `마지막 백업: ${fmtAgo(lastBackup)}` : '아직 백업한 적이 없어요. 폰을 바꾸거나 앱을 지우면 기록이 사라져요.'),
        row('download', '전체 백업 만들기', `사진 ${meals.length}장을 ZIP 파일 하나로`, () => runBackupFlow(false)),
        row('share', '마지막 이후 추가분만 백업', '새로 찍은 것만 가볍게', () => runBackupFlow(true)),
        row('upload', '백업에서 복원', '백업 ZIP을 골라 합치기 (중복은 건너뜀)', runRestoreFlow)),

      h('h3', {}, '사진'),
      h('div', { class: 'group' },
        h('p', { class: 'note' }, '화질 (이후 찍는 사진부터 적용 · 하루 5장 기준)'),
        seg,
        row('image', '갤러리에서 사진 추가', '이미 찍어 둔 사진을 찍힌 시각으로 넣기', importFromGallery),
        toggle),

      h('h3', {}, '저장 공간'),
      h('div', { class: 'group' },
        h('p', { class: 'note' },
          `사진 ${u.count.toLocaleString()}장 · 평균 ${u.count ? fmtBytes(u.avg) : '-'}`,
          h('br'),
          `앱 사용량 ${u.used != null ? fmtBytes(u.used) : fmtBytes(u.photoBytes)}`,
          u.persisted == null ? '' : u.persisted ? ' · 저장소 보호 켜짐' : ' · 저장소 보호 꺼짐'),
        u.persisted === false && h('button', { class: 'row-btn', onclick: async () => { await requestPersist(); draw(); } },
          icon('check', 24), h('span', { class: 'rb-t' }, h('b', {}, '저장소 보호 요청'), h('small', {}, '브라우저가 공간 부족 때 기록을 지우지 않게'))),
        row('shrink', '오래된 사진 더 줄이기', '선택한 기간 이전 사진을 절약 화질로', runRecompressFlow),
        row('trash', '오래된 기록 삭제', '전체 백업이 최신일 때만 가능', runDeleteOldFlow)),

      h('p', { class: 'ver' }, `밥찰칵 v${VERSION}`));
  }
  const f = () => draw();
  window.addEventListener('meals-changed', f);
  window.addEventListener('backup-done', f);
  draw();
  return () => { window.removeEventListener('meals-changed', f); window.removeEventListener('backup-done', f); };
}
