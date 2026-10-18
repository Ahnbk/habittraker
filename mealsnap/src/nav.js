// 해시 라우팅 보조: 탭 이동은 히스토리를 쌓지 않고(뒤로가기=앱 종료), 상세→목록은 자연스럽게 되돌린다.
let prev = null;
let cur = location.hash;
export function track(hash) { prev = cur; cur = hash; }
export const replace = hash => { if (location.hash !== hash) location.replace(hash); };
export function back(fallback) {
  if (prev && prev.startsWith(fallback) && history.length > 1) history.back();
  else replace(fallback);
}
export const retap = tab => window.dispatchEvent(new CustomEvent('tab-retap', { detail: tab }));
