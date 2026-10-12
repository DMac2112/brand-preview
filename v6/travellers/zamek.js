/* Zamek — a zipper slider riding the route.
   The route itself becomes the zipper: AHEAD of the slider it is a closed chain (two rows of tiny teeth,
   offset half a pitch so they interlock); BEHIND it the two rows are opened apart, each on its own tape edge.
   The slider is drawn like the page's step-art: ink outline, mist body, light bridge, an ink pull tab with
   an eye and a slot. The slider is locked to the route tangent; the tab hangs by gravity (screen-down),
   trails with scroll speed, and is grabbed toward the pointer when it comes within ~250 px.
   Teeth are static geometry built once per relayout, split into ~160 px chunks (≈ 2 nodes each). Chunks fully
   behind / ahead are toggled with display; only the chunk under the slider is cut by two half-plane clips whose
   transforms are moved with SVGTransform objects (no strings per frame). Idle = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';
  var DEG = 180 / Math.PI;

  // Slider in its own units, forward (towards the closed chain) = +y. Mouth at +15, shoulders at -15.
  var BODY = 'M0 -13.4L7.4 -15Q10.4 -15.6 10.5 -12C10.5 -4.5 6.3 3.5 5.5 12.4Q5.27 15 2.9 15L-2.9 15' +
    'Q-5.27 15 -5.5 12.4C-6.3 3.5 -10.5 -4.5 -10.5 -12Q-10.4 -15.6 -7.4 -15Z';
  var RAILS = 'M7.4 -11.4C7.4 -4.8 4.5 2.6 3.8 11.6M-7.4 -11.4C-7.4 -4.8 -4.5 2.6 -3.8 11.6';
  var BRIDGE = 'M-2.5 -9A2.5 2.5 0 0 1 2.5 -9L2.5 -0.6A2.5 2.5 0 0 1 -2.5 -0.6Z';
  // Pull tab, pivot at 0,0, hanging along +y. Outline + eye + slot, filled even-odd so the holes are real holes.
  var TAB = 'M-3.3 0A3.3 3.3 0 0 1 3.3 0L3.3 5.2C3.3 7 4.6 7.6 4.6 9.6L4.6 21.2A4.6 4.6 0 0 1 -4.6 21.2' +
    'L-4.6 9.6C-4.6 7.6 -3.3 7 -3.3 5.2Z' +
    'M-1.25 0A1.25 1.25 0 1 0 1.25 0A1.25 1.25 0 1 0 -1.25 0Z' +
    'M-1.6 11.6A1.6 1.6 0 0 1 1.6 11.6L1.6 19.4A1.6 1.6 0 0 1 -1.6 19.4Z';
  var PIVOT_Y = -3;       // where the tab hangs from (on the bridge)
  var SPLIT_Y = -6;       // where closed turns into open, hidden under the wide rear of the body

  var CHUNK = 160;        // route length per teeth chunk
  var SSTEP = 2;          // route sampling step (px)
  var R_OUT = 250, R_IN = 50;
  var KV = 0.8;           // how far scroll speed swings the tab
  var W_PSI = 7, W_LS = 9;
  var AHEAD = 1, BEHIND = 2, NEAR = 3;

  var CSS =
    '.zp{overflow:visible}' +
    '.zp .zp-body{fill:var(--mist);stroke:var(--ink);stroke-width:1.5;stroke-linejoin:round}' +
    '.zp .zp-rail{fill:none;stroke:var(--steel);stroke-width:.9;stroke-linecap:round}' +
    '.zp .zp-bridge{fill:var(--bg);stroke:var(--ink);stroke-width:1.2;stroke-linejoin:round}' +
    '.zp .zp-tab{fill:var(--ink);fill-rule:evenodd;stroke:var(--bg);stroke-width:1.6;stroke-linejoin:round;paint-order:stroke}' +
    '.zp.zp-sm .zp-body{stroke-width:1.15}.zp.zp-sm .zp-bridge{stroke-width:.9}.zp.zp-sm .zp-rail{display:none}' +
    '.zp.zp-sm .zp-tab{stroke-width:1.2}';

  function make(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // exact critically damped spring step: stable for any dt, no overshoot from rest
  function step(sp, target, w, dt) {
    var x0 = sp.x - target, k = sp.v + w * x0, e = Math.exp(-w * dt);
    sp.x = target + (x0 + k * dt) * e;
    sp.v = (sp.v - w * k * dt) * e;
  }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function wrap(d) { d = d % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return d; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function config(small) {
    return small ? {
      K: 0.62,
      P: 2.6, tw: 1, tl: 1.8, co: 0.7, oo: 3.6, kw: 0.7
    } : {
      K: 1.15,
      P: 3.2, tw: 1.2, tl: 2.6, co: 1.0, oo: 6.5, kw: 0.8
    };
  }

  window.Travellers.register('zamek', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small), hostSize = small ? 48 : 176;

    // ---------- slider (in the host) ----------
    var svg = make('svg', { 'class': 'zp', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var body = make('g', null, svg), bodyR = tf(body), bodyS = tf(body);
    var NSS = { 'vector-effect': 'non-scaling-stroke' };
    function vs(attrs) { for (var k in NSS) attrs[k] = NSS[k]; return attrs; }
    make('path', vs({ 'class': 'zp-body', d: BODY }), body);
    make('path', vs({ 'class': 'zp-rail', d: RAILS }), body);
    make('path', vs({ 'class': 'zp-bridge', d: BRIDGE }), body);
    var tab = make('g', null, svg), tabT = tf(tab), tabR = tf(tab), tabS = tf(tab);
    make('path', vs({ 'class': 'zp-tab', d: TAB }), tab);
    host.appendChild(svg);

    // ---------- route samples + teeth (in the layer) ----------
    var N = 0, SX = null, SY = null, TX = null, TY = null, total = 0;
    var Q = { x: 0, y: 0, tx: 0, ty: 1 }, Q2 = { x: 0, y: 0, tx: 0, ty: 1 };
    var lroot = null, chunks = [], clipAT = null, clipAR = null, clipBT = null, clipBR = null;
    var routeHidden = false;

    function buildSamples() {
      total = env.total() || 0;
      if (!(total > 1)) { N = 0; return false; }
      var n = Math.ceil(total / SSTEP) + 1, st = total / (n - 1), path = env.routePath;
      SX = new Float64Array(n); SY = new Float64Array(n); TX = new Float64Array(n); TY = new Float64Array(n);
      for (var i = 0; i < n; i++) { var p = path.getPointAtLength(i * st); SX[i] = p.x; SY[i] = p.y; }
      var ltx = 0, lty = 1;
      for (var j = 0; j < n; j++) {
        var a = j > 0 ? j - 1 : 0, b = j < n - 1 ? j + 1 : n - 1;
        var dx = SX[b] - SX[a], dy = SY[b] - SY[a], l = Math.sqrt(dx * dx + dy * dy);
        if (l > 1e-6) { ltx = dx / l; lty = dy / l; }
        TX[j] = ltx; TY[j] = lty;
      }
      N = n; sstep = st;
      return true;
    }
    var sstep = SSTEP;
    function sampleAt(u, out) {
      if (N < 2) { out.x = 0; out.y = 0; out.tx = 0; out.ty = 1; return; }
      var f = u / sstep;
      if (!(f > 0)) f = 0; else if (f > N - 1) f = N - 1;
      var i = f | 0; if (i > N - 2) i = N - 2;
      var r = f - i;
      out.x = SX[i] + (SX[i + 1] - SX[i]) * r;
      out.y = SY[i] + (SY[i + 1] - SY[i]) * r;
      var tx = TX[i] + (TX[i + 1] - TX[i]) * r, ty = TY[i] + (TY[i + 1] - TY[i]) * r, l = Math.sqrt(tx * tx + ty * ty);
      if (l > 1e-6) { out.tx = tx / l; out.ty = ty / l; } else { out.tx = TX[i]; out.ty = TY[i]; }
    }

    function buildTeeth() {
      var layer = env.layer;
      if (lroot && lroot.parentNode) lroot.parentNode.removeChild(lroot);
      chunks = [];
      if (N < 2) return;
      lroot = make('g', { 'class': 'zp-layer' });
      var defs = make('defs', null, lroot);
      var ca = make('clipPath', { id: 'zpAhead', clipPathUnits: 'userSpaceOnUse' }, defs);
      make('rect', { x: 0, y: -2400, width: 2400, height: 4800 }, ca);
      var cb = make('clipPath', { id: 'zpBehind', clipPathUnits: 'userSpaceOnUse' }, defs);
      make('rect', { x: -2400, y: -2400, width: 2400, height: 4800 }, cb);
      function ctf(node) { var t = env.routeSvg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
      clipAT = ctf(ca); clipAR = ctf(ca); clipBT = ctf(cb); clipBR = ctf(cb);

      var T = total, P = C.P, half = C.tl / 2, nCh = Math.max(1, Math.ceil(T / CHUNK)), k, side, u;
      var cl = [], op = [], cd = [];
      for (k = 0; k < nCh; k++) { cl.push([]); op.push([]); cd.push([]); }
      for (side = -1; side <= 1; side += 2) {
        for (u = P * (side < 0 ? 0.25 : 0.75); u < T; u += P) {
          sampleAt(u, Q);
          var nx = -Q.ty, ny = Q.tx, kk = (u / CHUNK) | 0; if (kk >= nCh) kk = nCh - 1;
          var vx = r2(nx * C.tl), vy = r2(ny * C.tl), o = side * C.co - half;
          cl[kk].push('M' + r1(Q.x + nx * o) + ' ' + r1(Q.y + ny * o) + 'l' + vx + ' ' + vy);
          o = side * C.oo - half;
          op[kk].push('M' + r1(Q.x + nx * o) + ' ' + r1(Q.y + ny * o) + 'l' + vx + ' ' + vy);
        }
        // tape edge: a thin cord through the outer ends of the opened teeth
        var ko = side * (C.oo + half);
        for (k = 0; k < nCh; k++) {
          var a = k * CHUNK, b = Math.min(T, a + CHUNK), parts = cd[k], first = true;
          for (u = a; ; u += 4) {
            if (u > b) u = b;
            sampleAt(u, Q);
            parts.push((first ? 'M' : 'L') + r1(Q.x - Q.ty * ko) + ' ' + r1(Q.y + Q.tx * ko));
            first = false;
            if (u >= b) break;
          }
        }
      }
      var gC = make('g', { 'class': 'zp-closed' }, lroot), gO = make('g', { 'class': 'zp-open' }, lroot);
      var sTooth = 'stroke-width:' + C.tw + 'px;stroke-linecap:round;fill:none';
      var sCord = 'stroke-width:' + C.kw + 'px;stroke-linecap:round;stroke-linejoin:round;fill:none';
      for (k = 0; k < nCh; k++) {
        var pc = make('path', { 'class': 'zp-c', d: cl[k].join('') || 'M0 0', style: sTooth }, gC);
        var go = make('g', null, gO);
        make('path', { 'class': 'zp-k', d: cd[k].join(''), style: sCord }, go);
        make('path', { 'class': 'zp-o', d: op[k].join('') || 'M0 0', style: sTooth }, go);
        pc.setAttribute('display', 'none'); go.setAttribute('display', 'none');
        chunks.push({ c: pc, o: go, st: 0 });
      }
      layer.appendChild(lroot);
      if (!routeHidden) { env.routePath.style.opacity = '0'; routeHidden = true; }
    }
    function applyChunk(ch, st) {
      ch.st = st;
      if (st === AHEAD) {
        ch.c.removeAttribute('display'); ch.c.removeAttribute('clip-path'); ch.o.setAttribute('display', 'none');
      } else if (st === BEHIND) {
        ch.o.removeAttribute('display'); ch.o.removeAttribute('clip-path'); ch.c.setAttribute('display', 'none');
      } else {
        ch.c.removeAttribute('display'); ch.c.setAttribute('clip-path', 'url(#zpAhead)');
        ch.o.removeAttribute('display'); ch.o.setAttribute('clip-path', 'url(#zpBehind)');
      }
    }
    function updateChunks(split) {
      for (var k = 0; k < chunks.length; k++) {
        var a = k * CHUNK, st = a + CHUNK <= split ? BEHIND : a >= split ? AHEAD : NEAR;
        if (st !== chunks[k].st) applyChunk(chunks[k], st);
      }
    }

    // ---------- pose ----------
    var fx = 0, fy = 1, pvx = 0, pvy = PIVOT_Y * C.K;
    var wA = NaN, wSx = NaN, wSy = NaN, wSt = NaN, wPx = NaN, wPy = NaN, wPsi = NaN, wLs = NaN;
    var psi = { x: 0, v: 0 }, ls = { x: 1, v: 0 };

    function poseAt(len, stat) {
      sampleAt(len, Q);
      fx = Q.tx; fy = Q.ty;
      var a = Math.atan2(fy, fx) * DEG - 90;
      if (!(Math.abs(a - wA) <= 0.15)) { bodyR.setRotate(a, 0, 0); wA = a; }
      var ar = a / DEG, p = PIVOT_Y * C.K;
      pvx = -p * Math.sin(ar); pvy = p * Math.cos(ar);
      if (N > 1 && chunks.length) {
        var sl = len + SPLIT_Y * C.K;
        sampleAt(sl, Q2);
        var th = Math.atan2(Q2.ty, Q2.tx) * DEG;
        if (!(Math.abs(Q2.x - wSx) <= 0.1 && Math.abs(Q2.y - wSy) <= 0.1 && Math.abs(th - wSt) <= 0.15)) {
          clipAT.setTranslate(Q2.x, Q2.y); clipAR.setRotate(th, 0, 0);
          clipBT.setTranslate(Q2.x, Q2.y); clipBR.setRotate(th, 0, 0);
          wSx = Q2.x; wSy = Q2.y; wSt = th;
        }
        updateChunks(sl);
      }
      if (stat) { psi.x = 0; psi.v = 0; ls.x = 1; ls.v = 0; renderTab(0); }
    }
    function renderTab(eps) {
      if (!(Math.abs(pvx - wPx) <= eps && Math.abs(pvy - wPy) <= eps)) { tabT.setTranslate(pvx, pvy); wPx = pvx; wPy = pvy; }
      if (!(Math.abs(psi.x - wPsi) <= eps)) { tabR.setRotate(psi.x, 0, 0); wPsi = psi.x; }
      if (!(Math.abs(ls.x - wLs) <= eps * 0.02)) { tabS.setScale(C.K, C.K * ls.x); wLs = ls.x; }
    }
    function applyScale() {
      bodyS.setScale(C.K, C.K);
      if (small) svg.classList.add('zp-sm'); else svg.classList.remove('zp-sm');
      wA = wPx = wPy = wPsi = wLs = NaN;
    }

    // ---------- reduced motion: static pose that follows the host on scroll ----------
    var rafId = 0, onScroll = null, TRE = /translate3d\(\s*(-?[\d.]+(?:e-?\d+)?)px,\s*(-?[\d.]+(?:e-?\d+)?)px/;
    function syncFromHost() {
      rafId = 0;
      try {
        var m = TRE.exec(host.style.transform || '');
        if (!m || N < 2) return;
        var cx = +m[1] + hostSize / 2, cy = +m[2] + hostSize / 2, best = 0, bd = Infinity;
        for (var i = 0; i < N; i++) { var dx = SX[i] - cx, dy = SY[i] - cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
        poseAt(best * sstep, true);
      } catch (e) {}
    }
    if (reduce) {
      onScroll = function () { if (!rafId) rafId = window.requestAnimationFrame(syncFromHost); };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ---------- relayout ----------
    var relayoutTimer = 0, geomDirty = true, sleeping = false, lastLen = NaN, lastPx = null, lastPy = null;
    function rebuild() {
      relayoutTimer = 0;
      try {
        buildSamples(); buildTeeth();
      } catch (e) {
        try { if (lroot && lroot.parentNode) lroot.parentNode.removeChild(lroot); } catch (e2) {}
        chunks = []; env.routePath.style.opacity = ''; routeHidden = false;
      }
      wSx = wSy = wSt = NaN; geomDirty = true; sleeping = false;
      if (reduce) syncFromHost();
    }

    applyScale();
    renderTab(0);

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2, nextSmall = size < 100;
          hostSize = size;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if (nextSmall !== small) { small = nextSmall; C = config(small); N = 0; }
          applyScale(); geomDirty = true; sleeping = false;
        } catch (e) {}
      },
      relayout: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (N < 2) rebuild(); else relayoutTimer = setTimeout(rebuild, 120);
      },
      frame: function (t, s) {
        try {
          var len = s.len || 0;
          if (reduce) { poseAt(len, true); lastLen = len; geomDirty = false; return; }
          var px = small || s.px == null ? null : s.px, py = small || s.py == null ? null : s.py;
          var vel = s.vel || 0, av = vel < 0 ? -vel : vel;
          var moved = geomDirty || !(Math.abs(len - lastLen) <= 0.02);
          if (sleeping && !moved && px === lastPx && py === lastPy && av < 0.002) return;
          lastPx = px; lastPy = py;
          if (moved) { poseAt(len, false); lastLen = len; geomDirty = false; }

          var dt = Math.min(s.dt || 16.7, 100) / 1000;
          // gravity pulls the tab screen-down; air drag pushes it against the direction of travel
          var gx = -KV * vel * fx, gy = 1 - KV * vel * fy;
          var tgt = Math.atan2(-gx, gy) * DEG, lsT = 1 - 0.16 * (av > 1 ? 1 : av);
          if (px !== null && py !== null) {
            var d = Math.sqrt(px * px + py * py);
            if (d < R_OUT) {
              var g = smooth(R_OUT, R_IN, d), ex = px - pvx, ey = py - pvy;
              if (ex * ex + ey * ey > 9) tgt += g * wrap(Math.atan2(-ex, ey) * DEG - tgt);
              lsT = lsT * (1 - g) + g * (1 + 0.14 * smooth(170, 40, d));
            }
          }
          tgt = psi.x + wrap(tgt - psi.x);
          step(psi, tgt, W_PSI, dt); step(ls, lsT, W_LS, dt);

          if (!moved && Math.abs(psi.x - tgt) < 0.04 && Math.abs(psi.v) < 0.05 && Math.abs(ls.x - lsT) < 0.0006 && Math.abs(ls.v) < 0.001) {
            psi.x = tgt; psi.v = 0; ls.x = lsT; ls.v = 0;
            renderTab(0.001); sleeping = true;
          } else { sleeping = false; renderTab(0.2); }
        } catch (e) {}
      },
      destroy: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (rafId) window.cancelAnimationFrame(rafId);
        if (onScroll) window.removeEventListener('scroll', onScroll);
        relayoutTimer = rafId = 0; onScroll = null; chunks = [];
      }
    };
  });
})(window, document);
