// 화면에 보이는 사진만 메모리에 올리는 지연 로더.
const thumbUrls = new Map();
export function thumbUrl(meal) {
  let u = thumbUrls.get(meal.id);
  if (!u) { u = URL.createObjectURL(meal.thumb); thumbUrls.set(meal.id, u); }
  return u;
}

export function lazyImages({ root = null, margin = '600px 0px', load }) {
  const imgs = new Set();
  const io = new IntersectionObserver(entries => {
    for (const e of entries) (e.isIntersecting ? show : hide)(e.target);
  }, { root, rootMargin: margin });

  async function show(img) {
    img._vis = true;
    if (img._url) return;
    const blob = await load(img.dataset.id);
    if (!blob || !img._vis || !img.isConnected || img._url) return;
    img._url = URL.createObjectURL(blob);
    img.src = img._url;
  }
  function hide(img) {
    img._vis = false;
    if (img._url) {
      URL.revokeObjectURL(img._url);
      img._url = null;
      img.removeAttribute('src');
      img.classList.remove('loaded');
    }
  }
  return {
    observe(img) {
      img.addEventListener('load', () => img.classList.add('loaded'));
      imgs.add(img);
      io.observe(img);
    },
    destroy() {
      io.disconnect();
      for (const img of imgs) if (img._url) URL.revokeObjectURL(img._url);
      imgs.clear();
    }
  };
}
