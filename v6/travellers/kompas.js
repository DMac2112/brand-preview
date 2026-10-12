/* Kompas — a small orienteering compass riding the route.
   Housing: an ink bezel on a page-coloured face (so the hairline route disappears under it and comes out at the
   front), a mist liquid capsule, and a sparse graduated ring: 15 deg steel ticks, the four intercardinals longer,
   the three cardinals longest, and at the fourth cardinal a small ink lubber notch cut into the inside of the
   bezel. The housing turns with the route (critically damped) so the lubber always sits where the route leaves.
   Needle: a faceted lozenge, north half ink, south half steel with a fine ink edge, on a jewel pivot. Its "north"
   is the route ahead, so at rest it lies on the lubber. The pointer is a second magnet: within ~240 px its field
   is added to the route's, the needle swings toward the mouse with a real underdamped (liquid-filled)
   oscillation and swings back when the mouse leaves. Scroll starts/stops jostle it a little.
   End of the route: the page shrinks the host to 0.26; the compass counter-scales (bezel stays >= 26 px desktop,
   22 px mobile), keeps its line weights, drops the fine graduations and broadens the needle so it still reads
   as a compass pointing at the button. Idle = early return; one transform per moving part. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';
  var DEG = 180 / Math.PI;

  // Geometry in compass units (scale 1 => bezel 54 units across). Up (-y) = north = route ahead.
  var R_BZ = 27, R_CAP = 19.6, R_T = 25.4;
  var NL = 17.6, NW = 2.6;
  var HUB = 2.2;
  var LUB = 'M-1.75 -27.2L1.75 -27.2L0 -22.4Z';          // lubber notch: base merged into the bezel, apex inward
  var N_ALL = 'M0 ' + (-NL) + 'L' + NW + ' 0L' + (-NW) + ' 0Z', N_FACET = 'M0 ' + (-NL) + 'L0 0L' + (-NW) + ' 0Z';
  var S_ALL = 'M0 ' + NL + 'L' + NW + ' 0L' + (-NW) + ' 0Z', S_FACET = 'M0 ' + NL + 'L0 0L' + (-NW) + ' 0Z';
  var LOOK = R_BZ + 3;     // heading = chord to where the route leaves the bezel

  var K_DESK = 1.3, K_MOB = 0.74;                         // bezel ~70 px desktop, ~40 px mobile
  var END_MIN_DESK = 26, END_MIN_MOB = 22, END_SHRINK = 0.74;   // page: host scale = 1 - .74 * settle

  var SSTEP = 4;           // route sampling step (px)
  var R_OUT = 240, R_IN = 52, M_MAX = 10;
  var W_H = 6, W_N = 9.5, Z_N = 0.32, JOLT = 70;

  var CSS =
    '.kp{overflow:visible;--kpw:1}' +
    '.kp .kp-face{fill:var(--bg);stroke:var(--ink);stroke-width:calc(1.15px * var(--kpw))}' +
    '.kp .kp-cap{fill:var(--mist)}' +
    '.kp .kp-fine{fill:none;stroke:var(--steel);stroke-width:calc(.7px * var(--kpw))}' +
    '.kp .kp-wind{fill:none;stroke:var(--steel);stroke-width:calc(.95px * var(--kpw))}' +
    '.kp .kp-card{fill:none;stroke:var(--steel);stroke-width:calc(1.15px * var(--kpw))}' +
    '.kp .kp-lub{fill:var(--ink)}' +
    '.kp .kp-n0{fill:var(--ink);fill-opacity:.8}.kp .kp-n1{fill:var(--ink)}' +
    '.kp .kp-s0{fill:var(--steel);fill-opacity:.88;stroke:var(--ink);stroke-opacity:.5;' +
      'stroke-width:calc(.42px * var(--kpw));stroke-linejoin:miter}' +
    '.kp .kp-s1{fill:var(--steel)}' +
    '.kp .kp-hub{fill:var(--bg);stroke:var(--ink);stroke-width:calc(1px * var(--kpw))}' +
    '.kp.kp-sm .kp-fine{display:none}' +
    '.kp.kp-end .kp-fine,.kp.kp-end .kp-wind{display:none}';

  function make(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function ticks(every, rIn, rOut, keep) {
    var d = '';
    for (var a = 0; a < 360; a += every) {
      if (!keep(a)) continue;
      var s = Math.sin(a / DEG), c = -Math.cos(a / DEG);
      d += 'M' + (s * rIn).toFixed(2) + ' ' + (c * rIn).toFixed(2) + 'L' + (s * rOut).toFixed(2) + ' ' + (c * rOut).toFixed(2);
    }
    return d;
  }
  // exact critically damped spring step: stable for any dt
  function crit(sp, target, w, dt) {
    var x0 = sp.x - target, k = sp.v + w * x0, e = Math.exp(-w * dt);
    sp.x = target + (x0 + k * dt) * e;
    sp.v = (sp.v - w * k * dt) * e;
  }
  // exact underdamped oscillator step (a liquid-damped compass needle): stable for any dt
  function osc(sp, target, w, z, dt) {
    var a = z * w, wd = w * Math.sqrt(1 - z * z), x0 = sp.x - target, v0 = sp.v;
    var e = Math.exp(-a * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    sp.x = target + e * (x0 * c + (v0 + a * x0) / wd * s);
    sp.v = e * (v0 * c - (w * w * x0 + a * v0) / wd * s);
  }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function wrap(d) { d = d % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return d; }

  window.Travellers.register('kompas', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, hostSize = small ? 48 : 176;
    var K = small ? K_MOB : K_DESK;

    // ---------- drawing (in the host) ----------
    var svg = make('svg', { 'class': 'kp', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    svg.setAttribute('viewBox', (-hostSize / 2) + ' ' + (-hostSize / 2) + ' ' + hostSize + ' ' + hostSize);
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var VS = 'non-scaling-stroke';
    var rootG = make('g', null, svg), rootS = tf(rootG);
    var housing = make('g', null, rootG), housingR = tf(housing);
    make('circle', { 'class': 'kp-face', r: R_BZ, 'vector-effect': VS }, housing);
    make('circle', { 'class': 'kp-cap', r: R_CAP }, housing);
    make('path', { 'class': 'kp-fine', 'vector-effect': VS,
      d: ticks(15, R_T - 1.7, R_T, function (a) { return a % 45 !== 0; }) }, housing);
    make('path', { 'class': 'kp-wind', 'vector-effect': VS,
      d: ticks(45, R_T - 3.1, R_T, function (a) { return a % 90 !== 0; }) }, housing);
    make('path', { 'class': 'kp-card', 'vector-effect': VS,
      d: ticks(90, R_T - 4.7, R_T, function (a) { return a !== 0; }) }, housing);
    make('path', { 'class': 'kp-lub', d: LUB }, housing);
    var needle = make('g', null, rootG), needleR = tf(needle), needleW = tf(needle);
    make('path', { 'class': 'kp-s0', d: S_ALL, 'vector-effect': VS }, needle);
    make('path', { 'class': 'kp-s1', d: S_FACET }, needle);
    make('path', { 'class': 'kp-n0', d: N_ALL }, needle);
    make('path', { 'class': 'kp-n1', d: N_FACET }, needle);
    make('circle', { 'class': 'kp-hub', r: HUB, 'vector-effect': VS }, rootG);
    host.appendChild(svg);

    // ---------- route samples ----------
    var N = 0, SX = null, SY = null, total = 0, sstep = SSTEP;
    var Q = { x: 0, y: 0 };
    function buildSamples() {
      total = env.total() || 0;
      if (!(total > 1)) { N = 0; return; }
      var n = Math.ceil(total / SSTEP) + 1, st = total / (n - 1), path = env.routePath;
      var sx = new Float64Array(n), sy = new Float64Array(n);
      for (var i = 0; i < n; i++) { var p = path.getPointAtLength(i * st); sx[i] = p.x; sy[i] = p.y; }
      SX = sx; SY = sy; sstep = st; N = n;
    }
    function sampleAt(u, out) {
      var f = u / sstep;
      if (!(f > 0)) f = 0; else if (f > N - 1) f = N - 1;
      var i = f | 0; if (i > N - 2) i = N - 2;
      var r = f - i;
      out.x = SX[i] + (SX[i + 1] - SX[i]) * r;
      out.y = SY[i] + (SY[i + 1] - SY[i]) * r;
    }

    // ---------- state ----------
    var hx = 0, hy = 1, head = 180;                 // unit heading along the route (screen, y down) and its angle
    var hs = { x: NaN, v: 0 }, nd = { x: NaN, v: 0 };
    var wH = NaN, wN = NaN, wEnd = NaN, kNow = K, nAbs = 180, pVel = 0;
    var dirty = true, sleeping = false, lastLen = NaN, lastPx = null, lastPy = null;

    function headingAt(len, s) {
      if (N >= 2) {
        var L = LOOK * kNow, a = len, b = len + L;
        if (b > total) { b = total; a = total - L > 0 ? total - L : 0; }
        sampleAt(a, Q); var x0 = Q.x, y0 = Q.y;
        sampleAt(b, Q);
        var dx = Q.x - x0, dy = Q.y - y0, l = Math.sqrt(dx * dx + dy * dy);
        if (l > 0.5) { hx = dx / l; hy = dy / l; }
      } else if (s && (s.tx || s.ty)) {
        var m = Math.sqrt(s.tx * s.tx + s.ty * s.ty);
        if (m > 1e-6) { hx = s.tx / m; hy = s.ty / m; }
      }
      head = Math.atan2(hx, -hy) * DEG;
    }
    function render(eps) {
      if (hs.x !== hs.x || nd.x !== nd.x) return;
      if (!(Math.abs(hs.x - wH) <= eps)) { housingR.setRotate(hs.x, 0, 0); wH = hs.x; }
      if (!(Math.abs(nd.x - wN) <= eps)) { needleR.setRotate(nd.x, 0, 0); wN = nd.x; }
    }
    // End of the route: mirror the page's host shrink and counter it so the compass stays legible.
    function endState(len, tot) {
      var st = 0;
      if (tot > 1) { st = (len - (tot - hostSize)) / hostSize; st = st < 0 ? 0 : st > 1 ? 1 : st; }
      st = Math.round(st * 50) / 50;
      if (st === wEnd) return;
      wEnd = st;
      var hsc = 1 - END_SHRINK * st, minV = small ? END_MIN_MOB : END_MIN_DESK;
      var grow = minV / (K * (1 - END_SHRINK) * 2 * R_BZ) - 1; if (grow < 0) grow = 0;
      kNow = K * (1 + grow * st);
      rootS.setScale(kNow, kNow);
      svg.style.setProperty('--kpw', (1 / hsc).toFixed(3));
      if (2 * R_BZ * kNow * hsc < 46) svg.classList.add('kp-end'); else svg.classList.remove('kp-end');
      needleW.setScale(1 + 0.45 * smooth(0.35, 1, st), 1);
    }
    function applyScale() {
      K = small ? K_MOB : K_DESK;
      if (small) svg.classList.add('kp-sm'); else svg.classList.remove('kp-sm');
      wH = wN = wEnd = NaN;
      endState(lastLen === lastLen ? lastLen : 0, total);
    }
    function poseStatic(len, s) {
      endState(len, (s && s.total) || total);
      headingAt(len, s);
      hs.x = head; hs.v = 0; nd.x = head; nd.v = 0; nAbs = head;
      render(0.05);
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
        poseStatic(best * sstep, null);
      } catch (e) {}
    }
    if (reduce) {
      onScroll = function () { if (!rafId) rafId = window.requestAnimationFrame(syncFromHost); };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ---------- relayout ----------
    var relayoutTimer = 0;
    function rebuild() {
      relayoutTimer = 0;
      try { buildSamples(); } catch (e) { N = 0; }
      dirty = true; sleeping = false; wEnd = NaN;
      if (reduce) syncFromHost();
    }

    applyScale();
    poseStatic(0, null);
    if (!reduce) { hs.x = NaN; nd.x = NaN; }   // the first real frame sets them (and starts the needle's settling swing)

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2;
          hostSize = size; small = size < 100;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          applyScale(); dirty = true; sleeping = false;
          render(0);
        } catch (e) {}
      },
      relayout: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (N < 2) rebuild(); else relayoutTimer = setTimeout(rebuild, 120);
      },
      frame: function (t, s) {
        try {
          var len = s.len || 0;
          if (reduce) { poseStatic(len, s); lastLen = len; dirty = false; return; }
          var px = small || s.px == null ? null : s.px, py = small || s.py == null ? null : s.py;
          var vel = s.vel || 0, dv = vel - pVel;
          var moved = dirty || !(Math.abs(len - lastLen) <= 0.02);
          if (sleeping && !moved && px === lastPx && py === lastPy && Math.abs(dv) < 0.002) return;
          lastPx = px; lastPy = py; pVel = vel;
          if (moved) {
            endState(len, s.total || total);
            headingAt(len, s); lastLen = len; dirty = false;
            if (hs.x !== hs.x) { hs.x = head; hs.v = 0; }
            if (nd.x !== nd.x) { nd.x = head + 64; nd.v = 0; }   // first sight: the needle finds its bearing
          }
          var dt = Math.min(s.dt || 16.7, 100) / 1000;

          // housing follows the route
          var hT = hs.x + wrap(head - hs.x);
          crit(hs, hT, W_H, dt);

          // needle: route field (unit, ahead) + pointer field (stronger as it nears)
          var fx = hx, fy = hy, keep = false;
          if (px !== null && py !== null) {
            var d = Math.sqrt(px * px + py * py);
            if (d <= 6) keep = true;
            else if (d < R_OUT) { var m = M_MAX * smooth(R_OUT, R_IN, d); fx += m * px / d; fy += m * py / d; }
          }
          if (!keep && fx * fx + fy * fy > 0.04) nAbs = Math.atan2(fx, -fy) * DEG;
          var nT = nd.x + wrap(nAbs - nd.x);
          if (dv > 0.15) dv = 0.15; else if (dv < -0.15) dv = -0.15;
          nd.v += dv * JOLT;
          osc(nd, nT, W_N, Z_N, dt);

          if (!moved && Math.abs(hs.x - hT) < 0.03 && Math.abs(hs.v) < 0.05 &&
              Math.abs(nd.x - nT) < 0.03 && Math.abs(nd.v) < 0.08) {
            // settled: land exactly, fold angles back into one turn, stop working until something changes
            hs.x = wrap(hT); hs.v = 0; nd.x = wrap(nT); nd.v = 0;
            wH = wN = NaN; render(0); sleeping = true;
          } else { sleeping = false; render(0.2); }
        } catch (e) {}
      },
      destroy: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (rafId) window.cancelAnimationFrame(rafId);
        if (onScroll) window.removeEventListener('scroll', onScroll);
        relayoutTimer = rafId = 0; onScroll = null; SX = SY = null; N = 0;
      }
    };
  });
})(window, document);
