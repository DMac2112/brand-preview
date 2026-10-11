window.BRAND_VERSIONS = [{v:'video',label:'Film 1'},{v:'3d',label:'3D 1'},{v:'3d-2',label:'3D 2'},{v:'video-2',label:'Film 2'},{v:'v6',label:'V6'}];
window.BRAND_VERSIONS.push({v:'v7',label:'V7'});
window.BRAND_VERSIONS.push({v:'v8',label:'V8'});
window.BRAND_VERSIONS.push({v:'v5',label:'V5'});
window.BRAND_VERSIONS.push({v:'v9',label:'V9'});
window.BRAND_VERSIONS.push({v:'v10',label:'V10'});
window.BRAND_VERSIONS.push({v:'v11',label:'V11'});
window.fillModeNav = function(){
  if (!document.getElementById('mode-nowrap')) {
    var style = document.createElement('style');
    style.id = 'mode-nowrap';
    style.textContent = 'nav.mode{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:calc(100vw - 32px);white-space:nowrap}nav.mode::-webkit-scrollbar{display:none}@media(max-width:760px){nav.mode{max-width:calc(100vw - 140px);padding-inline:16px!important}}';
    document.head.appendChild(style);
  }
  var parts = location.pathname.replace(/\/$/, '').split('/');
  var current = parts.pop(); if (current === 'index.html') current = parts.pop();
  [].forEach.call(document.querySelectorAll('nav.mode'), function(nav){
    nav.textContent = '';
    window.BRAND_VERSIONS.forEach(function(item){
      var a = document.createElement('a'); a.href = '../' + item.v + '/';
      a.setAttribute('data-v', item.v); a.textContent = item.label;
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
