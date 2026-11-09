import { h, fmtBytes, fmtAgo, VERSION, native } from '../util.js';
import { icon } from '../icons.js';
import * as db from '../db.js';
import { PRESETS } from '../image.js';
import { usage } from '../storage.js';
import { pref, setPref } from '../prefs.js';
import { runBackupFlow, runRestoreFlow, runRecompressFlow, runDeleteOldFlow, importFromGallery } from '../flows.js';
import { requestPersist } from '../meals.js';

const row = (ico, label, sub, onclick) =>
  h('button', { class: 'row-btn', onclick },
    icon(ico, 24),
    h('span', { class: 'rb-t' }, h('b', {}, label), sub && h('small', {}, sub)),
    icon('right', 20));

// 라벨 + 설명 + 가로 선택 버튼(한 번 탭으로 바로 적용)
function option(label, help, options, value, onPick) {
  return h('div', { class: 'opt' },
    h('div', { class: 'opt-h' }, h('b', {}, label), help && h('small', {}, help)),
    h('div', { class: 'seg', style: `--n:${options.length}` }, options.map(o =>
      h('button', { class: 'seg-b' + (o.value === value ? ' on' : ''), onclick: () => onPick(o.value) },
        h('b', {}, o.label), o.sub && h('small', {}, o.sub)))));
}

export default function mount(root) {
  const page = h('div', { class: 'settings scroll' });
  root.append(h('header', { class: 'bar' }, h('div', { class: 'bar-title' }, h('div', { class: 't1' }, '설정'))), page);

  async function draw() {
    const meals = await db.allMeals();
    const p = Object.fromEntries(await Promise.all(['start', 'calStyle', 'dayLayout', 'tlOrder', 'theme', 'dayStart', 'shootMode'].map(async k => [k, await pref(k)])));
    const preset = await db.getSetting('preset', 'std');
    const lastBackup = await db.getSetting('lastBackupAt', null);
    const u = await usage();
    const set = (k) => async v => { await setPref(k, v); draw(); };

    page.replaceChildren(
      h('h3', {}, '보기'),
      h('div', { class: 'group' },
        option('시작 화면', '앱을 처음 열 때 보이는 화면', [
          { value: 'today', label: '오늘' }, { value: 'cal', label: '달력' },
          { value: 'timeline', label: '타임라인' }, { value: 'camera', label: '카메라', sub: '바로 촬영' }], p.start, set('start')),
        option('달력 칸', '날짜 칸에 보이는 모양', [
          { value: 'photo', label: '사진', sub: '+ 횟수' }, { value: 'count', label: '횟수만', sub: '깔끔하게' }], p.calStyle, set('calStyle')),
        option('하루 보기', '날짜별 화면의 사진 배치', [
          { value: 'grid', label: '바둑판', sub: '한눈에 · 두 장씩' }, { value: 'large', label: '큰 사진', sub: '한 줄에 하나' }], p.dayLayout, set('dayLayout')),
        option('타임라인 순서', '전체 기록을 이어 보는 방향', [
          { value: 'bottom', label: '최근이 아래', sub: '대화방처럼' }, { value: 'top', label: '최근이 위', sub: '' }], p.tlOrder, set('tlOrder')),
        option('화면 색', null, [
          { value: 'auto', label: '자동', sub: '폰 설정 따름' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }], p.theme, set('theme')),
        option('하루 시작 시각', '새벽에 먹은 것을 전날로 묶어요 (시각 기록은 그대로)', [
          { value: 0, label: '자정', sub: '기본' }, { value: 3, label: '오전 3시' }, { value: 4, label: '오전 4시' }, { value: 5, label: '오전 5시' }], p.dayStart, set('dayStart'))),

      h('h3', {}, '사진'),
      h('div', { class: 'group' },
        !native() && option('촬영 방식', '카메라가 흐리거나 초점이 늦다면 기본 카메라 앱을 쓰세요', [
          { value: 'app', label: '앱 카메라', sub: '연속 촬영 · 바로 저장' }, { value: 'system', label: '기본 카메라 앱', sub: '화질 좋음 · 1장씩' }], p.shootMode, set('shootMode')),
        option('화질', '이후 찍는 사진부터 적용 · 하루 5장 기준', Object.entries(PRESETS).map(([k, x]) => ({ value: k, label: x.label, sub: `${x.max}px · ${x.est}` })), preset,
          async v => { await db.setSetting('preset', v); draw(); }),
        row('image', '갤러리에서 사진 추가', '이미 찍어 둔 사진을 찍힌 시각으로 넣기', importFromGallery)),

      h('h3', {}, '백업 · 복원'),
      h('div', { class: 'group' },
        h('p', { class: 'note' }, lastBackup ? `마지막 백업: ${fmtAgo(lastBackup)}` : '아직 백업한 적이 없어요. 폰을 바꾸거나 앱을 지우면 기록이 사라져요.'),
        row('download', '전체 백업 만들기', `사진 ${meals.length}장을 ZIP 파일 하나로`, () => runBackupFlow(false)),
        row('share', '마지막 이후 추가분만 백업', '새로 찍은 것만 가볍게', () => runBackupFlow(true)),
        row('upload', '백업에서 복원', '백업 ZIP을 골라 합치기 (중복은 건너뜀)', runRestoreFlow)),

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
