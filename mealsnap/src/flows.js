// 설정/배너/하루 화면에서 공통으로 쓰는 긴 작업 흐름들.
import * as db from './db.js';
import { createBackup, restoreBackup } from './backup.js';
import { recompressOlder, deleteCheck } from './storage.js';
import { exifTime, decode } from './image.js';
import { saveShot } from './meals.js';
import { sheet, progressDialog, choiceSheet, confirmSheet, pickFiles, toast } from './ui.js';
import { fmtBytes, dateKey } from './util.js';

export async function importFromGallery() {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  const prog = progressDialog('사진 추가 중');
  const have = new Set((await db.allMeals()).map(m => m.srcKey).filter(Boolean));
  let ok = 0, fail = 0, dup = 0;
  for (let i = 0; i < files.length; i++) {
    prog.update(i / files.length, `${i + 1} / ${files.length}장`);
    const srcKey = `${files[i].name}|${files[i].size}|${files[i].lastModified}`;
    if (have.has(srcKey)) { dup++; continue; }
    try {
      const t = (await exifTime(files[i])) ?? files[i].lastModified ?? Date.now();
      const { bmp, w, h } = await decode(files[i]);
      await saveShot(bmp, w, h, t, { srcKey });
      have.add(srcKey);
      bmp.close?.();
      ok++;
    } catch { fail++; }
  }
  prog.close();
  const parts = [`${ok}장 추가`];
  if (dup) parts.push(`${dup}장은 이미 있어서 건너뜀`);
  if (fail) parts.push(`${fail}장은 읽지 못함`);
  toast({ text: parts.join(', '), ms: 5000 });
}

export async function runBackupFlow(incremental = false) {
  const meals = await db.allMeals();
  if (!meals.length) { toast({ text: '백업할 기록이 아직 없어요' }); return; }
  const since = incremental ? await db.getSetting('lastBackupAt', null) : null;
  if (incremental && since == null) { toast({ text: '먼저 전체 백업을 한 번 만들어 주세요' }); return; }
  const prog = progressDialog('백업 만드는 중');
  let result;
  try {
    result = await createBackup({ incrementalSince: since }, f => prog.update(f));
  } catch (e) {
    prog.close();
    toast({ text: `백업 실패: ${e.message || e}` });
    return;
  }
  prog.close();
  if (!result.count) { toast({ text: '마지막 백업 이후 새로 바뀐 사진이 없어요' }); return; }

  const stamp = dateKey(Date.now());
  const name = `mealsnap-${incremental ? 'inc' : 'backup'}-${stamp}.zip`;
  const file = new File([result.blob], name, { type: 'application/zip' });
  const markDone = async () => {
    const now = Date.now();
    await db.setSetting('lastBackupAt', now);
    if (!incremental) await db.setSetting('lastFullBackupAt', now);
    window.dispatchEvent(new CustomEvent('backup-done'));
  };
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  // 공유/다운로드는 사용자 탭 직후에만 허용되므로 "준비 완료" 시트의 버튼에서 실행한다.
  sheet({
    title: '백업 파일이 준비됐어요',
    text: `${result.count}장 · ${fmtBytes(file.size)}\nDrive나 파일 앱 등 안전한 곳에 저장해 주세요.`,
    actions: [
      canShare && {
        label: '공유 / 저장', kind: 'primary', icon: 'share',
        onClick: async () => {
          try { await navigator.share({ files: [file], title: name }); await markDone(); toast({ text: '백업을 저장했어요' }); }
          catch (e) { if (e?.name === 'AbortError') return false; toast({ text: '공유하지 못했어요. "파일로 다운로드"를 써 주세요' }); return false; }
        }
      },
      {
        label: '파일로 다운로드', kind: canShare ? 'ghost' : 'primary', icon: 'download',
        onClick: async () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(file);
          a.download = name;
          document.body.append(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
          await markDone();
          toast({ text: '다운로드 폴더에 저장했어요' });
        }
      },
      { label: '닫기', kind: 'ghost' }
    ].filter(Boolean)
  });
}

export async function runRestoreFlow() {
  const [file] = await pickFiles({ accept: '.zip,application/zip' });
  if (!file) return;
  const prog = progressDialog('복원 중');
  try {
    const r = await restoreBackup(file, f => prog.update(f));
    prog.close();
    toast({ text: `${r.added}장 복원${r.skipped ? `, ${r.skipped}장은 이미 있어서 건너뜀` : ''}` , ms: 6000});
  } catch (e) {
    prog.close();
    toast({ text: `복원 실패: ${e.message || e}`, ms: 6000 });
  }
}

export async function runRecompressFlow() {
  const months = await choiceSheet({
    title: '오래된 사진 더 줄이기',
    text: '선택한 기간보다 오래된 사진을 "절약" 화질(긴 변 640px)로 다시 저장해요. 되돌릴 수 없어요. 먼저 백업해 두면 안전해요.',
    options: [{ label: '3개월 전', value: 3 }, { label: '6개월 전', value: 6 }, { label: '1년 전', value: 12 }],
    ok: '줄이기'
  });
  if (!months) return;
  const prog = progressDialog('사진 줄이는 중');
  try {
    const r = await recompressOlder(months, (f, t) => prog.update(f, t));
    prog.close();
    toast({ text: r.done ? `${r.done}장 처리, 약 ${fmtBytes(r.saved)} 줄였어요` : '줄일 사진이 없어요' });
  } catch (e) {
    prog.close();
    toast({ text: `실패: ${e.message || e}` });
  }
}

export async function runDeleteOldFlow() {
  const months = await choiceSheet({
    title: '오래된 기록 삭제',
    text: '선택한 기간보다 오래된 기록을 지워 공간을 비워요. 전체 백업이 최신일 때만 가능해요.',
    options: [{ label: '1년 전', value: 12 }, { label: '2년 전', value: 24 }, { label: '3년 전', value: 36 }],
    ok: '다음'
  });
  if (!months) return;
  const chk = await deleteCheck(months);
  if (!chk.allowed) {
    sheet({ title: '지울 수 없어요', text: chk.reason, actions: [{ label: '확인', kind: 'primary' }] });
    return;
  }
  const ok = await confirmSheet({
    title: `${chk.count}장을 삭제할까요?`,
    text: '삭제하면 이 기기에서 사라져요. 백업 파일이 있어야 다시 볼 수 있어요.',
    ok: '삭제', danger: true
  });
  if (!ok) return;
  await db.deleteMeals(chk.ids);
  toast({ text: `${chk.count}장을 삭제했어요` });
}
