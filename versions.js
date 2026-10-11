window.BRAND_VERSIONS = [{v:'video',label:'Film 1'},{v:'3d',label:'3D 1'},{v:'3d-2',label:'3D 2'},{v:'video-2',label:'Film 2'},{v:'v6',label:'V6'}];
window.BRAND_VERSIONS.push({v:'v7',label:'V7'});
window.BRAND_VERSIONS.push({v:'v5',label:'V5'});
window.fillModeNav = function(){
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
    nav.addEventListener('click', function(e){
      var a = e.target.closest('a[data-v]'); if (!a || !nav.contains(a) || a.search) return;
      var s = document.body.getAttribute('data-s');
      if (s === null && window.__screen !== undefined) s = window.__screen;
      if (s !== null && s !== undefined && s !== '') a.search = '?s=' + encodeURIComponent(s);
    });
  });
};
window.fillModeNav();
