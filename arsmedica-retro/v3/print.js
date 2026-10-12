document.querySelectorAll('[data-print]').forEach(function (button) {
  button.hidden = false;
  button.addEventListener('click', function () { window.print(); });
});
