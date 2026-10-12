/* Stalówka: a steel fountain-pen nib that writes the page's route.
   The tip sits on the route point and the nib lies along the route, canted ~22 degrees like a pen held in a hand.
   Silhouette: a long pointed ogive to the shoulders, an S-curve in to the narrower neck that would sit in the pen.
   Two-tone plating: bright rhodium tines from the tip back past the breather hole, ending in a pointed arch;
   darker ruthenium shoulders and neck behind it, with one engraved line echoing the arch (cut to bright steel).
   Slit from the tip to the breather hole; a darker tipping bead at the point. A polished streak and its dark
   reflection band slide across the curved nib as it turns against a light from the upper left.
   Ink: behind the tip the hairline becomes a 2 px ink line (env.layer); ahead it stays hairline steel.
   Like a flexible nib under pressure, scrolling faster spreads the tines (the slit opens at the tip) and lays
   a wider line, up to ~2.8 px. Each short piece of line keeps the width it was written with, so the line
   behind the nib records how you scrolled. Scrolling back draws the ink back up with the nib.
   Mouse within ~240 px: the nib pivots on its tip so its body leans toward the pointer (the hand), and
   settles back along the route when the pointer leaves. Critically damped springs throughout.
   SVG only; transforms through SVGTransform objects, streaks/slit through live SVGPoint lists.
   Idle (no scroll, no pointer change, springs settled) = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg', DEG = 180 / Math.PI, RAD = Math.PI / 180, PI = Math.PI, TAU = 2 * Math.PI;

  // ---- nib geometry in desktop CSS px. Local frame: tip at 0,0, nib points along +x, body runs back along -x.
  var L = 62, W = 10, DS = 44, KX = 1.3, TIP_R = 1.25;     // length, max half width, shoulders, ogive power, tipping bead
  var WN = 7.3, SN = 3.2;                                   // neck half width behind the shoulders; shoulder curve length
  var D_HOLE = 24, R_HOLE = 1.9;                            // breather hole
  var B_EDGE = 31, B_AXIS = 38;                             // plating boundary: meets the edge / the axis
  var CANT = 22 * RAD;                                      // a held pen: body leans off the line it writes

  // ---- motion
  var W_ANG = 14, W_TILT = 9, W_PR = 6.5;                   // spring speeds (rad/s)
  var R_OUT = 240, R_FULL = 70, MAXT = 48 * RAD;            // pointer reach and max lean
  var V0 = 140, V1 = 1500;                                  // route speed (px/s) from no pressure to full
  var JUMP = 600;                                           // a move this long in one frame is a cut, not a stroke

  // ---- ink
  var S = 6, WB = 2, WM = 2.8;                              // piece length; rest and full-pressure widths

  var CSS =
    '.st{overflow:visible}' +
    '.st .st-h{fill:var(--bg);stroke:var(--bg);stroke-width:3;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '.st .st-o{fill:none;stroke-width:.8;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '.st .st-e{fill:none;stroke-width:.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '.st.st-sm .st-h{stroke-width:2.2}.st.st-sm .st-o{stroke-width:.7}.st.st-sm .st-e,.st.st-sm .st-x{display:none}' +
    '.route .st-ink{fill:none;stroke:var(--ink);stroke-width:' + WB + ';stroke-linecap:round;stroke-linejoin:round;' +
      'vector-effect:non-scaling-stroke}' +
    '.route .st-sw{stroke:var(--ink);stroke-linecap:butt}';

  function make(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function wrap(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  // exact critically damped spring step
  function step(sp, target, w, dt) {
    var x0 = sp.x - target, k = sp.v + w * x0, e = Math.exp(-w * dt);
    sp.x = target + (x0 + k * dt) * e;
    sp.v = (sp.v - w * k * dt) * e;
  }
  function parse(str, fb) {
    str = (str || '').trim(); var m;
    if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(str))) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    if ((m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(str))) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    if ((m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(str))) return [+m[1], +m[2], +m[3]];
    return fb;
  }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function n2(v) { return String(Math.round(v * 100) / 100); }

  // half width of the nib at distance d behind the tip: a long pointed ogive to the shoulders, an S-curve in to the
  // narrower neck that would sit in the pen, and the round tipping bead at the very point
  function ogive(d) {
    if (d <= 0) return 0;
    if (d < DS) return W * (1 - Math.pow(1 - d / DS, KX));
    if (d < DS + SN) return W - (W - WN) * (1 - Math.cos(PI * (d - DS) / SN)) / 2;
    return WN + 0.35 * (d - DS - SN) / (L - DS - SN);
  }
  function hw(d) {
    var o = ogive(d);
    if (d < 2 * TIP_R) { var c = TIP_R * TIP_R - (d - TIP_R) * (d - TIP_R); c = c > 0 ? Math.sqrt(c) : 0; if (c > o) o = c; }
    return o;
  }
  function edge(sign, d0, d1, inset) {
    var out = [], d = d0;
    for (;;) {
      out.push(n2(-d) + ' ' + n2(sign * (hw(d) - inset)));
      if (d >= d1) break;
      d = Math.min(d1, d + (d < 3 ? 0.25 : d < 8 ? 0.6 : d > DS - 1.5 && d < DS + SN + 0.5 ? 0.35 : 1.2));
    }
    return out;
  }
  var HL = hw(L);
  var SIL = 'M' + edge(1, 0, L, 0).join('L') + 'L' + n2(-L) + ' ' + n2(-HL) +
    'L' + edge(-1, 0, L, 0).reverse().join('L') + 'Z';
  // bright plating: everything in front of a pointed arch that starts on both edges and meets on the axis
  var HE = hw(B_EDGE);
  function arch(dE, dA, h) {
    return [n2(-dE) + ' ' + n2(-h), n2(-(dE + 0.8)) + ' ' + n2(-(h - 2.7)), n2(-(dA - 0.7)) + ' ' + n2(-2.3), n2(-dA) + ' 0',
      n2(-(dA - 0.7)) + ' 2.3', n2(-(dE + 0.8)) + ' ' + n2(h - 2.7), n2(-dE) + ' ' + n2(h)];
  }
  var A = arch(B_EDGE, B_AXIS, HE + 0.6);
  var BRIGHT = 'M5 -14L' + n2(-B_EDGE) + ' -14L' + A[0] + 'C' + A[1] + ' ' + A[2] + ' ' + A[3] +
    'C' + A[4] + ' ' + A[5] + ' ' + A[6] + 'L' + n2(-B_EDGE) + ' 14L5 14Z';
  // engraving cut through the darker plating to bright steel: one line echoing the arch
  var E1 = B_EDGE + 2, A2 = arch(E1, B_AXIS + 2, hw(E1) - 0.3);
  var ENG = 'M' + A2[0] + 'C' + A2[1] + ' ' + A2[2] + ' ' + A2[3] + 'C' + A2[4] + ' ' + A2[5] + ' ' + A2[6];
  // streak samples along the nib
  var SD = [3, 6, 10, 15, 21, 28, 35, 41, 44.6, 46.4, 53, 61.4], SH = [], NSD = SD.length;
  for (var si = 0; si < NSD; si++) SH.push(hw(SD[si]));
  function polyInit() {
    var p = [], j;
    for (j = 0; j < NSD; j++) p.push(n2(-SD[j]) + ',0');
    for (j = NSD - 1; j >= 0; j--) p.push(n2(-SD[j]) + ',0');
    return p.join(' ');
  }
  // lateral shading of the curved nib, u = -2..2 half widths (the gradient slides with the light)
  function shade(u) { var c = Math.cos(u * 1.05); return 0.36 + 0.64 * (c > 0 ? Math.pow(c, 1.4) : 0); }

  window.Travellers.register('stalowka', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, K = small ? 0.5 : 1, size = small ? 48 : 176;
    var root = document.documentElement;

    // ---------- the nib (host SVG)
    var svg = make('svg', { 'class': 'st', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var uid = 'st' + Math.floor(Math.random() * 1e9).toString(36);
    var defs = make('defs', null, svg);
    make('path', { d: SIL }, make('clipPath', { id: uid + 'c' }, defs));
    var gR = make('linearGradient', { id: uid + 'r', gradientUnits: 'userSpaceOnUse', x1: 0, y1: -2 * W, x2: 0, y2: 2 * W }, defs);
    var gD = make('linearGradient', { id: uid + 'd', gradientUnits: 'userSpaceOnUse', x1: 0, y1: -2 * W, x2: 0, y2: 2 * W }, defs);
    var gRT = null, gDT = null;
    try { gRT = svg.createSVGTransform(); gR.gradientTransform.baseVal.appendItem(gRT); gDT = svg.createSVGTransform(); gD.gradientTransform.baseVal.appendItem(gDT); } catch (e) { gRT = gDT = null; }
    var rStops = [], dStops = [], NG = 24, i;
    for (i = 0; i <= NG; i++) {
      var u = -2 + 4 * i / NG, I = shade(u);
      rStops.push({ n: make('stop', { offset: (i / NG).toFixed(4) }, gR), I: I });
      dStops.push({ n: make('stop', { offset: (i / NG).toFixed(4) }, gD), I: I });
    }

    var rig = make('g', null, svg), rigT = tf(rig);
    var nib = make('g', null, rig), nibT = tf(nib);
    make('path', { 'class': 'st-h', d: SIL }, nib);
    var body = make('g', { 'clip-path': 'url(#' + uid + 'c)' }, nib);
    make('path', { d: SIL, fill: 'url(#' + uid + 'd)' }, body);
    var eng = make('path', { 'class': 'st-e', d: ENG }, body);
    make('path', { d: BRIGHT, fill: 'url(#' + uid + 'r)' }, body);
    var band = make('polygon', { points: polyInit() }, body);
    var streak = make('polygon', { points: polyInit() }, body);
    var hole = make('circle', { cx: -D_HOLE, cy: 0, r: R_HOLE }, body);
    var holeLip = make('path', { 'class': 'st-e st-x', d: 'M' + n2(-D_HOLE - R_HOLE * 0.85) + ' ' + n2(R_HOLE * 0.5) + 'A' + R_HOLE + ' ' + R_HOLE + ' 0 0 0 ' + n2(-D_HOLE + R_HOLE * 0.85) + ' ' + n2(R_HOLE * 0.5) }, body);
    var bead = make('circle', { cx: -TIP_R, cy: 0, r: TIP_R }, body);
    var SX = -(D_HOLE - R_HOLE * 0.4);
    var slit = make('polygon', { points: '0.8,-0.36 ' + n2(SX) + ',-0.26 ' + n2(SX) + ',0.26 0.8,0.36' }, body);
    var outline = make('path', { 'class': 'st-o', d: SIL }, nib);
    host.appendChild(svg);
    var bandP = band.points, streakP = streak.points, slitP = slit.points;

    // ---------- the ink (route layer)
    var layer = env.layer;
    var ink = make('path', { 'class': 'st-ink' }, layer);
    var swG = make('g', null, layer);
    var total = 0, nC = 0, wRec = null, els = [], bx = null, by = null, wOff = NaN;

    // ---------- colours: greys mixed from the page's own --ink and --bg; the metal never inverts in dark mode
    var darkNow = null;
    function recolor() {
      try {
        var dark = root.getAttribute('data-theme') === 'dark', cs = getComputedStyle(root);
        var tk = parse(cs.getPropertyValue('--ink'), dark ? [236, 238, 240] : [23, 25, 28]);
        var bg = parse(cs.getPropertyValue('--bg'), dark ? [17, 19, 21] : [247, 248, 249]);
        var R0, R1, D0, D1, line, holeC, beadC, j;
        if (dark) {
          R0 = lerp3(bg, tk, 0.4); R1 = tk; D0 = lerp3(bg, tk, 0.14); D1 = lerp3(bg, tk, 0.5);
          line = lerp3(bg, tk, 0.36); holeC = lerp3(bg, tk, 0.03); beadC = lerp3(bg, tk, 0.34);
        } else {
          R0 = lerp3(tk, bg, 0.46); R1 = bg; D0 = lerp3(tk, bg, 0.12); D1 = lerp3(tk, bg, 0.6);
          line = tk; holeC = tk; beadC = lerp3(tk, bg, 0.3);
        }
        for (j = 0; j < rStops.length; j++) {
          rStops[j].n.setAttribute('stop-color', css(lerp3(R0, R1, rStops[j].I)));
          dStops[j].n.setAttribute('stop-color', css(lerp3(D0, D1, dStops[j].I)));
        }
        streak.setAttribute('fill', css(R1)); streak.setAttribute('fill-opacity', dark ? 0.8 : 0.9);
        band.setAttribute('fill', css(D0)); band.setAttribute('fill-opacity', dark ? 0.5 : 0.42);
        eng.style.stroke = css(lerp3(D1, R1, 0.6)); eng.style.strokeOpacity = 0.9;
        holeLip.style.stroke = css(R1); holeLip.style.strokeOpacity = 0.7;
        hole.setAttribute('fill', css(holeC)); slit.setAttribute('fill', css(holeC));
        bead.setAttribute('fill', css(beadC));
        outline.style.stroke = css(line); outline.style.strokeOpacity = dark ? 1 : 0.88;
        darkNow = dark;
      } catch (e) {}
    }
    var mo = null;
    try { mo = new MutationObserver(function () { if ((root.getAttribute('data-theme') === 'dark') !== darkNow) recolor(); }); mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}

    // ---------- ink pieces: each short piece keeps the width it was written with
    function bpt(i) { if (bx[i] !== bx[i]) { var p = env.pointAt(i * S); bx[i] = p.x; by[i] = p.y; } }
    function piece(i, w) {
      if (i < 0 || i >= nC) return;
      if (w < WB + 0.05) w = 0;
      var rec = wRec[i], el = els[i];
      if (!w) { if (rec) { el.style.display = 'none'; wRec[i] = 0; } return; }
      if (!el) {
        bpt(i); bpt(i + 1);
        el = make('line', { 'class': 'st-sw', x1: bx[i].toFixed(2), y1: by[i].toFixed(2), x2: bx[i + 1].toFixed(2), y2: by[i + 1].toFixed(2) }, swG);
        els[i] = el;
      } else if (!rec) el.style.display = '';
      if (Math.abs(rec - w) > 0.02) { el.style.strokeWidth = w.toFixed(2); wRec[i] = w; }
    }
    function inkTo(len, prev, jump, w0, w1) {
      if (!total) return;
      var off = total - len;
      if (!(Math.abs(off - wOff) <= 0.2)) { ink.style.strokeDashoffset = off.toFixed(1); wOff = off; }
      if (!wRec) return;
      var a = Math.floor(prev / S) - 1, b = Math.floor(len / S) - 1, j;   // last piece fully behind the tip
      if (b > a) { var n = b - a; for (j = a + 1; j <= b; j++) piece(j, jump ? 0 : w0 + (w1 - w0) * (j - a) / n); }
      else if (b < a) { for (j = b + 1; j <= a; j++) piece(j, 0); }
    }
    function clearPieces() {
      for (var j = 0; j < els.length; j++) if (els[j] && els[j].parentNode) els[j].parentNode.removeChild(els[j]);
      els = [];
    }

    // ---------- state
    var ang = { x: PI / 2 + CANT, v: 0 }, tl = { x: 0, v: 0 }, pr = { x: 0, v: 0 };
    var angT = 0, tlT = 0, prT = 0, tangent = PI / 2;
    var lastLen = null, lastPx = null, lastPy = null, wPrev = WB, sleeping = false, synced = false;
    var wDeg = NaN, wF = NaN, wSw = NaN;

    function tangentAt(len) {
      if (!total) return tangent;
      var a = len - 1.5, b = len + 1.5;
      if (a < 0) { a = 0; b = Math.min(total, 3); }
      if (b > total) { b = total; a = Math.max(0, total - 3); }
      var p = env.pointAt(a), q = env.pointAt(b), dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy < 1e-6) return tangent;
      return Math.atan2(dy, dx);
    }
    function setLight(r) {
      // light from the upper left; its sideways part across the nib picks where the streak sits on the curve
      var lp = 0.55 * Math.sin(r) - 0.83 * Math.cos(r), f = 0.6 * lp;
      f = f > 0.7 ? 0.7 : f < -0.7 ? -0.7 : f;
      if (Math.abs(f - wF) <= 0.012) return;
      wF = f;
      var fd = f - 0.46 * Math.tanh(3 * f), j, h, yc, th, last = 2 * NSD - 1;
      for (j = 0; j < NSD; j++) {
        h = SH[j];
        yc = f * h * 0.8; th = 0.18 + 0.075 * h;
        streakP.getItem(j).y = yc - th; streakP.getItem(last - j).y = yc + th;
        yc = fd * h * 0.8; th = 0.3 + 0.13 * h;
        bandP.getItem(j).y = yc - th; bandP.getItem(last - j).y = yc + th;
      }
      if (gRT) { gRT.setTranslate(0, f * W * 0.45); gDT.setTranslate(0, f * W * 0.45); }
    }
    function render(force) {
      var r = ang.x + tl.x, deg = r * DEG;
      if (force || Math.abs(deg - wDeg) > 0.2) { nibT.setRotate(deg, 0, 0); wDeg = deg; setLight(r); }
      var p = pr.x < 0 ? 0 : pr.x > 1 ? 1 : pr.x, sw = 0.36 + 0.6 * p;
      if (force || Math.abs(sw - wSw) > 0.03) { slitP.getItem(0).y = -sw; slitP.getItem(3).y = sw; wSw = sw; }
    }
    function scale(sm) {
      small = sm; K = sm ? 0.5 : 1;
      rigT.setScale(K, K);
      if (sm) svg.classList.add('st-sm'); else svg.classList.remove('st-sm');
    }

    // ---------- reduced motion: a still nib that still sits along the route and inks up to it
    var rTable = null, rRaf = 0;
    function buildTable() {
      rTable = null;
      if (!total) return;
      var n = Math.max(2, Math.ceil(total / 6)), xs = new Float32Array(n + 1), ys = new Float32Array(n + 1);
      for (var j = 0; j <= n; j++) { var p = env.pointAt(total * j / n); xs[j] = p.x; ys[j] = p.y; }
      rTable = { n: n, x: xs, y: ys };
    }
    function lenFromHost() {
      if (!rTable) return null;
      var m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(host.style.transform || '');
      if (!m) return null;
      var x = +m[1] + size / 2, y = +m[2] + size / 2, best = 0, bd = Infinity;
      for (var j = 0; j <= rTable.n; j++) {
        var dx = rTable.x[j] - x, dy = rTable.y[j] - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j; }
      }
      return total * best / rTable.n;
    }
    function still(len) {
      if (len === null || len === undefined) return;
      tangent = tangentAt(len);
      ang.x = tangent + CANT; ang.v = 0; tl.x = tl.v = 0; pr.x = pr.v = 0;
      inkTo(len, len, true, WB, WB);
      render(true);
    }
    function onScroll() {
      if (rRaf) return;
      rRaf = requestAnimationFrame(function () { rRaf = 0; try { still(lenFromHost()); } catch (e) {} });
    }
    if (reduce) { try { window.addEventListener('scroll', onScroll, { passive: true }); } catch (e) {} }

    recolor(); scale(small); render(true);

    return {
      resize: function (cssSize) {
        try {
          size = cssSize || (small ? 48 : 176);
          var half = size / 2;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if ((size < 100) !== small) { scale(size < 100); render(true); }
        } catch (err) {}
      },
      relayout: function () {
        try {
          total = +env.total() || 0;
          ink.setAttribute('d', env.routePath.getAttribute('d') || '');
          ink.style.strokeDasharray = total.toFixed(1) + ' ' + (total + 20).toFixed(1);
          wOff = NaN;
          clearPieces();
          nC = Math.max(0, Math.ceil(total / S));
          wRec = new Float32Array(nC + 1);
          bx = new Float32Array(nC + 2); by = new Float32Array(nC + 2);
          for (var j = 0; j < bx.length; j++) { bx[j] = NaN; by[j] = NaN; }
          synced = false; sleeping = false;
          if (reduce) { buildTable(); still(lenFromHost()); }
        } catch (err) {}
      },
      frame: function (t, s) {
        if (!!s.dark !== darkNow) recolor();
        var len = +s.len || 0;
        if (reduce) { if (!synced) { synced = true; still(len); } else if (len !== lastLen) still(len); lastLen = len; return; }
        var px = small || s.px === null || s.px === undefined ? null : s.px;
        var py = small || s.py === null || s.py === undefined ? null : s.py;
        if (sleeping && synced && len === lastLen && px === lastPx && py === lastPy) return;

        var dt = Math.min(Math.max(s.dt || 16.7, 1), 100) / 1000;
        var first = !synced || lastLen === null, dLen = first ? 0 : len - lastLen, adl = dLen < 0 ? -dLen : dLen;
        var jump = first || adl > JUMP;
        if (first || len !== lastLen) {
          var ta = tangentAt(len);
          tangent = ta;
        }
        angT = ang.x + wrap(tangent + CANT - ang.x);

        // pressure from forward speed along the route
        prT = jump || dLen <= 0 ? 0 : smooth(V0, V1, dLen / dt);
        step(pr, prT, W_PR, dt);
        var p = pr.x < 0 ? 0 : pr.x > 1 ? 1 : pr.x, wNow = WB + (WM - WB) * p;
        inkTo(len, first ? 0 : lastLen, jump, wPrev, wNow);
        wPrev = wNow;

        // lean toward the pointer: the body (behind the tip) turns toward it, within MAXT of its rest angle
        tlT = 0;
        if (px !== null && py !== null) {
          var dist = Math.sqrt(px * px + py * py);
          var wgt = smooth(R_OUT, R_FULL, dist) * smooth(6, 26, dist);
          if (wgt > 0) {
            var delta = wrap(Math.atan2(py, px) - (angT + PI));
            if (delta > 2.7 || delta < -2.7) delta = tl.x >= 0 ? Math.abs(delta) : -Math.abs(delta);   // pointer dead ahead: keep the side
            tlT = wgt * MAXT * Math.tanh(delta / MAXT);
          }
        }

        if (jump) { ang.x = angT; ang.v = 0; } else step(ang, angT, W_ANG, dt);
        step(tl, tlT, W_TILT, dt);

        lastLen = len; lastPx = px; lastPy = py; synced = true;
        var settled = Math.abs(ang.x - angT) < 0.0006 && Math.abs(ang.v) < 0.003 &&
          Math.abs(tl.x - tlT) < 0.0006 && Math.abs(tl.v) < 0.003 &&
          Math.abs(pr.x - prT) < 0.002 && Math.abs(pr.v) < 0.006 && dLen === 0;
        if (settled) { ang.x = angT; ang.v = 0; tl.x = tlT; tl.v = 0; pr.x = prT; pr.v = 0; sleeping = true; render(true); }
        else { sleeping = false; render(false); }
      },
      destroy: function () {
        try { if (mo) mo.disconnect(); } catch (e) {}
        try { window.removeEventListener('scroll', onScroll); if (rRaf) cancelAnimationFrame(rRaf); } catch (e) {}
      }
    };
  });
})(window, document);
