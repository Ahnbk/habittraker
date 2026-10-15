import { h } from './util.js';
import { icon } from './icons.js';
import { iconBtn, pushOverlay, closeOverlay } from './ui.js';
import { saveShot } from './meals.js';
import { decode } from './image.js';

// 앱 안 카메라. 셔터를 누르면 즉시 저장하고 카메라는 계속 켜 둔다(여러 접시 연속 촬영).
// 닫히면 저장한 장수를 resolve.
export function openCamera() {
  return new Promise(resolve => {
    let stream = null, facing = 'environment', saved = 0, lastUrl = null, entry;

    const video = h('video', { class: 'cam-video', playsinline: '', autoplay: '' });
    video.muted = true;
    const flash = h('div', { class: 'cam-flash' });
    const msg = h('div', { class: 'cam-msg', hidden: true });
    const count = h('div', { class: 'cam-count' });
    const last = h('div', { class: 'cam-last' });
    const shutter = h('button', { class: 'cam-shutter', 'aria-label': '촬영', onclick: shoot }, h('span'));
    const flip = iconBtn('flip', '카메라 전환', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); }, 'cam-btn');
    const close = iconBtn('close', '닫기', () => closeOverlay(entry), 'cam-btn');

    const root = h('div', { class: 'overlay camera' },
      h('div', { class: 'cam-top' }, close, count),
      h('div', { class: 'cam-stage' }, video, flash, msg),
      h('div', { class: 'cam-bottom' }, last, shutter, flip));

    function stop() {
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
    }
    function showMsg(title, sub, withFallback) {
      msg.hidden = false;
      msg.replaceChildren(
        h('div', { class: 'cam-msg-t' }, title),
        sub && h('div', { class: 'cam-msg-s' }, sub),
        withFallback && h('button', { class: 'btn primary', onclick: fallback }, icon('camera', 22), '기본 카메라로 찍기'),
        withFallback && h('button', { class: 'btn ghost light', onclick: start }, '다시 시도'));
    }
    async function start() {
      stop();
      msg.hidden = true;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        if (entry?.disposed) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        await video.play();
      } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          showMsg('카메라 권한이 꺼져 있어요', '주소창 왼쪽 자물쇠(또는 앱 정보)에서 카메라를 허용해 주세요.', true);
        } else {
          showMsg('카메라를 열 수 없어요', '다른 앱이 카메라를 쓰고 있는지 확인해 주세요.', true);
        }
      }
    }

    function onSaved(meta) {
      saved++;
      count.textContent = `${saved}장 저장됨`;
      count.classList.add('on');
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(meta.thumb);
      last.style.backgroundImage = `url(${lastUrl})`;
      last.classList.remove('pop');
      void last.offsetWidth;
      last.classList.add('pop');
    }
    function onError(e) {
      const full = e?.name === 'QuotaExceededError';
      showMsg(full ? '저장 공간이 가득 찼어요' : '저장하지 못했어요',
        full ? '설정에서 오래된 사진을 줄이거나 지운 뒤 다시 찍어 주세요.' : String(e?.message || e), false);
      setTimeout(() => { msg.hidden = true; }, 3500);
    }

    async function shoot() {
      if (!stream || !video.videoWidth) return;
      navigator.vibrate?.(12);
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      // 누른 순간의 프레임을 먼저 복사해 둔다.
      const frame = document.createElement('canvas');
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext('2d').drawImage(video, 0, 0);
      try {
        onSaved(await saveShot(frame, frame.width, frame.height, Date.now()));
      } catch (e) { onError(e); }
    }

    async function fallback() {
      const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
      input.addEventListener('change', async () => {
        const f = input.files[0];
        input.remove();
        if (!f) return;
        try {
          const { bmp, w, h: hh } = await decode(f);
          onSaved(await saveShot(bmp, w, hh, Date.now()));
          bmp.close?.();
        } catch (e) { onError(e); }
      });
      document.body.append(input);
      input.click();
    }

    const onKey = e => { if (e.key === ' ' || e.key === 'Enter') shoot(); };
    window.addEventListener('keydown', onKey);

    entry = pushOverlay(root, {
      onClose: () => {
        window.removeEventListener('keydown', onKey);
        stop();
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        resolve(saved);
      }
    });
    start();
  });
}
