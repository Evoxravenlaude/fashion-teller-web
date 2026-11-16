/* 404 page: the gold thread draws itself across the dark panel. */
(() => {
  document.addEventListener('DOMContentLoaded', () => FT.ready.then(() => {
    const el = document.getElementById('nfThread');
    if (el) FT.thread(el, { paths: [[[0.55, 0.2], [0.7, 0.35], [0.62, 0.5], [0.8, 0.62], [0.72, 0.8]], [[0.72, 0.8], [0.9, 0.9]]], duration: 2200, width: 1.6, light: true, glints: 0.2 });
  }));
})();
