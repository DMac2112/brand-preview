/* Karetka (Kursor tekstowy): the route is a line of text that is being typed.
   The route is the baseline, like type on a path: a thin ink caret stands on it, rising 21 px on the ascender side
   and dipping 7 px below (a caret's own proportions, so it reads as standing on a line, not as a tick across it).
   Behind the caret the route is typed (full steel); ahead it is still a placeholder (faint).
   The caret moves in whole characters (9 px), so scrolling down types and scrolling up deletes. It is solid while
   it types and blinks (530 ms on, 530 ms off) once things are still for half a second.
   Mouse within ~240 px: a mist selection runs along the line from the caret to the point under the pointer,
   one character at a time (critically damped), and collapses back into the caret when the pointer leaves.
   The route's last stretch is horizontal, so the caret ends upright, just before "Napisz do mnie".
   Drawing: the host SVG holds only the caret (one <g>, three SVGTransforms). The typed line and the selection live
   in env.layer, cut into 240 px polyline chunks so a change repaints one chunk, not the page. Untyped chunks are not
   painted at all, typed ones are plain strokes, and only the chunk under the caret uses a dash.
   Idle: early return; the only idle work is the CSS blink. Reduced motion: no blink, no selection, no springs;
   the typed/placeholder split still follows the scroll position. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';

  var STEP = 4;              // route sample spacing (px of route length)
  var CHUNK = 60;            // samples per drawn chunk (240 px of route)
  var IDLE_MS = 500;         // caret stays solid this long after it last moved, then blinks
  var R_IN = 240, R_OUT = 275;
  var REACH = 440;           // how far along the route (px) the pointer may select from the caret
  var W_SEL = 15;            // selection spring speed (rad/s), critically damped
  var END_GAP = 10;          // the caret stops this far before the route's end (the contact button's edge)
  var SEL_W = 28, SEL_OFF = 7; // desktop selection height and its shift toward the ascender side (= (21 - 7) / 2)
  var DEG = 180 / Math.PI;

  var CSS =
    '.kr{overflow:visible}' +
    '.kr .kr-c{fill:var(--ink)}' +
    '.kr.kr-blink .kr-c{animation:kr-blink 1.06s steps(1,end) infinite}' +
    '@keyframes kr-blink{50%{opacity:0}}' +
    '.route path.kr-ahead{stroke:var(--line);stroke-width:1.5;stroke-opacity:.3;vector-effect:none}' +
    ':root[data-theme="dark"] .route path.kr-ahead{stroke-opacity:.36}' +
    '.route path.kr-typed{stroke:var(--line);stroke-width:1.5;vector-effect:none}' +
    '.route path.kr-sel{stroke:var(--mist);stroke-width:' + SEL_W + 'px;stroke-linecap:butt;vector-effect:none}' +
    // dark mist (#1E2125) all but vanishes on #111315; an opaque steel wash reads like an inactive selection there
    // (opaque, so the overlapping chunk ends do not double up; browsers without color-mix keep the mist)
    ':root[data-theme="dark"] .route path.kr-sel{stroke:color-mix(in srgb,var(--steel) 20%,var(--bg))}';

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
  function poly(X, Y, i0, i1) {
    var s = 'M' + X[i0].toFixed(2) + ' ' + Y[i0].toFixed(2), px = X[i0], py = Y[i0];
    for (var i = i0 + 1; i <= i1; i++) {
      if (Math.abs(X[i] - px) < 0.005 && Math.abs(Y[i] - py) < 0.005) continue;   // corner duplicates
      px = X[i]; py = Y[i];
      s += 'L' + px.toFixed(2) + ' ' + py.toFixed(2);
    }
    return s;
  }
  // Polylines cut sharp corners (the route turns 90 degrees into the contact button). Each run of flagged samples
  // is replaced by the intersection of the straight lines on either side, so the drawn corner is exact.
  function fixCorners(X, Y, flags, n) {
    for (var i = 1; i < n; i++) {
      if (!flags[i]) continue;
      var r0 = i;
      while (i + 1 < n && flags[i + 1]) i++;
      var r1 = i;
      if (r0 < 2 || r1 + 2 > n) continue;
      var ax = X[r0 - 1] - X[r0 - 2], ay = Y[r0 - 1] - Y[r0 - 2];
      var bx = X[r1 + 2] - X[r1 + 1], by = Y[r1 + 2] - Y[r1 + 1];
      var den = ax * by - ay * bx;
      if (Math.abs(den) < 1e-9) continue;
      var t = ((X[r1 + 1] - X[r0 - 1]) * by - (Y[r1 + 1] - Y[r0 - 1]) * bx) / den;
      var cx = X[r0 - 1] + ax * t, cy = Y[r0 - 1] + ay * t;
      if (Math.abs(cx - X[r0]) > 14 || Math.abs(cy - Y[r0]) > 14) continue;
      for (var j = r0; j <= r1; j++) { X[j] = cx; Y[j] = cy; }
    }
  }

  window.Travellers.register('karetka', function (host, env) {
    var reduce = !!env.reduce;
    var hostSize = env.mobile ? 48 : 176, small = hostSize < 100;
    var CH, UP, DOWN;
    function dims() { CH = small ? 7 : 9; UP = small ? 15 : 21; DOWN = small ? 5 : 7; }
    dims();

    var svg = make('svg', { 'class': 'kr', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var caret = make('g', null, svg), cT = tf(caret), cR = tf(caret), cS = tf(caret);
    var bar = make('rect', { 'class': 'kr-c' }, caret);
    function shapeBar() {
      bar.setAttribute('x', -1); bar.setAttribute('y', -UP);
      bar.setAttribute('width', 2); bar.setAttribute('height', UP + DOWN);
    }
    shapeBar();
    host.appendChild(svg);

    // layer order: selection under everything, then the faint placeholder line, then the typed line on top
    var layer = env.layer;
    var selG = make('g', null, layer);
    var ahead = make('path', { 'class': 'kr-ahead' }, layer);
    var typedG = make('g', null, layer);

    // route samples (page px of <main>), rebuilt on relayout only
    var N = 0, total = 0, sl = STEP, cap = 0;
    var xs, ys, txs, tys, dX, dY, bX, bY, bcum, flags;
    var chunks = [];
    function alloc(m) {
      if (m <= cap) return;
      cap = m;
      xs = new Float32Array(m); ys = new Float32Array(m); txs = new Float32Array(m); tys = new Float32Array(m);
      dX = new Float32Array(m); dY = new Float32Array(m); bX = new Float32Array(m); bY = new Float32Array(m);
      bcum = new Float32Array(m); flags = new Uint8Array(m);
    }

    // interpolated point + unit tangent at a route length (written to these, no allocation)
    var ix = 0, iy = 0, itx = 0, ity = 1;
    function at(len) {
      var f = len / sl;
      if (!(f > 0)) f = 0;
      if (f > N) f = N;
      var i = f | 0;
      if (i >= N) i = N - 1;
      var u = f - i;
      ix = xs[i] + (xs[i + 1] - xs[i]) * u; iy = ys[i] + (ys[i + 1] - ys[i]) * u;
      var tx = txs[i] + (txs[i + 1] - txs[i]) * u, ty = tys[i] + (tys[i + 1] - tys[i]) * u;
      var l = Math.sqrt(tx * tx + ty * ty) || 1;
      itx = tx / l; ity = ty / l;
    }
    function selLen(len) {           // route length -> length along the (offset) selection polyline
      var f = len / sl;
      if (!(f > 0)) f = 0;
      if (f > N) f = N;
      var i = f | 0;
      if (i >= N) i = N - 1;
      return bcum[i] + (bcum[i + 1] - bcum[i]) * (f - i);
    }

    function relayout() {
      var p = env.routePath, d = p && p.getAttribute('d'), T = env.total ? +env.total() : 0;
      if (!d) return;
      if (!(T > 0)) T = p.getTotalLength();
      if (!(T > 4)) return;
      var n = Math.max(2, Math.ceil(T / STEP)), i;
      alloc(n + 1);
      total = T; sl = T / n;
      for (i = 0; i <= n; i++) { var pt = p.getPointAtLength(i * sl); xs[i] = pt.x; ys[i] = pt.y; }
      for (i = 0; i <= n; i++) {
        var a = i > 0 ? i - 1 : 0, b = i < n ? i + 1 : n, ddx = xs[b] - xs[a], ddy = ys[b] - ys[a];
        var l = Math.sqrt(ddx * ddx + ddy * ddy);
        if (l > 1e-6) { txs[i] = ddx / l; tys[i] = ddy / l; }
        else if (i) { txs[i] = txs[i - 1]; tys[i] = tys[i - 1]; }
        else { txs[i] = 0; tys[i] = 1; }
      }
      // corners: the turn between neighbouring 4 px chords is a fraction of a degree on the curves, ~45-90 at a corner
      flags[0] = 0; flags[n] = 0;
      for (i = 1; i < n; i++) {
        var ux = xs[i] - xs[i - 1], uy = ys[i] - ys[i - 1], vx = xs[i + 1] - xs[i], vy = ys[i + 1] - ys[i];
        var lu = Math.sqrt(ux * ux + uy * uy), lv = Math.sqrt(vx * vx + vy * vy);
        flags[i] = (lu > 1e-6 && lv > 1e-6 && (ux * vx + uy * vy) / (lu * lv) < 0.985) ? 1 : 0;
      }
      for (i = 0; i <= n; i++) {
        dX[i] = xs[i]; dY[i] = ys[i];
        // selection centre line: shifted toward the ascender side (left-hand normal of the writing direction)
        bX[i] = xs[i] + tys[i] * SEL_OFF; bY[i] = ys[i] - txs[i] * SEL_OFF;
      }
      fixCorners(dX, dY, flags, n);
      fixCorners(bX, bY, flags, n);
      bcum[0] = 0;
      for (i = 1; i <= n; i++) { var ex = bX[i] - bX[i - 1], ey = bY[i] - bY[i - 1]; bcum[i] = bcum[i - 1] + Math.sqrt(ex * ex + ey * ey); }
      N = n;

      ahead.setAttribute('d', d);
      var K = Math.ceil(n / CHUNK), k, c;
      while (chunks.length > K) {
        c = chunks.pop();
        if (c.t.parentNode) c.t.parentNode.removeChild(c.t);
        if (c.s.parentNode) c.s.parentNode.removeChild(c.s);
      }
      for (k = 0; k < K; k++) {
        c = chunks[k];
        if (!c) c = chunks[k] = { t: make('path', { 'class': 'kr-typed' }, typedG), s: make('path', { 'class': 'kr-sel' }, selG) };
        // The 1.5 px typed line abuts exactly at a shared sample: an overlap would double its anti-aliased edges
        // into a darker blip at every seam. The 28 px selection overlaps by one sample instead (it is opaque, so the
        // overlap is invisible, while an abutment would show a hairline across the band).
        var i0 = k * CHUNK, i1 = Math.min(n, i0 + CHUNK), j1 = Math.min(n, i1 + 1);
        c.l0 = i0 * sl; c.len = (i1 - i0) * sl; c.b0 = bcum[i0]; c.blen = bcum[j1] - bcum[i0];
        c.D = c.len + 4;
        c.t.setAttribute('d', poly(dX, dY, i0, i1));
        // a chunk is hidden (not painted), partly typed (dashed) or fully typed (a plain stroke, no dash at all)
        c.t.style.display = 'none'; c.t.style.strokeDasharray = ''; c.t.style.strokeDashoffset = '';
        c.mode = 0; c.shown = -1;
        c.s.setAttribute('d', poly(bX, bY, i0, j1));
        c.s.style.display = 'none'; c.selOn = false; c.sa = -1; c.sb = -1;
      }
      env.routePath.style.visibility = 'hidden';   // ahead + typed redraw it; the page clears this on switch
      wX = wY = wA = wK = wQ = NaN; wE = NaN; wSelQ = NaN;
      if (reduce) syncReduced();
      else if (lastLen === lastLen) { place(lastLen); var q0 = wQ; drawSel(q0, q0); }
    }

    function drawTyped(q) {
      for (var k = 0; k < chunks.length; k++) {
        var c = chunks[k], sh = q - c.l0, mode = sh <= 0.05 ? 0 : sh >= c.len ? 2 : 1, st = c.t.style;
        if (mode !== c.mode) {
          if (mode === 0) st.display = 'none';
          else if (c.mode === 0) st.display = '';
          if (mode === 1) st.strokeDasharray = c.D.toFixed(2) + ' ' + (c.len + 12).toFixed(2);
          else if (mode === 2) { st.strokeDasharray = ''; st.strokeDashoffset = ''; }
          c.mode = mode; c.shown = -1;
        }
        if (mode !== 1 || Math.abs(sh - c.shown) < 0.05) continue;
        c.shown = sh;
        st.strokeDashoffset = (c.D - sh).toFixed(2);
      }
    }
    function drawSel(a, b) {          // route lengths; a >= b means no selection
      var has = b - a > 0.5, A = has ? selLen(a) : 0, B = has ? selLen(b) : 0;
      for (var k = 0; k < chunks.length; k++) {
        var c = chunks[k], la = A - c.b0, lb = B - c.b0;
        if (la < 0) la = 0;
        if (lb > c.blen) lb = c.blen;
        if (!has || lb - la < 0.05) { if (c.selOn) { c.s.style.display = 'none'; c.selOn = false; } continue; }
        if (!c.selOn) { c.s.style.display = ''; c.selOn = true; }
        if (Math.abs(la - c.sa) < 0.05 && Math.abs(lb - c.sb) < 0.05) continue;
        c.sa = la; c.sb = lb;
        c.s.style.strokeDasharray = '0 ' + la.toFixed(2) + ' ' + (lb - la).toFixed(2) + ' ' + (c.blen * 2 + 60).toFixed(0);
      }
    }

    function caretAt(len) {
      var q = Math.round(len / CH) * CH, max = total - END_GAP;
      if (q > max) q = max;
      if (q < 0) q = 0;
      return q;
    }
    // Pin the caret to its character on the route (page space) while the host glides with the scroll.
    // The page shrinks the host over the last host-size px of route; the caret is counter-scaled to stay 28 px.
    var wX = NaN, wY = NaN, wA = NaN, wK = NaN, wQ = NaN;
    function place(len) {
      var q = caretAt(len);
      at(len);
      var hx = ix, hy = iy;
      at(q);
      var settle = (len - (total - hostSize)) / hostSize;
      settle = settle < 0 ? 0 : settle > 1 ? 1 : settle;
      var k = 1 / (1 - 0.74 * settle);
      var ox = (ix - hx) * k, oy = (iy - hy) * k, ang = Math.atan2(ity, itx) * DEG;
      if (!(Math.abs(ox - wX) < 0.15 && Math.abs(oy - wY) < 0.15)) { cT.setTranslate(ox, oy); wX = ox; wY = oy; }
      if (!(Math.abs(ang - wA) < 0.2)) { cR.setRotate(ang, 0, 0); wA = ang; }
      if (!(Math.abs(k - wK) < 0.002)) { cS.setScale(k, k); wK = k; }
      if (q !== wQ) { wQ = q; drawTyped(q); return true; }
      return false;
    }

    function project(x, y, len) {     // route length of the sample nearest to (x, y), within REACH of len
      var c = Math.round(len / sl), r = Math.ceil(REACH / sl);
      var lo = c - r < 0 ? 0 : c - r, hi = c + r > N ? N : c + r, best = 1e18, bi = c;
      for (var i = lo; i <= hi; i++) {
        var dx = xs[i] - x, dy = ys[i] - y, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bi = i; }
      }
      return bi * sl;
    }

    // reduced motion: frame() only runs on redraws, so follow the host's own position on scroll (no animation)
    var rq = 0;
    function syncReduced() {
      rq = 0;
      try {
        if (!N) return;
        var m = /translate3d\(\s*([-\d.e+]+)px\s*,\s*([-\d.e+]+)px/.exec(host.style.transform || '');
        if (!m) return;
        var h = hostSize / 2, x = parseFloat(m[1]) + h, y = parseFloat(m[2]) + h, best = 1e18, bi = 0, i;
        for (i = 0; i <= N; i++) { var dx = xs[i] - x, dy = ys[i] - y, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; bi = i; } }
        var len = bi * sl;
        // refine within the neighbouring chords
        for (i = bi - 1; i <= bi; i++) {
          if (i < 0 || i >= N) continue;
          var sx = xs[i + 1] - xs[i], sy = ys[i + 1] - ys[i], ss = sx * sx + sy * sy;
          if (ss < 1e-9) continue;
          var u = ((x - xs[i]) * sx + (y - ys[i]) * sy) / ss;
          if (u >= 0 && u <= 1) {
            var qx = xs[i] + sx * u - x, qy = ys[i] + sy * u - y;
            if (qx * qx + qy * qy <= best + 1e-6) { best = qx * qx + qy * qy; len = (i + u) * sl; }
          }
        }
        lastLen = len;
        place(len);
      } catch (e) {}
    }
    function onScroll() { if (!rq) rq = requestAnimationFrame(syncReduced); }
    if (reduce) window.addEventListener('scroll', onScroll, { passive: true });

    var lastLen = NaN, lastPx = null, lastPy = null, selOn = false, off = { x: 0, v: 0 }, projOff = 0;
    var wE = NaN, wSelQ = NaN, blinking = false, lastMove = 0, asleep = false, sized = false;
    function setBlink(on) {
      if (on === blinking) return;
      blinking = on;
      if (on) svg.classList.add('kr-blink'); else svg.classList.remove('kr-blink');
    }

    return {
      resize: function (cssSize) {
        try {
          hostSize = cssSize || hostSize;
          var h = hostSize / 2, ns = hostSize < 100;
          svg.setAttribute('viewBox', (-h) + ' ' + (-h) + ' ' + hostSize + ' ' + hostSize);
          if (ns !== small || !sized) { small = ns; dims(); shapeBar(); sized = true; }
          wX = wY = wA = wK = NaN; wQ = NaN; asleep = false;
          if (N) { if (reduce) syncReduced(); else if (lastLen === lastLen) place(lastLen); }
        } catch (e) {}
      },
      relayout: function () { try { relayout(); asleep = false; } catch (e) {} },
      frame: function (t, s) {
        try {
          if (!N) return;
          var len = +s.len || 0;
          if (reduce) { lastLen = len; place(len); return; }
          var px = small ? null : s.px, py = small ? null : s.py;
          if (px === undefined) px = null;
          if (py === undefined) py = null;
          var lenCh = len !== lastLen, ptrCh = px !== lastPx || py !== lastPy;
          if (asleep && !lenCh && !ptrCh) return;
          asleep = false;
          lastLen = len; lastPx = px; lastPy = py;
          if (!lastMove) lastMove = t;
          var dt = Math.min(s.dt || 16.7, 100) / 1000;

          var moved = place(len), q = wQ;

          // selection: from the caret to the route point under the pointer, a character at a time
          var hasP = px !== null && py !== null, d = hasP ? Math.sqrt(px * px + py * py) : 1e9;
          if (!selOn) { if (d < R_IN) selOn = true; }
          else if (d > R_OUT) selOn = false;
          var target = 0;
          if (selOn && hasP) {
            if (ptrCh || lenCh) { at(len); projOff = project(ix + px, iy + py, len) - q; }
            target = projOff;
          }
          step(off, target, W_SEL, dt);
          if (Math.abs(off.x - target) < 0.3 && Math.abs(off.v) < 0.5) { off.x = target; off.v = 0; }
          var e = q + Math.round(off.x / CH) * CH;
          if (e < 0) e = 0;
          if (e > total) e = total;
          if (e !== wE || q !== wSelQ) {
            if (e < q) drawSel(e, q); else drawSel(q, e);
            wE = e; wSelQ = q; moved = true;
          }

          if (moved) { lastMove = t; setBlink(false); }
          else if (!blinking && t - lastMove > IDLE_MS) setBlink(true);
          asleep = blinking && off.x === target && off.v === 0;
        } catch (err) {}
      },
      destroy: function () {
        try {
          if (reduce) window.removeEventListener('scroll', onScroll);
          if (rq) cancelAnimationFrame(rq);
          rq = 0;
        } catch (e) {}
      }
    };
  });
})(window, document);
