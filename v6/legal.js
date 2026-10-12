/* V6 legal pages: theme switch (same localStorage key as the main page), current year,
   section index highlight, and the "clear saved settings" button on cookies.html. No network, no cookies. */
(function () {
  'use strict';
  var root = document.documentElement;

  var themeButton = document.querySelector('.theme');
  var themeColor = document.querySelector('meta[name="theme-color"]');
  function syncTheme() {
    var dark = root.dataset.theme === 'dark';
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false');
      themeButton.setAttribute('aria-label', dark ? 'Włącz tryb jasny' : 'Włącz tryb ciemny');
    }
    if (themeColor) themeColor.setAttribute('content', dark ? '#111315' : '#F7F8F9');
  }
  syncTheme();
  if (themeButton) themeButton.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('dm-theme', root.dataset.theme); } catch (e) {}
    syncTheme();
  });

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  // highlight the section being read in the index
  var links = [].slice.call(document.querySelectorAll('.index a[href^="#"]'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var current = null;
      for (var i = 0; i < links.length; i++) {
        var id = links[i].getAttribute('href').slice(1);
        if (visible[id]) { current = id; break; }
      }
      if (!current) return;
      links.forEach(function (a) {
        if (a === byId[current]) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-10% 0px -55% 0px' });
    links.forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) io.observe(target);
    });
  }

  // cookies.html: remove everything this site saved in this browser
  var clear = document.querySelector('[data-clear-storage]');
  var status = document.querySelector('[data-clear-status]');
  if (clear && status) clear.addEventListener('click', function () {
    var removed = 0;
    [['localStorage', ['dm-theme', 'dm-v6-g', 'dm-v6-p', 'v7-theme', 'v9-theme', 'v10-theme', 'dm-v8-theme', 'dm-v11-dark']], ['sessionStorage', ['dm-archive']]].forEach(function (pair) {
      try {
        var store = window[pair[0]];
        pair[1].forEach(function (key) { if (store.getItem(key) !== null) { store.removeItem(key); removed++; } });
      } catch (e) {}
    });
    root.dataset.theme = 'light';
    syncTheme();
    status.textContent = removed
      ? 'Usunięto zapisane ustawienia tej strony. Strona wróciła do trybu jasnego.'
      : 'Ta przeglądarka nie miała zapisanych ustawień tej strony.';
    status.classList.add('done');
  });
})();
