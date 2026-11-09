// 촬영/가져온 사진을 "무엇인지 알아볼 정도"로만 줄여서 WebP로 만든다. 원본은 보관하지 않는다.
export const PRESETS = {
  save: { label: '절약', max: 640, q: 0.6, est: '연 약 65MB' },
  std: { label: '표준', max: 800, q: 0.7, est: '연 약 120MB' },
  sharp: { label: '선명', max: 1080, q: 0.8, est: '연 약 240MB' }
};
export const THUMB = { max: 240, q: 0.6 };

// 호출 즉시(동기) 현재 프레임을 캔버스로 복사한다. 비디오 프레임이 바뀌어도 안전.
export function scaled(source, sw, sh, max) {
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s));
  c.height = Math.max(1, Math.round(sh * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
async function best(c, q) {
  let b = await toBlob(c, 'image/webp', q);
  if (!b || b.type !== 'image/webp') b = await toBlob(c, 'image/jpeg', q);
  return b;
}

export async function process(source, sw, sh, preset) {
  const base = scaled(source, sw, sh, preset.max);
  const t = scaled(base, base.width, base.height, THUMB.max);
  const [photo, thumb] = await Promise.all([best(base, preset.q), best(t, THUMB.q)]);
  return { photo: { blob: photo, w: base.width, h: base.height }, thumb };
}

export async function decode(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return { bmp, w: bmp.width, h: bmp.height };
}

// JPEG EXIF 촬영시각(DateTimeOriginal). 없으면 null.
export async function exifTime(file) {
  try {
    const v = new DataView(await file.slice(0, 131072).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const t = off + 10;
        const le = v.getUint16(t) === 0x4949;
        const g16 = o => v.getUint16(t + o, le);
        const g32 = o => v.getUint32(t + o, le);
        const find = (ifd, tag) => {
          const n = g16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (g16(e) === tag) return e + 8;
          }
          return null;
        };
        const p = find(g32(4), 0x8769);
        if (p == null) return null;
        const exif = g32(p);
        const q = find(exif, 0x9003) ?? find(exif, 0x9004);
        if (q == null) return null;
        const so = g32(q);
        let s = '';
        for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + so + i));
        const m = s.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/);
        if (!m || +m[1] < 1990) return null;
        return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      }
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch { /* EXIF 없음 */ }
  return null;
}
