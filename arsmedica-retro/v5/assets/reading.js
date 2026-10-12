(() => {
  'use strict';
  const root = document.documentElement;
  const keys = { size: 'arsmedica-v5-text-size', contrast: 'arsmedica-v5-contrast' };
  const sizes = { normal: '1', large: '1.15', largest: '1.3' };
  let size = 'normal';
  let contrast = 'normal';
  try {
    const savedSize = localStorage.getItem(keys.size);
    const savedContrast = localStorage.getItem(keys.contrast);
    if (Object.prototype.hasOwnProperty.call(sizes, savedSize)) size = savedSize;
    if (savedContrast === 'high') contrast = savedContrast;
  } catch (_) { /* Settings still work when browser storage is unavailable. */ }
  root.style.setProperty('--scale', sizes[size]);
  root.dataset.contrast = contrast;
  document.addEventListener('DOMContentLoaded', () => {
    root.classList.add('has-js');
    const sync = () => {
      document.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.size === size)));
      document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === contrast)));
    };
    sync();
    document.querySelectorAll('[data-size], [data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.size) {
          size = button.dataset.size;
          root.style.setProperty('--scale', sizes[size]);
          try { localStorage.setItem(keys.size, size); } catch (_) {}
        } else {
          contrast = button.dataset.mode;
          root.dataset.contrast = contrast;
          try { localStorage.setItem(keys.contrast, contrast); } catch (_) {}
        }
        sync();
      });
    });
    document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
    let closedDetails = [];
    window.addEventListener('beforeprint', () => {
      closedDetails = Array.from(document.querySelectorAll('details:not([open])'));
      closedDetails.forEach(detail => { detail.open = true; });
    });
    window.addEventListener('afterprint', () => {
      closedDetails.forEach(detail => { detail.open = false; });
      closedDetails = [];
    });
  });
})();
