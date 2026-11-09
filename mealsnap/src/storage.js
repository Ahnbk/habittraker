// 용량 관리: 사용량 조회, 오래된 사진 다시 줄이기, 오래된 기록 삭제.
import * as db from './db.js';
import { PRESETS, scaled, decode } from './image.js';

const MONTH = 30.44 * 86400000;

export async function usage() {
  const meals = await db.allMeals();
  const bytes = meals.reduce((n, m) => n + (m.bytes || 0), 0);
  let used = null, quota = null, persisted = null;
  try {
    const e = await navigator.storage?.estimate?.();
    used = e?.usage ?? null; quota = e?.quota ?? null;
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch { /* 무시 */ }
  return { count: meals.length, photoBytes: bytes, avg: meals.length ? bytes / meals.length : 0, used, quota, persisted };
}

const cutoffOf = months => Date.now() - months * MONTH;

// months개월보다 오래된 사진을 '절약' 화질로 재압축. 이미 충분히 작으면 건너뜀.
export async function recompressOlder(months, onProgress) {
  const p = PRESETS.save;
  const targets = (await db.allMeals()).filter(m => m.takenAt < cutoffOf(months) && Math.max(m.w, m.h) > p.max);
  let saved = 0;
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    onProgress?.(i / targets.length, `${i + 1} / ${targets.length}장`);
    const blob = await db.getPhoto(m.id);
    if (!blob) continue;
    const { bmp, w, h } = await decode(blob);
    const c = scaled(bmp, w, h, p.max);
    bmp.close?.();
    let out = await new Promise(r => c.toBlob(r, 'image/webp', p.q));
    if (!out || out.type !== 'image/webp') out = await new Promise(r => c.toBlob(r, 'image/jpeg', p.q));
    if (out && out.size < blob.size) {
      saved += blob.size - out.size;
      await db.updateMeal(m.id, { w: c.width, h: c.height, mime: out.type, bytes: out.size }, out);
    }
    await new Promise(r => setTimeout(r)); // UI 양보
  }
  onProgress?.(1);
  return { done: targets.length, saved };
}

// 백업 없이 지우는 사고 방지: 마지막 '전체' 백업 이후 바뀐 게 없어야 삭제 허용.
export async function deleteCheck(months) {
  const targets = (await db.allMeals()).filter(m => m.takenAt < cutoffOf(months));
  const lastFull = await db.getSetting('lastFullBackupAt', null);
  if (!targets.length) return { count: 0, allowed: false, reason: '해당 기간의 기록이 없어요.' };
  if (!lastFull) return { count: targets.length, allowed: false, reason: '먼저 "전체 백업"을 만들어 주세요.' };
  if (targets.some(m => (m.updatedAt || m.createdAt) > lastFull)) {
    return { count: targets.length, allowed: false, reason: '마지막 전체 백업 이후 바뀐 사진이 있어요. 전체 백업을 다시 만들어 주세요.' };
  }
  return { count: targets.length, allowed: true, ids: targets.map(m => m.id) };
}
