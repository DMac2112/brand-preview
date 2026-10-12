/* Igła i nitka — a sewing needle that sews the page's route.
   The steel hairline is the chalk line; behind the needle it becomes a running stitch in ink thread
   (short dashes, gaps showing the chalk line), added one whole stitch at a time as you scroll.
   The needle lies at a slant to the seam, tip on the route. Thread runs from its eye down into the
   last stitch; a short cut tail hangs out of the other side of the eye.
   Per stitch the needle dips: it slides along its own axis into the fabric (clipped at the entry point,
   a small dimple marks the hole), then comes back up. Fast scroll does not strobe: the rocking is capped
   at 6 per second and re-locks to the real stitch position when the scroll settles.
   Mouse within ~240 px: the needle lifts off the fabric (its shadow detaches) and pivots on its tip to
   point at the pointer. It settles back into the seam when the pointer leaves.
   SVG only. Transforms go through SVGTransform objects and the thread through live SVGPoint lists,
   so a moving frame allocates nothing. Idle (no scroll, no pointer change, springs settled) = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg', DEG = 180 / Math.PI;

  var R_IN = 240, R_FULL = 125;              // pointer: starts to matter at 240 px, full attention at 125 px
  var W_TH = 11, W_LIFT = 10, W_SWAY = 9;    // critically damped spring speeds (rad/s)
  var MAX_HZ = 6;                            // the needle rocks at most 6 times a second
  var LX = 0.42, LY = 0.91;                  // light from the upper left: shadows fall down, a little right
  var CHUNK = 16;                            // stitches per layer <path>; only the active chunk is rewritten
  var S0 = 3;                                // first stitch starts this far past the knot
  var K_THREAD = 20, K_TAIL = 9;             // polyline samples

  var CSS =
    '.ig{overflow:visible}' +
    '.ig .ig-n{stroke:rgba(23,25,28,.42);stroke-width:.4;stroke-linejoin:round;fill-rule:evenodd}' +
    '.ig .ig-sh{fill:rgba(23,25,28,.13);fill-rule:evenodd}' +
    '.ig .ig-sh2{fill:none;stroke:rgba(23,25,28,.055);stroke-width:2.2;stroke-linejoin:round}' +
    '.ig .ig-th{fill:none;stroke:var(--ink);stroke-linecap:round;stroke-linejoin:round}' +
    '.ig .ig-tl{fill:none;stroke:var(--ink);stroke-linecap:butt;stroke-linejoin:round}' +
    '.ig .ig-gl{fill:none;stroke:#fff;stroke-linecap:round;opacity:.92}' +
    '.ig .ig-dim{fill:var(--ink)}' +
    '.ig .ig-s0{stop-color:#99A0A7}.ig .ig-s1{stop-color:#FCFDFD}.ig .ig-s2{stop-color:#C5CACF}' +
    '.ig .ig-s3{stop-color:#7E858C}.ig .ig-s4{stop-color:#4C535A}' +
    ':root[data-theme="dark"] .ig .ig-n{stroke:rgba(0,0,0,.6)}' +
    ':root[data-theme="dark"] .ig .ig-sh{fill:rgba(0,0,0,.5)}' +
    ':root[data-theme="dark"] .ig .ig-sh2{stroke:rgba(0,0,0,.22)}' +
    ':root[data-theme="dark"] .ig .ig-s0{stop-color:#8C939A}:root[data-theme="dark"] .ig .ig-s1{stop-color:#F3F5F7}' +
    ':root[data-theme="dark"] .ig .ig-s2{stop-color:#AAB0B6}:root[data-theme="dark"] .ig .ig-s3{stop-color:#646B72}' +
    ':root[data-theme="dark"] .ig .ig-s4{stop-color:#3C4248}' +
    '.route path.ig-st{fill:none;stroke:var(--ink);stroke-linecap:round}' +
    '.route circle.ig-knot{fill:var(--ink)}';

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
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function f1(x) { return (Math.round(x * 10) / 10).toString(); }

  // u = position inside one stitch period (0..1). 0..D/P the tip is over the dash, D/P..1 it is under the gap.
  function dipShape(u, dp) {
    var down = sstep(dp - 0.07, dp + 0.07, u);
    if (u < 0.5) return Math.max(down, 1 - sstep(-0.07, 0.07, u));
    return down * (1 - sstep(0.93, 1.07, u));
  }

  function config(small) {
    return small ? {
      L: 30, hw: 1.2, sw: 0.95, head: 6.4, neck: 8.2, taper: 10, qx: 3.8, qy: 0.55, ea: 1.8, eb: 5.4, eh: 0.42,
      alpha: 30, rest: -0.3, push: 5, back: 2.4, h0: 2.4, hl: 3, thW: 1, kA: 8, bulge: 1,
      tail: [0.3, -3.4, -2, -6.2, -5.4, -8.4], sway: 2,
      P: 12, D: 5.4, stW: 1.5, knot: 1.7, gl: 3.4, glA: -20, glB: -12, glW: 0.45, dimR: 0.6
    } : {
      L: 60, hw: 1.75, sw: 1.42, head: 11.4, neck: 14.5, taper: 21, qx: 7.5, qy: 0.85, ea: 3.4, eb: 10.6, eh: 0.6,
      alpha: 32, rest: -0.4, push: 9, back: 4, h0: 4.5, hl: 5, thW: 1.25, kA: 14, bulge: 1.5,
      tail: [0.6, -5.6, -3.6, -10.2, -9.5, -13.6], sway: 4,
      P: 14, D: 6.4, stW: 1.7, knot: 2.1, gl: 7, glA: -42, glB: -26, glW: 0.6, dimR: 0.9
    };
  }

  // needle outline, tip at (0,0) pointing +x, eye slot cut out (even-odd)
  function needlePath(C) {
    var x0 = -C.L, r = C.hw, hx = x0 + C.head, nx = x0 + C.neck, mx = (hx + nx) / 2, tx = -C.taper;
    var ea = x0 + C.ea, eb = x0 + C.eb, e = C.eh;
    return 'M' + f1(x0 + r) + ' ' + (-r) +
      'L' + f1(hx) + ' ' + (-r) +
      'C' + f1(mx) + ' ' + (-r) + ' ' + f1(mx) + ' ' + (-C.sw) + ' ' + f1(nx) + ' ' + (-C.sw) +
      'L' + f1(tx) + ' ' + (-C.sw) +
      'Q' + f1(-C.qx) + ' ' + (-C.qy) + ' 0 0' +
      'Q' + f1(-C.qx) + ' ' + C.qy + ' ' + f1(tx) + ' ' + C.sw +
      'L' + f1(nx) + ' ' + C.sw +
      'C' + f1(mx) + ' ' + C.sw + ' ' + f1(mx) + ' ' + r + ' ' + f1(hx) + ' ' + r +
      'L' + f1(x0 + r) + ' ' + r +
      'A' + r + ' ' + r + ' 0 0 1 ' + f1(x0 + r) + ' ' + (-r) + 'Z' +
      'M' + f1(ea + e) + ' ' + (-e) +
      'L' + f1(eb - e) + ' ' + (-e) +
      'A' + e + ' ' + e + ' 0 0 1 ' + f1(eb - e) + ' ' + e +
      'L' + f1(ea + e) + ' ' + e +
      'A' + e + ' ' + e + ' 0 0 1 ' + f1(ea + e) + ' ' + (-e) + 'Z';
  }

  window.Travellers.register('igla', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small);
    var uid = 'ig' + Math.floor(Math.random() * 1e9).toString(36);
    var i;

    // ---------- host SVG: the needle ----------
    var svg = make('svg', { 'class': 'ig', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var defs = make('defs', null, svg);
    var grad = make('linearGradient', { id: uid + 'g', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0 }, defs);
    var STOPS = [0, 0.2, 0.42, 0.72, 1];
    for (i = 0; i < STOPS.length; i++) make('stop', { 'class': 'ig-s' + i, offset: STOPS[i] }, grad);
    var clip = make('clipPath', { id: uid + 'c', clipPathUnits: 'userSpaceOnUse' }, defs);
    var clipRect = make('rect', { x: -300, y: -300, width: 300, height: 600 }, clip);

    var rot = make('g', null, svg), rotT = tf(rot);
    var thread = make('polyline', { 'class': 'ig-th' }, rot);
    var clipped = make('g', { 'clip-path': 'url(#' + uid + 'c)' }, rot);
    var slideG = make('g', null, clipped), slideT = tf(slideG);
    var tail = make('polyline', { 'class': 'ig-tl' }, slideG);
    var shG = make('g', null, slideG), shT = tf(shG);
    var sh2 = make('path', { 'class': 'ig-sh2' }, shG);
    var sh1 = make('path', { 'class': 'ig-sh' }, shG);
    var needle = make('path', { 'class': 'ig-n', fill: 'url(#' + uid + 'g)' }, slideG);
    var glG = make('g', null, slideG), glT = tf(glG);
    var glint = make('path', { 'class': 'ig-gl' }, glG);
    var dimple = make('ellipse', { 'class': 'ig-dim', cx: 0, cy: 0 }, rot);
    host.appendChild(svg);
    var shM = svg.createSVGMatrix();

    // live point lists: writing .x/.y updates the shape without building strings
    function pointList(poly, k) {
      var s = [];
      for (var j = 0; j < k; j++) s.push('0,0');
      poly.setAttribute('points', s.join(' '));
      var out = { poly: poly, items: [], live: false, buf: null };
      try {
        var list = poly.points;
        for (j = 0; j < k; j++) out.items.push(list.getItem(j));
        out.items[0].x = 1.5;
        out.live = (poly.getAttribute('points') || '').indexOf('1.5') === 0;
      } catch (e) { out.live = false; }
      if (!out.live) { out.buf = []; for (j = 0; j < k * 2; j++) out.buf.push(0); }
      return out;
    }
    var thPts = pointList(thread, K_THREAD), tlPts = pointList(tail, K_TAIL);
    function setPt(pl, j, x, y) {
      if (pl.live) { var p = pl.items[j]; p.x = x; p.y = y; } else { pl.buf[j * 2] = x; pl.buf[j * 2 + 1] = y; }
    }
    function flush(pl) {
      if (pl.live) return;
      var s = '';
      for (var j = 0; j < pl.buf.length; j += 2) s += (j ? ' ' : '') + f1(pl.buf[j]) + ',' + f1(pl.buf[j + 1]);
      pl.poly.setAttribute('points', s);
    }
    function cubic(pl, k, ax, ay, bx, by, cx, cy, dx, dy) {
      for (var j = 0; j < k; j++) {
        var t = j / (k - 1), m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
        setPt(pl, j, a * ax + b * bx + c * cx + d * dx, a * ay + b * by + c * cy + d * dy);
      }
      flush(pl);
    }

    // ---------- route layer: stitches + knot ----------
    var stG = make('g', null, env.layer);
    var knot = make('circle', { 'class': 'ig-knot', r: C.knot, cx: -99, cy: -99 }, env.layer);

    // route table (sampled once per relayout), read by interpolation with no DOM calls
    var TX = null, TY = null, tn = 0, tstep = 1, ttotal = 0, qx = 0, qy = 0, gx = 0, gy = 1;
    function buildTable() {
      var total = env.total();
      if (!(total > 0)) return false;
      tn = Math.max(2, Math.ceil(total / 5)); tstep = total / tn; ttotal = total;
      TX = new Float32Array(tn + 1); TY = new Float32Array(tn + 1);
      for (var j = 0; j <= tn; j++) { var p = env.pointAt(j * tstep); TX[j] = p.x; TY[j] = p.y; }
      return true;
    }
    function posAt(l) {
      var f = l / tstep;
      if (f <= 0) { qx = TX[0]; qy = TY[0]; return; }
      if (f >= tn) { qx = TX[tn]; qy = TY[tn]; return; }
      var j = f | 0, r = f - j;
      qx = TX[j] + (TX[j + 1] - TX[j]) * r; qy = TY[j] + (TY[j + 1] - TY[j]) * r;
    }
    function tanAt(l) {
      var a = clamp(l - 3, 0, ttotal - 6), x1, y1;
      posAt(a); x1 = qx; y1 = qy; posAt(a + 6);
      var dx = qx - x1, dy = qy - y1, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-4) { gx = dx / d; gy = dy / d; }
    }

    var segs = [], EX = null, EY = null, EL = null, N = 0, chunks = [], chunkN = [], shownN = -1;
    function buildStitches() {
      for (var c = 0; c < chunks.length; c++) if (chunks[c].parentNode) chunks[c].parentNode.removeChild(chunks[c]);
      chunks = []; chunkN = []; segs = []; shownN = -1;
      N = Math.max(0, Math.floor((ttotal - S0 - C.D) / C.P) + 1);
      EX = new Float32Array(N); EY = new Float32Array(N); EL = new Float32Array(N);
      for (var j = 0; j < N; j++) {
        var a = S0 + j * C.P, b = a + C.D, x1, y1;
        posAt(a); x1 = qx; y1 = qy; posAt(b);
        segs.push('M' + f1(x1) + ' ' + f1(y1) + 'L' + f1(qx) + ' ' + f1(qy));
        EX[j] = qx; EY[j] = qy; EL[j] = b;
      }
      var nc = Math.ceil(N / CHUNK);
      for (c = 0; c < nc; c++) {
        var p = make('path', { 'class': 'ig-st' }, stG);
        p.style.strokeWidth = C.stW + 'px';
        chunks.push(p); chunkN.push(0);
      }
      posAt(0); knot.setAttribute('cx', f1(qx)); knot.setAttribute('cy', f1(qy)); knot.setAttribute('r', C.knot);
    }
    function countAt(l) { return clamp(Math.floor((l - S0 - C.D) / C.P) + 1, 0, N); }
    function showStitches(n) {
      n = clamp(n, 0, N);
      if (n === shownN) return;
      var lo = shownN < 0 ? 0 : Math.min(n, shownN), hi = shownN < 0 ? N : Math.max(n, shownN);
      var c0 = Math.floor(lo / CHUNK), c1 = Math.min(chunks.length - 1, Math.floor(Math.max(0, hi - 1) / CHUNK));
      for (var c = c0; c <= c1; c++) {
        var want = clamp(n - c * CHUNK, 0, Math.min(CHUNK, N - c * CHUNK));
        if (want !== chunkN[c]) {
          if (want) chunks[c].setAttribute('d', segs.slice(c * CHUNK, c * CHUNK + want).join(''));
          else chunks[c].removeAttribute('d');
          chunkN[c] = want;
        }
      }
      shownN = n;
    }

    // ---------- needle geometry ----------
    var eyeX = 0;
    function buildNeedle() {
      var d = needlePath(C);
      needle.setAttribute('d', d); sh1.setAttribute('d', d); sh2.setAttribute('d', d);
      grad.setAttribute('y1', -C.sw); grad.setAttribute('y2', C.sw);
      eyeX = -C.L + (C.ea + C.eb) / 2;
      thread.setAttribute('stroke-width', C.thW); tail.setAttribute('stroke-width', C.thW);
      var gy0 = f1(-C.sw * 0.42);
      glint.setAttribute('d', 'M' + f1(-C.gl / 2) + ' ' + gy0 + 'H' + f1(C.gl / 2));
      glint.setAttribute('stroke-width', C.glW);
      dimple.setAttribute('rx', C.dimR); dimple.setAttribute('ry', f1(C.sw + C.dimR * 1.1));
      knot.setAttribute('r', C.knot);
    }

    // ---------- state ----------
    var th = { x: 0, v: 0 }, lift = { x: 0, v: 0 }, sway = { x: 0, v: 0 };
    var psi = 0, depth = 0, slide = C.rest, hostSize = small ? 48 : 176;
    var ancX = 0, ancY = 0, ancTx = 0, ancTy = 1;      // thread anchor + seam direction, host-local
    var ready = false, sleeping = false, started = false, lastLen = 0, lastPx = null, lastPy = null, rtimer = 0;
    var wTh = NaN, wSlide = NaN, wClip = NaN, wDim = NaN, wGl = NaN, wSa = NaN, wSb = NaN, wSe = NaN, wSf = NaN;
    var wTA = NaN, wTB = NaN, wTC = NaN, wTD = NaN, wTail = NaN;

    function render(force) {
      var thd = th.x * DEG;
      if (force || Math.abs(thd - wTh) > 0.2) { rotT.setRotate(thd, 0, 0); wTh = thd; }
      if (force || Math.abs(slide - wSlide) > 0.1) { slideT.setTranslate(slide, 0); wSlide = slide; }
      var cw = depth > 0.002 ? 300 : 340;
      if (cw !== wClip) { clipRect.setAttribute('width', cw); wClip = cw; }

      // shadow: tip height ht, eye-end height he -> a sheared copy of the needle (touches at the tip when it is in the fabric)
      var lifted = depth < 0 ? -depth : 0;
      var ht = lifted * C.hl, he = C.h0 * (1 + (depth > 0 ? depth * 0.35 : 0)) + lifted * C.hl;
      var c = Math.cos(th.x), s = Math.sin(th.x);
      var lx = LX * c + LY * s, ly = -LX * s + LY * c, dh = (he - ht) / C.L;
      var sa = 1 - lx * dh, sb = -ly * dh, se = lx * ht, sf = ly * ht;
      if (force || Math.abs(sa - wSa) > 0.004 || Math.abs(sb - wSb) > 0.004 || Math.abs(se - wSe) > 0.1 || Math.abs(sf - wSf) > 0.1) {
        shM.a = sa; shM.b = sb; shM.c = 0; shM.d = 1; shM.e = se; shM.f = sf; shT.setMatrix(shM);
        wSa = sa; wSb = sb; wSe = se; wSf = sf;
      }

      var dop = clamp(depth * 2.4, 0, 1) * 0.55;
      if (force || Math.abs(dop - wDim) > 0.02) { dimple.style.opacity = dop.toFixed(2); wDim = dop; }

      // glint slides along the shaft as the needle turns under the light
      var gpos = (C.glA + C.glB) / 2 + Math.sin(2 * th.x + 0.7) * (C.glB - C.glA) / 2;
      if (force || Math.abs(gpos - wGl) > 0.2) { glT.setTranslate(gpos, 0); wGl = gpos; }

      // thread: eye -> anchor in the seam, worked out in the needle's frame
      var ar = ancX * c + ancY * s, ay = -ancX * s + ancY * c;
      if (force || Math.abs(ar - wTA) > 0.15 || Math.abs(ay - wTB) > 0.15 || Math.abs(slide - wTC) > 0.15 || Math.abs(thd - wTD) > 0.2) {
        var tr = ancTx * c + ancTy * s, ty = -ancTx * s + ancTy * c;
        var ex = eyeX + slide, cx = ar - ex, cy = ay, D = Math.sqrt(cx * cx + cy * cy) || 1;
        var side = clamp(ay / 4, -1, 1), bs = (0.17 * D + C.bulge) * side;
        var behind = clamp((cx * tr + cy * ty) / D, 0, 1), kA = Math.min(C.kA, D * 0.35) * behind, fr = 1 - behind;
        cubic(thPts, K_THREAD,
          ex, 0,
          ex + cx * 0.28, cy * 0.28 + bs,
          ar - cx * 0.28 * fr - tr * kA, ay - cy * 0.28 * fr - ty * kA + bs * 0.4 * fr,
          ar, ay);
        wTA = ar; wTB = ay; wTC = slide; wTD = thd;
      }
      var sw = sway.x;
      if (force || Math.abs(sw - wTail) > 0.15) {
        var T = C.tail;
        cubic(tlPts, K_TAIL, eyeX, 0, eyeX + T[0], T[1], eyeX + T[2], T[3] + sw * 0.4, eyeX + T[4] - sw * 0.3, T[5] + sw);
        wTail = sw;
      }
    }

    function slideFor(dp) { return dp >= 0 ? C.rest + dp * C.push : C.rest + dp * C.back; }

    function renderStatic() {
      // reduced motion: whole seam sewn, needle resting at a fixed slant, thread into the seam just behind the tip
      th.x = (90 + C.alpha) / DEG; th.v = 0; depth = 0; slide = slideFor(0); sway.x = 0;
      ancX = 0; ancY = -C.P * 0.55; ancTx = 0; ancTy = 1;
      render(true);
    }

    function anchorFor(len, hx, hy, sc) {
      var n = countAt(len), ax, ay, al;
      if (n > 0) { ax = EX[n - 1]; ay = EY[n - 1]; al = EL[n - 1]; } else { posAt(0); ax = qx; ay = qy; al = 0; }
      tanAt(al);
      ancX = (ax - hx) / sc; ancY = (ay - hy) / sc; ancTx = gx; ancTy = gy;
      return n;
    }

    function rebuild() {
      try {
        if (!buildTable()) return;
        buildStitches();
        ready = true; sleeping = false;
        if (reduce) { showStitches(N); renderStatic(); }
        else if (started) showStitches(countAt(lastLen));
        else showStitches(0);
      } catch (e) {}
    }

    function reset() {
      th.v = 0; lift.x = lift.v = 0; sway.x = sway.v = 0; sleeping = false;
      wTh = wSlide = wClip = wDim = wGl = wSa = wSb = wSe = wSf = wTA = wTB = wTC = wTD = wTail = NaN;
    }

    buildNeedle();
    rebuild();
    if (!reduce) { th.x = (90 + C.alpha) / DEG; render(true); }

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2, nextSmall = size < 100;
          hostSize = size;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if (nextSmall !== small) {
            small = nextSmall; C = config(small); buildNeedle(); reset();
            if (ready) rebuild();
            if (reduce) renderStatic(); else render(true);
          }
        } catch (e) {}
      },
      relayout: function () {
        try {
          if (!ready) { rebuild(); return; }
          clearTimeout(rtimer);
          rtimer = setTimeout(rebuild, 90);
        } catch (e) {}
      },
      frame: function (t, s) {
        if (reduce || !ready) return;
        try {
          var len = s.len || 0;
          var px = small ? null : s.px, py = small ? null : s.py;
          if (px === undefined) px = null;
          if (py === undefined) py = null;
          if (sleeping && started && len === lastLen && px === lastPx && py === lastPy) return;
          if (!started) { started = true; psi = (len - S0) / C.P; th.x = NaN; }
          lastLen = len; lastPx = px; lastPy = py;
          var dt = clamp(s.dt || 16.7, 1, 100) / 1000;

          // where the host sits and which way the seam runs (always forward along the route)
          posAt(len); var hx = qx, hy = qy;
          tanAt(len);
          var thRoute = Math.atan2(gy, gx) + C.alpha / DEG;
          if (th.x !== th.x) th.x = thRoute;

          // pointer: lift off the fabric and point the tip at it
          var w = 0, thTarget = thRoute;
          if (px !== null && py !== null) {
            var d = Math.sqrt(px * px + py * py);
            if (d < R_IN && d > 1) { w = sstep(R_IN, R_FULL, d); thTarget = thRoute + w * wrap(Math.atan2(py, px) - thRoute); }
          }
          thTarget = th.x + wrap(thTarget - th.x);
          var thBefore = th.x;
          step(th, thTarget, W_TH, dt);
          step(lift, w, W_LIFT, dt);
          step(sway, clamp((th.x - thBefore) / dt * 0.25, -1, 1) * C.sway, W_SWAY, dt);

          // rocking: follows the stitch phase, never faster than MAX_HZ (whole cycles skipped are invisible)
          var psiT = (len - S0) / C.P, diff = psiT - psi;
          if (diff > 1 || diff < -1) { psi += diff > 0 ? Math.floor(diff) : Math.ceil(diff); diff = psiT - psi; }
          var mx = MAX_HZ * dt;
          psi += clamp(diff, -mx, mx);
          var u = psi - Math.floor(psi);
          var lf = clamp(lift.x, 0, 1);
          depth = dipShape(u, C.D / C.P) * (1 - lf) - lf;
          slide = slideFor(depth);

          // stitches behind the tip, thread anchor at the end of the last whole stitch
          var settle = clamp((len - (ttotal - hostSize)) / hostSize, 0, 1), sc = 1 - 0.74 * settle;
          var n = anchorFor(len, hx, hy, sc);
          showStitches(n);

          if (Math.abs(th.x - thTarget) < 1e-3 && Math.abs(th.v) < 1e-3 && Math.abs(lift.x - w) < 1e-3 && Math.abs(lift.v) < 1e-3 &&
              Math.abs(sway.x) < 0.02 && Math.abs(sway.v) < 0.05 && Math.abs(psiT - psi) < 1e-4) {
            th.x = thTarget; th.v = 0; lift.x = w; lift.v = 0; sway.x = 0; sway.v = 0; psi = psiT;
            lf = clamp(w, 0, 1); u = psi - Math.floor(psi);
            depth = dipShape(u, C.D / C.P) * (1 - lf) - lf; slide = slideFor(depth);
            render(false); sleeping = true;
          } else { sleeping = false; render(false); }
        } catch (e) {}
      },
      destroy: function () { clearTimeout(rtimer); }
    };
  });
})(window, document);
