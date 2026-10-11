/* V6 is the chosen direction; every other version stays reachable under "Archiwum" while we test. */
window.BRAND_VERSIONS = [
  {v:'v6',label:'Główna (V6)',main:true},
  {v:'v6-original',label:'V6 (przed zmianami)',archive:true},
  {v:'video',label:'Film 1',archive:true},{v:'3d',label:'3D 1',archive:true},{v:'3d-2',label:'3D 2',archive:true},
  {v:'video-2',label:'Film 2',archive:true},{v:'film-live',label:'Film 1 Live',archive:true},{v:'film-live-2',label:'Film 1 Live 2',archive:true},
  {v:'film-ferro',label:'Ferro',archive:true},{v:'film-3d1',label:'Film 1 + 3D 1',archive:true},{v:'film-hybrid',label:'Film 1 + Ferro',archive:true},
  {v:'v7',label:'V7',archive:true},{v:'v8',label:'V8',archive:true},{v:'v9',label:'V9',archive:true},{v:'v10',label:'V10',archive:true},{v:'v11',label:'V11',archive:true}
];
window.fillModeNav = function(){
  if (!document.getElementById('mode-nowrap')) {
    var style = document.createElement('style');
    style.id = 'mode-nowrap';
    style.textContent = 'nav.mode{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:calc(100vw - 32px);white-space:nowrap}nav.mode::-webkit-scrollbar{display:none}@media(max-width:760px){nav.mode{max-width:calc(100vw - 140px);padding-inline:16px!important}}nav.mode a.main-version{order:-1;background:#17191C!important;color:#F7F8F9!important;font-weight:600;margin-right:8px;box-shadow:inset 0 -2px 0 #8E959C}nav.mode a.main-version[aria-current]{box-shadow:inset 0 -2px 0 #F7F8F9}nav.mode a.archived[aria-current]{background:#E4E7EA!important;color:#17191C!important;box-shadow:inset 0 -2px 0 #17191C}nav.mode a.archived{display:none}nav.mode.show-archive a.archived{display:inline-block}nav.mode .archive-toggle{flex:0 0 auto;font:inherit;font-size:inherit;color:inherit;opacity:.7;background:none;border:0;border-left:1px solid currentColor;margin-left:6px;padding:0 10px;cursor:pointer;white-space:nowrap}nav.mode .archive-toggle::after{content:" +"}nav.mode.show-archive .archive-toggle::after{content:" \\2212"}';
    document.head.appendChild(style);
  }
  var parts = location.pathname.replace(/\/$/, '').split('/');
  var current = parts.pop(); if (current === 'index.html') current = parts.pop();
  [].forEach.call(document.querySelectorAll('nav.mode'), function(nav){
    nav.textContent = '';
    var inArchive = window.BRAND_VERSIONS.some(function(item){ return item.archive && item.v === current; });
    var open = inArchive; try { open = open || sessionStorage.getItem('dm-archive') === '1'; } catch (e) {}
    nav.classList.toggle('show-archive', open);
    window.BRAND_VERSIONS.forEach(function(item, i){
      if (item.archive && !window.BRAND_VERSIONS[i-1].archive) {
        var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'archive-toggle';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); toggle.textContent = 'Archiwum';
        toggle.addEventListener('click', function(){
          var on = !nav.classList.contains('show-archive'); nav.classList.toggle('show-archive', on);
          toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
          try { sessionStorage.setItem('dm-archive', on ? '1' : '0'); } catch (e) {}
        });
        nav.appendChild(toggle);
      }
      var a = document.createElement('a'); a.href = '../' + item.v + '/';
      a.setAttribute('data-v', item.v); a.textContent = item.label;
      if (item.archive) a.className = 'archived';
      if (item.main) { a.className = 'main-version'; a.title = 'Główna wersja: tę rozwijamy i do niej piszemy teksty'; }
      if (item.v === current) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    var selected = nav.querySelector('a[aria-current="page"]');
    if (selected) {
      var navBox = nav.getBoundingClientRect();
      var linkBox = selected.getBoundingClientRect();
      if (linkBox.left < navBox.left) nav.scrollLeft += linkBox.left - navBox.left - 16;
      else if (linkBox.right > navBox.right) nav.scrollLeft += linkBox.right - navBox.right + 16;
    }
    nav.addEventListener('click', function(e){
      var a = e.target.closest('a[data-v]'); if (!a || !nav.contains(a) || a.search) return;
      var s = document.body.getAttribute('data-s');
      if (s === null && window.__screen !== undefined) s = window.__screen;
      if (s !== null && s !== undefined && s !== '') a.search = '?s=' + encodeURIComponent(s);
    });
  });
};
window.fillModeNav();
