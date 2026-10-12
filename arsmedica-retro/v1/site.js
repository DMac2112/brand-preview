'use strict';
// Wyłącznie etykieta dnia i druk. Bez sieci, cookies i pamięci przeglądarki.
document.querySelectorAll('[data-print]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', () => window.print());
});
let printState = [];
window.addEventListener('beforeprint', () => {
  printState = [...document.querySelectorAll('details')].map(element => [element, element.open]);
  printState.forEach(([element]) => { element.open = true; });
});
window.addEventListener('afterprint', () => {
  printState.forEach(([element, wasOpen]) => { element.open = wasOpen; });
});
