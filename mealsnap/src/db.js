// IndexedDB 저장소. meals(메타+썸네일) / photos(본 사진) / settings.
const DB_NAME = 'mealsnap';
let dbp;
let cache = null; // takenAt 오름차순 정렬된 meals
const byId = new Map();
const settings = new Map();

function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      const m = db.createObjectStore('meals', { keyPath: 'id' });
      m.createIndex('takenAt', 'takenAt');
      m.createIndex('dateKey', 'dateKey');
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = tx => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error('aborted'));
});
const byTime = (a, b) => a.takenAt - b.takenAt || (a.id < b.id ? -1 : 1);

export function notify() {
  window.dispatchEvent(new CustomEvent('meals-changed'));
}

export async function allMeals() {
  if (cache) return cache;
  const db = await open();
  const list = await req(db.transaction('meals').objectStore('meals').getAll());
  list.sort(byTime);
  cache = list;
  byId.clear();
  for (const m of list) byId.set(m.id, m);
  const rows = await req(db.transaction('settings').objectStore('settings').getAll());
  for (const r of rows) settings.set(r.key, r.value);
  return cache;
}
export const getMeal = id => byId.get(id);
export const mealsOnDay = key => (cache || []).filter(m => m.dateKey === key);

export async function addMeal(meta, blob, { silent = false } = {}) {
  await allMeals();
  const db = await open();
  const tx = db.transaction(['meals', 'photos'], 'readwrite');
  tx.objectStore('meals').put(meta);
  tx.objectStore('photos').put({ id: meta.id, blob });
  await txDone(tx);
  cache.push(meta);
  cache.sort(byTime);
  byId.set(meta.id, meta);
  if (!silent) notify();
}

export async function updateMeal(id, patch, newBlob) {
  await allMeals();
  const m = byId.get(id);
  if (!m) return;
  Object.assign(m, patch, { updatedAt: Date.now() });
  const db = await open();
  const tx = db.transaction(['meals', 'photos'], 'readwrite');
  tx.objectStore('meals').put(m);
  if (newBlob) tx.objectStore('photos').put({ id, blob: newBlob });
  await txDone(tx);
  cache.sort(byTime);
  notify();
}

export async function deleteMeals(ids, { silent = false } = {}) {
  await allMeals();
  const db = await open();
  const tx = db.transaction(['meals', 'photos'], 'readwrite');
  for (const id of ids) {
    tx.objectStore('meals').delete(id);
    tx.objectStore('photos').delete(id);
  }
  await txDone(tx);
  const set = new Set(ids);
  cache = cache.filter(m => !set.has(m.id));
  for (const id of ids) byId.delete(id);
  if (!silent) notify();
}
export const deleteMeal = id => deleteMeals([id]);

export async function getPhoto(id) {
  const db = await open();
  const row = await req(db.transaction('photos').objectStore('photos').get(id));
  return row?.blob || null;
}

export async function getSetting(key, def) {
  await allMeals();
  return settings.has(key) ? settings.get(key) : def;
}
export async function setSetting(key, value) {
  await allMeals();
  settings.set(key, value);
  const db = await open();
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key, value });
  await txDone(tx);
}
