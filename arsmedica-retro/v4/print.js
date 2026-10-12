document.querySelectorAll('[data-print]').forEach(button => {
  button.addEventListener('click', () => window.print());
});
let openedForPrint = [];
window.addEventListener('beforeprint', () => {
  openedForPrint = [...document.querySelectorAll('details:not([open])')];
  openedForPrint.forEach(details => { details.open = true; });
});
window.addEventListener('afterprint', () => {
  openedForPrint.forEach(details => { details.open = false; });
  openedForPrint = [];
});
