// 백업 = 무압축(store) ZIP 하나. 앱 없이도 열어볼 수 있다.
//   meta.json / photos/<id>.webp / thumbs/<id>.webp
import * as db from './db.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms) {
  const d = new Date(ms);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

// entries: [{name, data: Blob|Uint8Array, time?: ms}] → Blob(zip). 사진은 한 장씩만 메모리에 올린다.
export async function buildZip(entries, onProgress) {
  const parts = [];
  const central = [];
  let offset = 0;
  let i = 0;
  for (const e of entries) {
    const bytes = e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data;
    const name = enc.encode(e.name);
    const crc = crc32(bytes);
    const { time, date } = dosDateTime(e.time || Date.now());
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 파일명
    lh.setUint16(8, 0, true);      // store
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, bytes.length, true);
    lh.setUint32(22, bytes.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, e.data instanceof Blob ? e.data : bytes);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, bytes.length, true);
    ch.setUint32(24, bytes.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);

    offset += 30 + name.length + bytes.length;
    onProgress?.(++i / entries.length);
  }
  const cdSize = central.reduce((n, b) => n + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export async function readZip(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('백업 파일(zip)이 아니에요');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const files = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('zip 구조가 올바르지 않아요');
    const method = cd.getUint16(p + 10, true);
    const csize = cd.getUint32(p + 20, true);
    const nlen = cd.getUint16(p + 28, true);
    const elen = cd.getUint16(p + 30, true);
    const clen = cd.getUint16(p + 32, true);
    const lho = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nlen));
    files.set(name, { method, csize, lho });
    p += 46 + nlen + elen + clen;
  }
  async function read(name, type = '') {
    const f = files.get(name);
    if (!f) return null;
    const lh = new DataView(await file.slice(f.lho, f.lho + 30).arrayBuffer());
    const start = f.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const raw = file.slice(start, start + f.csize, type);
    if (f.method === 0) return raw;
    if (f.method === 8) {
      const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Blob([await new Response(stream).arrayBuffer()], { type });
    }
    throw new Error('지원하지 않는 압축 방식이에요');
  }
  return { names: [...files.keys()], read };
}

const extOf = mime => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp');

// incrementalSince: 이 시각 이후 추가/수정된 것만. null이면 전체.
export async function createBackup({ incrementalSince = null } = {}, onProgress) {
  let meals = await db.allMeals();
  if (incrementalSince != null) meals = meals.filter(m => (m.updatedAt || m.createdAt) > incrementalSince);
  const items = [];
  const entries = [];
  const total = meals.length || 1;
  for (let i = 0; i < meals.length; i++) {
    const m = meals[i];
    const photo = await db.getPhoto(m.id);
    if (!photo) continue;
    const ext = extOf(m.mime);
    const pf = `photos/${m.id}.${ext}`;
    const tf = `thumbs/${m.id}.${extOf(m.thumb.type)}`;
    items.push({
      id: m.id, takenAt: m.takenAt, tzOffset: m.tzOffset, createdAt: m.createdAt, updatedAt: m.updatedAt,
      w: m.w, h: m.h, mime: m.mime, photo: pf, thumb: tf
    });
    entries.push({ name: pf, data: photo, time: m.takenAt }, { name: tf, data: m.thumb, time: m.takenAt });
    onProgress?.((i + 1) / total * 0.3);
  }
  const meta = { app: 'mealsnap', version: 1, exportedAt: Date.now(), kind: incrementalSince == null ? 'full' : 'incremental', items };
  entries.unshift({ name: 'meta.json', data: enc.encode(JSON.stringify(meta, null, 1)) });
  const blob = await buildZip(entries, f => onProgress?.(0.3 + f * 0.7));
  return { blob, count: items.length };
}

// 복원 = 병합. 이미 있는 id는 건너뛴다.
export async function restoreBackup(file, onProgress) {
  const zip = await readZip(file);
  const metaBlob = await zip.read('meta.json');
  if (!metaBlob) throw new Error('meta.json이 없어요. 밥찰칵 백업이 맞나요?');
  const meta = JSON.parse(await metaBlob.text());
  if (meta.app !== 'mealsnap') throw new Error('밥찰칵 백업 파일이 아니에요');
  await db.allMeals();
  let added = 0, skipped = 0;
  const { THUMB, scaled } = await import('./image.js');
  for (let i = 0; i < meta.items.length; i++) {
    const it = meta.items[i];
    onProgress?.(i / meta.items.length);
    if (db.getMeal(it.id)) { skipped++; continue; }
    const photo = await zip.read(it.photo, it.mime);
    if (!photo) continue;
    let thumb = await zip.read(it.thumb, 'image/webp');
    if (!thumb) {
      const bmp = await createImageBitmap(photo);
      const c = scaled(bmp, bmp.width, bmp.height, THUMB.max);
      thumb = await new Promise(r => c.toBlob(r, 'image/webp', THUMB.q));
    }
    const d = new Date(it.takenAt);
    const pad = n => String(n).padStart(2, '0');
    await db.addMeal({
      id: it.id, takenAt: it.takenAt, tzOffset: it.tzOffset,
      dateKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      createdAt: it.createdAt, updatedAt: it.updatedAt || it.createdAt,
      thumb, mime: it.mime, w: it.w, h: it.h, bytes: photo.size
    }, photo, { silent: true });
    added++;
  }
  onProgress?.(1);
  db.notify();
  return { added, skipped };
}
