/* Miarka — a steel tape measure riding the route.
   The hook is fixed 3 cm before the start of the route (so the first frame already shows a ruled blade with its
   L-hook); the case is pulled along with the scroll, so everything BEHIND it is paid-out blade: a narrow steel band
   (steel edges, mist face) with mm / half-cm / cm / decimetre ticks and, on desktop, a small upright numeral every
   10 cm. The readout above the case gives the true paid-out length from the hook in CSS centimetres
   (CSS: 1 cm = 37.795 px), so "212 cm" really is 212 cm of blade on a calibrated screen.
   Case = classic side view in solid ink (light shell in dark mode): big radius at the back where the coil lives,
   a round window showing the wound coil (it gets thinner as tape pays out) around a boss whose notch turns once per
   10 cm, the tape leaving the coil toward the mouth, and a flat lock slider flush in the top edge. The lock is on
   while the blade rests and slides off while it runs or when the pointer comes within ~120 px.
   It stands on the blade on the side that keeps it upright (or toward the page centre on vertical runs).
   Pointer within ~240 px: the case swivels on its mouth toward it. Scroll speed leans it back.
   End of the route: the page shrinks the host to 0.26; the case is counter-scaled (never below 0.82), docks
   12 px short of the route end (the CTA) and the readout stays 11 px on screen.
   Ticks/numerals are static geometry built per relayout in ~160 px chunks (display toggled); only the chunk under
   the mouth is cut by a half-plane clip moved with SVGTransforms. Idle = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';
  var DEG = 180 / Math.PI;
  var CM = 96 / 2.54, MM = CM / 10, TURN = 10 * CM, LEAD = 3 * CM;
  var CHUNK = 160, SSTEP = 2;
  var R_OUT = 240, R_IN = 40, R_LOCK = 120, R_LOCK_OFF = 138;
  var GAIN = 34, BACK = 0.62, W_TILT = 7, W_FLIP = 9, W_LOCK = 24;
  var END_GAP = 12;
  var AHEAD = 1, BEHIND = 2, NEAR = 3;
  // case, in its own units: the blade leaves the mouth at (0,0) toward +x (back along the route); the case stands on -y.
  var CW = 36, CH = 34, FRONT = -2.6;
  var WR = 11.2, HUB = 2.8, COIL_IN = 4.3, PITCH = 1.7, RC_MAX = 9.9, RC_MIN = 5.4, TAPE = 0.85;
  var LOCK_RUN = 5.4;

  var CSS =
    '.mk{overflow:visible}' +
    '.mk .mk-shell,.mk .mk-notch{fill:var(--ink);stroke:none}' +
    '.mk .mk-win,.mk .mk-slot{fill:var(--mist);stroke:none}' +
    '.mk .mk-coil,.mk .mk-tail{fill:none;stroke:var(--steel);stroke-linecap:butt}' +
    '.mk .mk-hub,.mk .mk-thumb{fill:var(--steel);stroke:none}' +
    '.mk .mk-read{font:500 11px/1 "Instrument Sans",Arial,sans-serif;font-stretch:90%;' +
    'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;letter-spacing:.01em;' +
    'fill:var(--ink);stroke:var(--bg);stroke-width:3px;stroke-linejoin:round;paint-order:stroke}' +
    '.mk .mk-unit{fill:var(--steel)}' +
    // phones: the route runs in a ~20 px gutter, so the readout would sit on the body text; the lock is sub-pixel there
    '.mk.mk-sm .mk-read,.mk.mk-sm .mk-slot,.mk.mk-sm .mk-thumb{display:none}' +
    // the blade, its ticks and numerals live in the route svg (this <style> is document-wide)
    '.mk-layer .mk-edge{fill:none;stroke:var(--steel);stroke-linecap:butt;stroke-linejoin:round}' +
    '.mk-layer .mk-face{fill:none;stroke:var(--mist);stroke-linecap:butt;stroke-linejoin:round}' +
    '.mk-layer .mk-fine{fill:none;stroke:var(--steel);stroke-width:.55px;stroke-linecap:butt}' +
    '.mk-layer .mk-tick{fill:none;stroke:var(--ink);stroke-width:.75px;stroke-linecap:butt}' +
    '.mk-layer .mk-dm{fill:none;stroke:var(--ink);stroke-width:1.1px;stroke-linecap:butt}' +
    '.mk-layer .mk-num{font:500 7px/1 "Instrument Sans",Arial,sans-serif;font-stretch:87.5%;' +
    'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;fill:var(--ink);text-anchor:middle;' +
    'stroke:var(--bg);stroke-width:2px;stroke-linejoin:round;paint-order:stroke}' +
    '.mk-layer .mk-hook{fill:var(--ink);stroke:none}' +
    '.mk-layer .mk-rivet{fill:var(--bg);stroke:none}';

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
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function tanh(x) { if (Math.tanh) return Math.tanh(x); var e = Math.exp(2 * x); return (e - 1) / (e + 1); }

  function config(small) {
    // bw blade width px, ew steel edge px, tl tick lengths px [mm, 5 mm, cm] (dm = full width), fs readout px,
    // hook: hf flange drop past the blade edge, ht flange thickness, hp riveted plate length (all px)
    return small ? {
      K: 0.7, bw: 4, ew: 0.5, mm: false, tl: [0, 1.4, 2.3], fs: 9.5, nums: false, rivets: false,
      hf: 3, ht: 1.3, hp: 4.6, effEnd: 0.86
    } : {
      K: 1.22, bw: 6, ew: 0.65, mm: true, tl: [1.5, 2.5, 3.7], fs: 11, nums: true, rivets: true,
      hf: 4.6, ht: 1.7, hp: 7.2, effEnd: 0.82
    };
  }

  // case geometry for a config (the floor line sits at the blade's far edge, so it depends on K and blade width)
  function geom(C) {
    var bb = C.bw / 2 / C.K, F = FRONT, B = F - CW, Y1 = bb + 0.5, Y0 = Y1 - CH;
    var rf = 4.5, rb = 16, rb2 = 9, rm = 1.6;   // big radius at the back-top: the coil lives there
    function p(x, y) { return r2(x) + ' ' + r2(y); }
    var g = { bb: bb, F: F, B: B, Y0: Y0, Y1: Y1, HX: F - 19.6, HY: Y1 - 17.6, RG: 4.8 };
    g.shell = 'M' + p(F, Y1 - rm) + 'L' + p(F, Y0 + rf) + 'A' + rf + ' ' + rf + ' 0 0 0 ' + p(F - rf, Y0) +
      'L' + p(B + rb, Y0) + 'A' + rb + ' ' + rb + ' 0 0 0 ' + p(B, Y0 + rb) +
      'L' + p(B, Y1 - rb2) + 'A' + rb2 + ' ' + rb2 + ' 0 0 0 ' + p(B + rb2, Y1) +
      'L' + p(F - rm, Y1) + 'A' + rm + ' ' + rm + ' 0 0 0 ' + p(F, Y1 - rm) + 'Z' +
      // chin over the mouth: the blade disappears under it
      // (same winding as the shell and overlapping it, so no seam and no hole)
      'M' + p(0, -bb - 1.4) + 'L' + p(F - 0.6, -bb - 1.4) + 'L' + p(F - 0.6, Y1) + 'L' + p(-0.8, Y1) +
      'A0.8 0.8 0 0 0 ' + p(0, Y1 - 0.8) + 'Z';
    // flat lock slider: a slot flush in the top edge between the two top radii, thumb rides in it
    g.slot = { x: r2(F - 17.2), y: r2(Y0 + 1.1), w: 11.6, h: 3.1 };
    g.thumb = { x: r2(F - 16.7), y: r2(Y0 + 1.6), w: 5.2, h: 2.1 };
    // the axle screw: one slot across the steel hub, turning with the coil
    g.notch = 'M' + p(g.HX - HUB - 0.1, g.HY - 0.45) + 'L' + p(g.HX + HUB + 0.1, g.HY - 0.45) +
      'L' + p(g.HX + HUB + 0.1, g.HY + 0.45) + 'L' + p(g.HX - HUB - 0.1, g.HY + 0.45) + 'Z';
    return g;
  }

  window.Travellers.register('miarka', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small), hostSize = small ? 48 : 176;
    var routeSvg = env.routeSvg || (env.layer && env.layer.ownerSVGElement);

    // ---------- case + readout (in the host) ----------
    var svg = make('svg', { 'class': 'mk', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    svg.setAttribute('viewBox', (-hostSize / 2) + ' ' + (-hostSize / 2) + ' ' + hostSize + ' ' + hostSize);
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var caseG = make('g', null, svg), caseT = tf(caseG), caseR = tf(caseG), caseS = tf(caseG);
    var G = null, notchR = null, thumbT = null, coilP = null, tailL = null;
    function buildCase() {
      while (caseG.firstChild) caseG.removeChild(caseG.firstChild);
      G = geom(C);
      make('path', { 'class': 'mk-shell', d: G.shell }, caseG);
      make('circle', { 'class': 'mk-win', cx: r2(G.HX), cy: r2(G.HY), r: WR }, caseG);
      coilP = make('path', { 'class': 'mk-coil', 'stroke-width': TAPE }, caseG);
      tailL = make('line', { 'class': 'mk-tail', 'stroke-width': TAPE }, caseG);
      make('circle', { 'class': 'mk-hub', cx: r2(G.HX), cy: r2(G.HY), r: HUB }, caseG);
      notchR = tf(make('path', { 'class': 'mk-notch', d: G.notch }, caseG));
      make('rect', { 'class': 'mk-slot', x: G.slot.x, y: G.slot.y, width: G.slot.w, height: G.slot.h, rx: 1.2 }, caseG);
      thumbT = tf(make('rect', { 'class': 'mk-thumb', x: G.thumb.x, y: G.thumb.y, width: G.thumb.w, height: G.thumb.h, rx: 0.8 }, caseG));
      if (small) svg.classList.add('mk-sm'); else svg.classList.remove('mk-sm');
      wAng = wFs = wLock = wNotch = wRx = wRy = wOp = wOx = wOy = wRs = wRc = NaN; textW = NaN;
    }
    var read = make('text', { 'class': 'mk-read' }, svg), readT = tf(read), readS = tf(read);
    var numNode = document.createTextNode('0');
    make('tspan', { 'class': 'mk-num' }, read).appendChild(numNode);
    make('tspan', { 'class': 'mk-unit' }, read).textContent = ' cm';
    host.appendChild(svg);

    // ---------- route samples ----------
    var N = 0, SX = null, SY = null, TX = null, TY = null, total = 0, total2 = 0, sstep = SSTEP;
    var Q = { x: 0, y: 0, tx: 0, ty: 1 }, QC = { x: 0, y: 0, tx: 0, ty: 1 };
    var idxSize = 176;
    function buildSamples() {
      total = env.total() || 0; total2 = total + LEAD;
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
    // a point on the BLADE, measured from the hook tip: the first LEAD px run straight back out of the route start
    function bladeAt(u, out) {
      if (u >= LEAD) { sampleAt(u - LEAD, out); return; }
      sampleAt(0, out);
      var b = LEAD - u; out.x -= out.tx * b; out.y -= out.ty * b;
    }

    // which side of the blade the case stands on. Prefer upright; on vertical runs, toward the page centre.
    // Hysteresis so a gently wavering route never makes it flip back and forth.
    var mainCX = (window.innerWidth || 1000) / 2;
    function prefSide(x, tx, ty, cur) {
      var ux = -ty, uy = tx, sc = -uy, dx = mainCX - x;
      if (Math.abs(dx) > mainCX * 0.12) sc += 0.8 * ux * (dx > 0 ? 1 : -1);
      if (cur > 0) return sc < -0.2 ? -1 : 1;
      return sc > 0.2 ? 1 : -1;
    }

    // ---------- blade + ticks + numerals + hook (in the layer) ----------
    var lroot = null, chunks = [], nums = [], edgeP = null, faceP = null, clipT = null, clipR = null, sig = 1;
    function buildLayer() {
      if (lroot && lroot.parentNode) lroot.parentNode.removeChild(lroot);
      lroot = null; chunks = []; nums = []; edgeP = faceP = null;
      if (N < 2 || !routeSvg) return;
      var root = make('g', { 'class': 'mk-layer' });
      var defs = make('defs', null, root);
      var cb = make('clipPath', { id: 'mkBehind', clipPathUnits: 'userSpaceOnUse' }, defs);
      make('rect', { x: -3000, y: -3000, width: 3000, height: 6000 }, cb);
      function ctf(node) { var t = routeSvg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
      clipT = ctf(cb); clipR = ctf(cb);

      // blade band: hook tip -> route start -> the route itself, cut at the mouth by one dash
      bladeAt(0, Q);
      var d0 = env.routePath.getAttribute('d') || 'M0 0';
      var d = d0.replace(/^\s*M/, 'M' + r2(Q.x) + ' ' + r2(Q.y) + ' L');
      var dash = r1(total2 + 4) + 'px ' + r1(total2 + 60) + 'px';
      edgeP = make('path', { 'class': 'mk-edge', d: d }, root);
      edgeP.style.strokeWidth = (C.bw + 2 * C.ew) + 'px'; edgeP.style.strokeDasharray = dash;
      faceP = make('path', { 'class': 'mk-face', d: d }, root);
      faceP.style.strokeWidth = C.bw + 'px'; faceP.style.strokeDasharray = dash;

      // ticks hang from the edge on the case's side (as it stands at the start); numerals sit off the other edge
      sampleAt(0, Q);
      sig = prefSide(Q.x, Q.tx, Q.ty, 1);
      var nCh = Math.max(1, Math.ceil(total2 / CHUNK)), k, fine = [], ink = [], dm = [];
      for (k = 0; k < nCh; k++) { fine.push([]); ink.push([]); dm.push([]); }
      var hb = C.bw / 2, e = hb - 0.05;
      for (var i = 1; ; i++) {
        var u = i * MM; if (u > total2) break;
        if (u < C.hp + 0.8) continue;                 // under the riveted plate
        var kind = i % 100 === 0 ? 3 : i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0;
        if (kind === 0 && !C.mm) continue;
        bladeAt(u, Q);
        var nx = -Q.ty * sig, ny = Q.tx * sig, L = kind === 3 ? C.bw - 0.1 : C.tl[kind];
        var seg = 'M' + r2(Q.x + nx * e) + ' ' + r2(Q.y + ny * e) + 'l' + r2(-nx * L) + ' ' + r2(-ny * L);
        var kk = (u / CHUNK) | 0; if (kk >= nCh) kk = nCh - 1;
        (kind === 0 ? fine : kind === 3 ? dm : ink)[kk].push(seg);
      }
      var gT = make('g', null, root);
      for (k = 0; k < nCh; k++) {
        var g = make('g', { display: 'none' }, gT);
        if (fine[k].length) make('path', { 'class': 'mk-fine', d: fine[k].join('') }, g);
        if (ink[k].length) make('path', { 'class': 'mk-tick', d: ink[k].join('') }, g);
        if (dm[k].length) make('path', { 'class': 'mk-dm', d: dm[k].join('') }, g);
        chunks.push({ g: g, st: 0 });
      }
      if (C.nums) {
        var gN = make('g', null, root), FS = 7, NH = FS * 0.68;
        for (var j = 1; ; j++) {
          var un = j * TURN; if (un > total2 - 2) break;
          bladeAt(un, Q);
          var fx = Q.ty * sig, fy = -Q.tx * sig, label = '' + j * 10, w = label.length * FS * 0.56;
          var ext = Math.abs(fx) * w / 2 + Math.abs(fy) * NH / 2, off = hb + C.ew + 1.6 + ext;
          var t = make('text', { 'class': 'mk-num', x: r2(Q.x + fx * off), y: r2(Q.y + fy * off + NH / 2), display: 'none' }, gN);
          t.textContent = label;
          nums.push({ n: t, u: un + 5, on: false });
        }
      }

      // the hook at the blade tip: an L — a flange dropping past the floor-side edge, and a riveted plate
      bladeAt(0, Q);
      var hx = Q.tx, hy = Q.ty, mx = -hy * sig, my = hx * sig, ox = Q.x, oy = Q.y;
      function P(a, b) { return r2(ox + hx * a + mx * b) + ' ' + r2(oy + hy * a + my * b); }
      var top = hb + 0.6, drop = hb + C.hf, ph = hb - 0.5;
      make('path', { 'class': 'mk-hook', d:
        'M' + P(-C.ht, top) + 'L' + P(0, top) + 'L' + P(0, -drop) + 'L' + P(-C.ht, -drop) + 'Z' +
        'M' + P(0, ph) + 'L' + P(C.hp, ph) + 'L' + P(C.hp, -ph) + 'L' + P(0, -ph) + 'Z' }, root);
      if (C.rivets) {
        for (var s = -1; s <= 1; s += 2) {
          var ra = C.hp * 0.58, rb = s * hb * 0.42;
          make('circle', { 'class': 'mk-rivet', cx: r2(ox + hx * ra + mx * rb), cy: r2(oy + hy * ra + my * rb), r: 0.65 }, root);
        }
      }
      env.layer.appendChild(root);
      lroot = root;
    }
    function applyChunk(ch, st) {
      ch.st = st;
      if (st === AHEAD) ch.g.setAttribute('display', 'none');
      else {
        ch.g.removeAttribute('display');
        if (st === NEAR) ch.g.setAttribute('clip-path', 'url(#mkBehind)'); else ch.g.removeAttribute('clip-path');
      }
    }
    function updateBlade(split) {
      for (var k = 0; k < chunks.length; k++) {
        var a = k * CHUNK, st = a + CHUNK <= split ? BEHIND : a >= split ? AHEAD : NEAR;
        if (st !== chunks[k].st) applyChunk(chunks[k], st);
      }
      for (var j = 0; j < nums.length; j++) {
        var on = nums[j].u <= split;
        if (on !== nums[j].on) {
          nums[j].on = on;
          if (on) nums[j].n.removeAttribute('display'); else nums[j].n.setAttribute('display', 'none');
        }
      }
    }

    // ---------- pose ----------
    var baseA = -90, ca = 0, sa = -1, fT = 1, textW = NaN, wDigits = 1;
    var wAng = NaN, wFs = NaN, wLock = NaN, wNotch = NaN, wRx = NaN, wRy = NaN, wOp = NaN, wOx = NaN, wOy = NaN;
    var wRs = NaN, wRc = NaN, wOff = NaN, wCx = NaN, wCy = NaN, wCt = NaN, wCm = -1;
    var tilt = { x: 0, v: 0 }, flip = { x: 1, v: 0 }, lock = { x: 1, v: 0 };
    // end dock: hs = page's own host scale, eff = what the case should look like on screen, cs = counter scale
    var hs = 1, eff = 1, cs = 1, ox = 0, oy = 0, oxs = 0, oys = 0, ccx = 0, ccy = 0, near = false;

    function poseAt(len, stat) {
      var settle = clamp01((len - (total - idxSize)) / idxSize);
      hs = 1 - 0.74 * settle;
      eff = 1 - (1 - C.effEnd) * settle; if (eff < hs) eff = hs;
      cs = eff / hs;
      var stop = total - ((CW - FRONT + 1.5) * C.K * C.effEnd + END_GAP);
      if (stop < 0) stop = 0;
      var lm = len < stop ? len : stop;
      sampleAt(len, QC); sampleAt(lm, Q);
      oxs = Q.x - QC.x; oys = Q.y - QC.y; ox = oxs / hs; oy = oys / hs;
      var ar = Math.atan2(-Q.ty, -Q.tx);
      baseA = ar * DEG; ca = Math.cos(ar); sa = Math.sin(ar);
      fT = prefSide(Q.x, Q.tx, Q.ty, fT);
      var k = C.K * eff;
      ccx = oxs + k * (ca * G.HX - sa * fT * G.HY); ccy = oys + k * (sa * G.HX + ca * fT * G.HY);
      var U = lm + LEAD;
      if (faceP) {
        var off = total2 - U; if (off < 0) off = 0;
        if (!(Math.abs(off - wOff) <= 0.2)) {
          var o = r1(off) + 'px';
          edgeP.style.strokeDashoffset = o; faceP.style.strokeDashoffset = o; wOff = off;
        }
        var th = Math.atan2(Q.ty, Q.tx) * DEG;
        if (!(Math.abs(Q.x - wCx) <= 0.1 && Math.abs(Q.y - wCy) <= 0.1 && Math.abs(th - wCt) <= 0.15)) {
          clipT.setTranslate(Q.x, Q.y); clipR.setRotate(th, 0, 0);
          wCx = Q.x; wCy = Q.y; wCt = th;
        }
        updateBlade(U);
      }
      // coil: the boss notch turns once per 10 cm; the wound coil thins as tape pays out
      var h = (U / TURN) * 360 % 360;
      if (!(Math.abs(h - wNotch) <= 0.3)) { notchR.setRotate(h, G.HX, G.HY); wNotch = h; }
      var rc = RC_MIN + (RC_MAX - RC_MIN) * (1 - clamp01(U / (total2 || 1)));
      if (!(Math.abs(rc - wRc) <= 0.06)) {
        // wound layers, outermost at rc: they peel off one by one as the blade pays out
        var cd = '', rr;
        for (rr = rc; rr >= COIL_IN - 0.01; rr -= PITCH) {
          cd += 'M' + r2(G.HX + rr) + ' ' + r2(G.HY) + 'a' + r2(rr) + ' ' + r2(rr) + ' 0 1 0 ' + r2(-2 * rr) + ' 0' +
            'a' + r2(rr) + ' ' + r2(rr) + ' 0 1 0 ' + r2(2 * rr) + ' 0';
        }
        coilP.setAttribute('d', cd);
        var ty = rc, tx = Math.sqrt(Math.max(0, (WR - 0.4) * (WR - 0.4) - (rc + TAPE / 2) * (rc + TAPE / 2)));
        tailL.setAttribute('x1', r2(G.HX)); tailL.setAttribute('y1', r2(G.HY + ty));
        tailL.setAttribute('x2', r2(G.HX + tx)); tailL.setAttribute('y2', r2(G.HY + ty));
        wRc = rc;
      }
      var cm = Math.round(U / CM); if (!(cm > 0)) cm = 0;
      if (cm !== wCm) {
        var str = '' + cm; numNode.data = str; wCm = cm;
        if (str.length !== wDigits) { wDigits = str.length; textW = NaN; }
      }
      if (stat) {
        tilt.x = 0; tilt.v = 0; flip.x = fT; flip.v = 0; lock.x = 1; lock.v = 0;
        renderCase(0);
      }
    }
    function measure() {
      var w = 0;
      try { w = read.getComputedTextLength(); } catch (e) {}
      return w > 0 ? w : C.fs * (0.56 * wDigits + 1.4);
    }
    function renderCase(eps) {
      var ang = baseA + tilt.x;
      if (!(Math.abs(ox - wOx) <= eps * 0.5 && Math.abs(oy - wOy) <= eps * 0.5)) { caseT.setTranslate(ox, oy); wOx = ox; wOy = oy; }
      if (!(Math.abs(ang - wAng) <= eps)) { caseR.setRotate(ang, 0, 0); wAng = ang; }
      var fs = flip.x; if (fs > -0.02 && fs < 0.02) fs = fs < 0 ? -0.02 : 0.02;
      var kk = C.K * cs;
      if (!(Math.abs(fs - wFs) <= eps * 0.02 && Math.abs(kk - wRs) <= eps * 0.01)) { caseS.setScale(kk, kk * fs); wFs = fs; wRs = kk; }
      if (!(Math.abs(lock.x - wLock) <= eps * 0.2)) { thumbT.setTranslate(LOCK_RUN * lock.x, 0); wLock = lock.x; }
      // readout: screen-upright, just beyond the top of the case, anchored so it grows away from it; 11 px on screen
      var p = ang / DEG, c = Math.cos(p), s = Math.sin(p), sg = fs < 0 ? -1 : 1, rs = 1 / hs;
      var lx = G.HX, ly = G.Y0 - G.RG;
      var bx = ox + kk * (c * lx - s * fs * ly), by = oy + kk * (s * lx + c * fs * ly);
      var ux = s * sg, uy = -c * sg;
      if (textW !== textW) textW = measure();
      var x = bx - textW * rs * (1 - ux) / 2, y = by + C.fs * 0.7 * rs * (1 + uy) / 2;
      if (!(Math.abs(x - wRx) <= eps && Math.abs(y - wRy) <= eps)) { readT.setTranslate(x, y); wRx = x; wRy = y; }
      if (!(Math.abs(rs - readS._w) <= 0.002)) { readS.setScale(rs, rs); readS._w = rs; }
      var op = smooth(0.3, 0.85, fs < 0 ? -fs : fs);
      if (!(Math.abs(op - wOp) <= 0.02)) { read.style.opacity = op; wOp = op; }
    }

    // ---------- reduced motion: static pose that follows the host on scroll ----------
    var rafId = 0, onScroll = null, TRE = /translate3d\(\s*(-?[\d.]+(?:e-?\d+)?)px,\s*(-?[\d.]+(?:e-?\d+)?)px/;
    function syncFromHost() {
      rafId = 0;
      try {
        var m = TRE.exec(host.style.transform || '');
        if (!m || N < 2) return;
        var cx = +m[1] + idxSize / 2, cy = +m[2] + idxSize / 2, best = 0, bd = Infinity;
        for (var i = 0; i < N; i++) { var dx = SX[i] - cx, dy = SY[i] - cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
        poseAt(best * sstep, true);
      } catch (e) {}
    }
    if (reduce) {
      onScroll = function () { if (!rafId) rafId = window.requestAnimationFrame(syncFromHost); };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ---------- relayout ----------
    var relayoutTimer = 0, geomDirty = true, sleeping = false, first = true, lastLen = NaN, lastPx = null, lastPy = null;
    function rebuild() {
      relayoutTimer = 0;
      try {
        mainCX = ((env.main && env.main.clientWidth) || window.innerWidth || 1000) / 2;
        idxSize = (window.innerWidth || 1000) <= 760 ? 48 : 176;   // the page's own size for its end-of-route shrink
        buildSamples(); buildLayer();
      } catch (e) {
        try { if (lroot && lroot.parentNode) lroot.parentNode.removeChild(lroot); } catch (e2) {}
        lroot = null; chunks = []; nums = []; edgeP = faceP = null;
      }
      wOff = wCx = wCy = wCt = NaN; textW = NaN; geomDirty = true; sleeping = false;
      if (reduce) syncFromHost();
    }

    readS._w = NaN;
    buildCase();

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2, nextSmall = size < 100;
          hostSize = size;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if (nextSmall !== small) { small = nextSmall; C = config(small); buildCase(); N = 0; }
          geomDirty = true; sleeping = false; wAng = wFs = wRx = wRy = wOx = wOy = NaN;
        } catch (e) {}
      },
      relayout: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (N < 2) rebuild(); else relayoutTimer = setTimeout(rebuild, 120);
      },
      frame: function (t, s) {
        try {
          var len = s.len || 0;
          if (reduce) {
            if (geomDirty || !(Math.abs(len - lastLen) <= 0.02)) { poseAt(len, true); lastLen = len; geomDirty = false; }
            return;
          }
          var px = small || s.px == null ? null : s.px, py = small || s.py == null ? null : s.py;
          var vel = s.vel || 0, av = vel < 0 ? -vel : vel;
          var moved = geomDirty || !(Math.abs(len - lastLen) <= 0.02);
          if (sleeping && !moved && px === lastPx && py === lastPy && av < 0.002) return;
          lastPx = px; lastPy = py;
          if (moved) { poseAt(len, first); lastLen = len; geomDirty = false; first = false; }

          var dt = Math.min(s.dt || 16.7, 100) / 1000;
          // lean in the case's own frame: + tips the top toward the mouth. Drag of travel leans it back,
          // the pointer swivels it on the mouth toward itself.
          var lean = 7 * vel;
          if (px !== null && py !== null) {
            var dx = px - ccx, dy = py - ccy, d = Math.sqrt(dx * dx + dy * dy);
            near = near ? d < R_LOCK_OFF : d < R_LOCK;
            if (d < R_OUT) {
              var g = smooth(R_OUT, R_IN, d), lx = (ca * (px - oxs) + sa * (py - oys)) / (C.K * eff);
              lean += g * GAIN * tanh((lx - G.HX) / 18);
            }
          } else near = false;
          if (lean < 0) lean *= BACK;            // tipping onto the back corner is shallower
          if (lean > GAIN) lean = GAIN; else if (lean < -GAIN * BACK) lean = -GAIN * BACK;
          // the lock thumb slides off while the blade runs or a hand comes close, and clicks back on otherwise
          var tgt = fT * lean, lk = av > 0.025 || near ? 0 : 1;
          step(tilt, tgt, W_TILT, dt); step(flip, fT, W_FLIP, dt); step(lock, lk, W_LOCK, dt);

          if (!moved && Math.abs(tilt.x - tgt) < 0.05 && Math.abs(tilt.v) < 0.05 &&
              Math.abs(flip.x - fT) < 0.002 && Math.abs(flip.v) < 0.01 &&
              Math.abs(lock.x - lk) < 0.004 && Math.abs(lock.v) < 0.01) {
            tilt.x = tgt; tilt.v = 0; flip.x = fT; flip.v = 0; lock.x = lk; lock.v = 0;
            renderCase(0.001); sleeping = true;
          } else { sleeping = false; renderCase(0.15); }
        } catch (e) {}
      },
      destroy: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (rafId) window.cancelAnimationFrame(rafId);
        if (onScroll) window.removeEventListener('scroll', onScroll);
        relayoutTimer = rafId = 0; onScroll = null; chunks = []; nums = [];
      }
    };
  });
})(window, document);
