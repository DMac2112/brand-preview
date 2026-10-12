/* Lazy loader for V6 route graphics ("travellers"). Each traveller lives in its own file and calls
   Travellers.register(id, factory). Only the selected one is ever downloaded. */
(function (window, document) {
  'use strict';
  var factories = {}, loading = {};
  function entry(id) {
    var list = window.TRAVELLERS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  window.Travellers = {
    register: function (id, factory) { factories[id] = factory; },
    has: function (id) { return !!entry(id); },
    load: function (id, done) {
      if (factories[id]) return done(null);
      var item = entry(id);
      if (!item) return done(new Error('unknown traveller ' + id));
      if (loading[id]) { loading[id].push(done); return; }
      loading[id] = [done];
      var script = document.createElement('script');
      script.src = 'travellers/' + item.file + '?v=' + (window.TRAVELLERS_VERSION || 1);
      script.async = true;
      function finish(err) { var cbs = loading[id] || []; delete loading[id]; cbs.forEach(function (cb) { cb(err); }); }
      script.onload = function () { finish(factories[id] ? null : new Error(id + ' did not register')); };
      script.onerror = function () { finish(new Error('could not load ' + item.file)); };
      document.head.appendChild(script);
    },
    create: function (id, host, env) {
      var api = factories[id](host, env) || {};
      api.isTraveller = true; api.isLite = false;
      if (!api.resize) api.resize = function () {};
      if (!api.frame) api.frame = function () {};
      if (!api.destroy) api.destroy = function () {};
      return api;
    }
  };
})(window, document);
