import { PRESETS, process } from './image.js';
import * as db from './db.js';
import { dateKey, newId } from './util.js';

export async function currentPreset() {
  return PRESETS[await db.getSetting('preset', 'std')] || PRESETS.std;
}

export async function saveShot(source, sw, sh, takenAt = Date.now()) {
  const preset = await currentPreset();
  const { photo, thumb } = await process(source, sw, sh, preset);
  const now = Date.now();
  const meta = {
    id: newId(takenAt),
    takenAt,
    tzOffset: new Date(takenAt).getTimezoneOffset(),
    dateKey: dateKey(takenAt),
    createdAt: now,
    updatedAt: now,
    thumb,
    mime: photo.blob.type,
    w: photo.w,
    h: photo.h,
    bytes: photo.blob.size
  };
  await db.addMeal(meta, photo.blob);
  requestPersist();
  return meta;
}

let asked = false;
export async function requestPersist() {
  if (asked || !navigator.storage?.persist) return;
  asked = true;
  try { await navigator.storage.persist(); } catch { /* 무시 */ }
}
