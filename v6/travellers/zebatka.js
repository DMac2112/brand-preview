/* Zębatka — a 12-tooth steel spur gear threaded on the route (the hairline runs through its round bore and
   shows through the five spoke windows). It rolls without slip: rotation = distance travelled / pitch radius,
   clockwise going forward. Teeth are true 20° involutes (stub depth, a hair of backlash) so they read as machined,
   not as a star. Steel is drawn in flat tones only: mist web, a steel-toned rim and hub boss, and a fixed
   light/shade band on the rim that does not turn with the gear (the light stays where it is).
   At every section mark a 10-tooth pinion is mounted beside the route (env.layer), placed so the route's closest
   approach is exactly the working centre distance. Its angle is a pure function of the main gear's position:
   while the tip circles overlap it is driven in exact mesh (tooth into gap, ratio 12:10, including the planetary
   sweep of the line of centres); outside that window it holds the angle it was left at. Scrolling back turns it
   back. The mouse pulls the gear a little off the route (critically damped, ~10% of its diameter); the pull is off
   near the pinions so the mesh stays true. At the end of the line the host shrinks the drop; the gear counter-
   scales to a gentler size, keeps its outline >= 1 px and rolls to a stop short of the contact button.
   Idle = early return; DOM is touched only when a value moved by > 0.2 px / 0.2°. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';
  var DEG = 180 / Math.PI, PI = Math.PI, TAU = PI * 2;
  var PA = 20 / DEG, INV_PA = Math.tan(PA) - PA;
  var ADD = 0.85, DED = 1.1;          // stub tooth: addendum / dedendum in modules
  var NM = 12, NP = 10, RATIO = NM / NP;
  var SSTEP = 3;                      // route sampling step (px)
  var R_OUT = 240, R_IN = 56, W_MAG = 8;
  var GAP = 140;                      // min route length between two pinions
  var K_END = 0.74;                   // index.html placeDrop: host scale = 1 - .74 * settle over the last host-size px
  var CLEAR = 7;                      // px from the route's end point (button edge) to the parked gear's tooth tips

  var CSS =
    '.zb{overflow:visible}' +
    '.zb .zb-face{fill:var(--mist);fill-rule:evenodd;stroke:none}' +
    '.zb .zb-tone{fill:var(--steel);fill-rule:evenodd;stroke:none;opacity:.25}' +
    '.zb .zb-edge{fill:none;stroke:var(--ink);stroke-width:calc(1.2px * var(--zk,1));stroke-linejoin:round}' +
    '.zb .zb-hole{fill:none;stroke:var(--ink);stroke-width:calc(.9px * var(--zk,1));stroke-linejoin:round}' +
    '.zb .zb-hi{fill:none;stroke:var(--bg);stroke-width:2px;stroke-linecap:round;opacity:.7}' +
    '.zb .zb-sh{fill:none;stroke:var(--steel);stroke-width:2px;stroke-linecap:round;opacity:.7}' +
    '.zb.zb-dk .zb-tone{opacity:.3}' +
    '.zb.zb-dk .zb-hi{stroke:var(--steel);opacity:.75}.zb.zb-dk .zb-sh{stroke:var(--bg);opacity:.85}' +
    '.zb.zb-sm .zb-edge{stroke-width:calc(1.1px * var(--zk,1))}.zb.zb-sm .zb-hole{stroke-width:calc(.85px * var(--zk,1))}' +
    '.zb.zb-sm .zb-hi,.zb.zb-sm .zb-sh{stroke-width:1.4px}' +
    '.zb-st .zb-sf{fill:var(--mist);fill-rule:evenodd;stroke:var(--steel);stroke-width:1.3px;stroke-linejoin:round}' +
    '.zb-st .zb-sx{fill:var(--ink);stroke:none}' +
    '.zb-st.zb-sm .zb-sf{stroke-width:1px}';

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
  function f2(v) { return Math.round(v * 100) / 100; }
  function xy(x, y) { return f2(x) + ' ' + f2(y); }
  function pt(r, a) { return xy(r * Math.cos(a), r * Math.sin(a)); }
  function inv(a) { return Math.tan(a) - a; }

  // Spur gear outline centred at 0,0; tooth 0 points along +x; angles grow clockwise on screen.
  // tb thins every flank by tb px at the pitch circle (backlash), so meshed teeth never overlap.
  function gearOutline(N, R, tb) {
    var m = 2 * R / N, ra = R + ADD * m, rf = R - DED * m, rb = R * Math.cos(PA);
    var psiP = PI / (2 * N) + INV_PA - tb / R, r0 = Math.max(rb, rf), K = 4, prof = [], i, k;
    for (i = 0; i <= K; i++) {
      var r = r0 + (ra - r0) * i / K;
      prof.push([r, psiP - inv(Math.acos(Math.min(1, rb / r)))]);
    }
    var pitch = TAU / N, psiR = prof[0][1], d = '', rfs = f2(rf) + ' ' + f2(rf), ras = f2(ra) + ' ' + f2(ra);
    for (k = 0; k < N; k++) {
      var c = k * pitch;
      d += (k ? 'A' + rfs + ' 0 0 1 ' : 'M') + pt(rf, c - psiR);
      if (rb > rf) d += 'L' + pt(prof[0][0], c - prof[0][1]);
      for (i = 1; i <= K; i++) d += 'L' + pt(prof[i][0], c - prof[i][1]);
      d += 'A' + ras + ' 0 0 1 ' + pt(ra, c + prof[K][1]);
      for (i = K - 1; i >= 0; i--) d += 'L' + pt(prof[i][0], c + prof[i][1]);
      if (rb > rf) d += 'L' + pt(rf, c + psiR);
    }
    return d + 'A' + rfs + ' 0 0 1 ' + pt(rf, -psiR) + 'Z';
  }
  // n spoke windows between hub (ri) and rim (ro); straight spokes of half-width w; corners rounded by c.
  function windowsPath(n, ri, ro, w, c, rot) {
    var d = '', ai = Math.atan2(w, Math.sqrt(ri * ri - w * w)), ao = Math.atan2(w, Math.sqrt(ro * ro - w * w));
    var ci = c / ri, co = c / ro, ris = f2(ri) + ' ' + f2(ri), ros = f2(ro) + ' ' + f2(ro);
    for (var k = 0; k < n; k++) {
      var s1 = rot + k * TAU / n, s2 = s1 + TAU / n;
      var u1x = Math.cos(s1), u1y = Math.sin(s1), u2x = Math.cos(s2), u2y = Math.sin(s2);
      var Ax = ri * Math.cos(s1 + ai), Ay = ri * Math.sin(s1 + ai), Bx = ro * Math.cos(s1 + ao), By = ro * Math.sin(s1 + ao);
      var Cx = ro * Math.cos(s2 - ao), Cy = ro * Math.sin(s2 - ao), Dx = ri * Math.cos(s2 - ai), Dy = ri * Math.sin(s2 - ai);
      d += 'M' + xy(Ax + c * u1x, Ay + c * u1y) + 'L' + xy(Bx - c * u1x, By - c * u1y) +
        'Q' + xy(Bx, By) + ' ' + pt(ro, s1 + ao + co) + 'A' + ros + ' 0 0 1 ' + pt(ro, s2 - ao - co) +
        'Q' + xy(Cx, Cy) + ' ' + xy(Cx - c * u2x, Cy - c * u2y) + 'L' + xy(Dx + c * u2x, Dy + c * u2y) +
        'Q' + xy(Dx, Dy) + ' ' + pt(ri, s2 - ai - ci) + 'A' + ris + ' 0 0 0 ' + pt(ri, s1 + ai + ci) +
        'Q' + xy(Ax, Ay) + ' ' + xy(Ax + c * u1x, Ay + c * u1y) + 'Z';
    }
    return d;
  }
  function circlePath(r) {
    var s = f2(r) + ' ' + f2(r);
    return 'M' + xy(r, 0) + 'A' + s + ' 0 1 0 ' + xy(-r, 0) + 'A' + s + ' 0 1 0 ' + xy(r, 0) + 'Z';
  }
  function arcPath(r, a1, a2) { return 'M' + pt(r, a1 / DEG) + 'A' + f2(r) + ' ' + f2(r) + ' 0 0 1 ' + pt(r, a2 / DEG); }

  function config(small) {
    var c = small ? {
      R: 13, win: 0, bore: 3, hub: 0, rim: 7.4, light: 9, pull: 0, tb: 0.2,
      shaft: 0.9, vend: 0.62, park: 0   // mobile: the route ends in the gutter, not at the button
    } : {
      R: 24, win: 5, ri: 7.6, ro: 15.4, sw: 1.9, sc: 1.6, bore: 4.2, hub: 7.6, rim: 15.4, light: 17.5, pull: 6, tb: 0.3,
      shaft: 1.3, vend: 0.5, park: 1
    };
    var m = 2 * c.R / NM;
    c.ra = c.R + ADD * m; c.rf = c.R - DED * m;
    return c;
  }

  window.Travellers.register('zebatka', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small), hostSize = small ? 48 : 176;

    // ---------- main gear (in the host) ----------
    var svg = make('svg', { 'class': 'zb', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    svg.setAttribute('viewBox', (-hostSize / 2) + ' ' + (-hostSize / 2) + ' ' + hostSize + ' ' + hostSize);
    make('style', null, svg).textContent = CSS;
    function tf(node, root) { var t = (root || svg).createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var posG = make('g', null, svg), posT = tf(posG), scT = tf(posG);
    var rotG = make('g', null, posG), rotT = tf(rotG);
    var lightG = make('g', null, posG);
    host.appendChild(svg);

    var wX = NaN, wY = NaN, wR = NaN, wS = NaN, wK = NaN, wDark = null;
    function buildMain() {
      while (rotG.firstChild) rotG.removeChild(rotG.firstChild);
      while (lightG.firstChild) lightG.removeChild(lightG.firstChild);
      var outline = gearOutline(NM, C.R, C.tb), holes = circlePath(C.bore);
      if (C.win) holes = windowsPath(C.win, C.ri, C.ro, C.sw, C.sc, -PI / 2) + holes;
      make('path', { 'class': 'zb-face', d: outline + holes }, rotG);
      // flat second tone: the rim (spoke windows to tooth root) and the hub boss; spokes and teeth stay light
      make('path', { 'class': 'zb-tone', d: circlePath(C.rf) + circlePath(C.rim) }, rotG);
      if (C.hub) make('path', { 'class': 'zb-tone', d: circlePath(C.hub) + circlePath(C.bore) }, rotG);
      make('path', { 'class': 'zb-hole', d: holes }, rotG);
      make('path', { 'class': 'zb-edge', d: outline }, rotG);
      if (C.light) {
        make('path', { 'class': 'zb-hi', d: arcPath(C.light, 198, 282) }, lightG);
        make('path', { 'class': 'zb-sh', d: arcPath(C.light, 18, 102) }, lightG);
      }
      if (small) svg.classList.add('zb-sm'); else svg.classList.remove('zb-sm');
      wX = wY = wR = wS = wK = NaN;
    }

    // ---------- route samples ----------
    var N = 0, SX = null, SY = null, TX = null, TY = null, total = 0, sstep = SSTEP;
    var Q = { x: 0, y: 0, tx: 0, ty: 1 }, P0 = { x: 0, y: 0, tx: 0, ty: 1 }, P1 = { x: 0, y: 0, tx: 0, ty: 1 };
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
    // route length (1 px scan) of the point closest to x,y within [lo,hi]
    function closest(x, y, lo, hi) {
      var best = lo, bd = 1e18;
      for (var u = lo; u <= hi; u += 1) {
        sampleAt(u, Q); var dx = Q.x - x, dy = Q.y - y, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = u; }
      }
      return best;
    }

    // ---------- pinions at the section marks (in the layer) ----------
    var lroot = null, gears = [];
    function dropStations() {
      try { if (lroot && lroot.parentNode) lroot.parentNode.removeChild(lroot); } catch (e) {}
      lroot = null; gears = [];
    }
    function buildStations() {
      dropStations();
      if (N < 2 || !env.layer) return;
      var marks = env.marks ? env.marks() : null;
      if (!marks || marks.length < 2) return;
      var root = env.routeSvg || env.layer.ownerSVGElement;
      var m = 2 * C.R / NM, Rs = NP * m / 2, raS = Rs + ADD * m, D = C.R + Rs;
      var W = (env.main && env.main.clientWidth) || 1e6, thr = C.ra + raS + 0.6;
      var shape = gearOutline(NP, Rs, C.tb), lastL = -1e9;   // solid web: one pin, no bore ring (no bullseye)
      lroot = make('g', { 'class': 'zb-st' + (small ? ' zb-sm' : '') });
      // the last mark is the end of the line (contact button): no pinion there
      for (var i = 0; i < marks.length - 1; i++) {
        var L = +marks[i].len || 0;
        if (L - lastL < GAP) continue;
        sampleAt(L, Q);
        // screen-right of travel when heading down: there the rolling gear drives the pinion hardest
        var qx = Q.ty, qy = -Q.tx, gx = Q.x + qx * D, gy = Q.y + qy * D;
        if (gx + raS > W - 2 || gx - raS < 2) { gx = Q.x - qx * D; gy = Q.y - qy * D; }
        lastL = L;
        // on a curve the closest approach is not at L: settle the pinion so it is exactly the working distance D
        var lo = Math.max(0, L - 160), hi = Math.min(total, L + 160), uc = L, dx, dy, dl;
        for (var it = 0; it < 3; it++) {
          uc = closest(gx, gy, lo, hi);
          sampleAt(uc, Q); dx = gx - Q.x; dy = gy - Q.y; dl = Math.sqrt(dx * dx + dy * dy);
          if (dl > 1e-6) { gx = Q.x + dx / dl * D; gy = Q.y + dy / dl * D; }
        }
        var a = uc, b = uc, u;
        lo = Math.max(0, uc - 200); hi = Math.min(total, uc + 200);
        for (u = uc; u >= lo; u -= 1) { sampleAt(u, Q); dx = Q.x - gx; dy = Q.y - gy; if (dx * dx + dy * dy > thr * thr) break; a = u; }
        for (u = uc; u <= hi; u += 1) { sampleAt(u, Q); dx = Q.x - gx; dy = Q.y - gy; if (dx * dx + dy * dy > thr * thr) break; b = u; }
        var g = make('g', null, lroot), tT = tf(g, root);
        tT.setTranslate(f2(gx), f2(gy));
        var rg = make('g', null, g), tR = tf(rg, root);
        make('path', { 'class': 'zb-sf', d: shape }, rg);
        make('circle', { 'class': 'zb-sx', r: C.shaft }, g);
        gears.push({ x: gx, y: gy, L: uc, a: a, b: b, t: tR, c: NaN, w: NaN });
      }
      env.layer.appendChild(lroot);
    }
    // pinion angle (rad) that meshes tooth-into-gap with the main gear at route length c, main angle thm (rad)
    function meshAngle(g, c, thm) {
      sampleAt(c, Q);
      var phi = Math.atan2(g.y - Q.y, g.x - Q.x);
      return phi + PI - PI / NP + RATIO * (phi - thm);
    }
    function updateGears(len) {
      for (var i = 0; i < gears.length; i++) {
        var g = gears[i], c = len < g.a ? g.a : len > g.b ? g.b : len;
        if (reduce) c = g.L;
        if (c === g.c) continue;
        g.c = c;
        var deg = (meshAngle(g, c, reduce ? 0 : c / C.R) * DEG) % 360;
        if (!(Math.abs(wrap(deg - g.w)) <= 0.15)) { g.t.setRotate(deg, 0, 0); g.w = deg; }
      }
    }

    // ---------- end of the line ----------
    // The host scales the drop by k (down to .26). The gear counter-scales so it looks v (down to C.vend),
    // strokes stay >= ~1 px, and it stops rolling CLEAR px short of the end point (the contact button's edge).
    var EZ = { k: 1, v: 1, lenE: 0, settle: 0, shx: 0, shy: 0 };
    function endZone(len, tot) {
      EZ.k = 1; EZ.v = 1; EZ.lenE = len; EZ.settle = 0; EZ.shx = 0; EZ.shy = 0;
      if (!(tot > hostSize) || N < 2) return;
      var st = (len - (tot - hostSize)) / hostSize;
      if (!(st > 0)) return;
      if (st > 1) st = 1;
      EZ.settle = st; EZ.k = 1 - K_END * st; EZ.v = 1 - (1 - C.vend) * st;
      var park = tot - (C.ra * EZ.v + CLEAR);
      if (C.park && len > park) {
        EZ.lenE = park;
        sampleAt(park, P1); sampleAt(len, Q);
        EZ.shx = (P1.x - Q.x) / EZ.k; EZ.shy = (P1.y - Q.y) / EZ.k;
      }
    }
    function strokeComp(v) {
      var zk = v < 0.92 ? f2(0.92 / v) : 1;   // outline: desktop 1.2*.92 = 1.1 px, mobile 1.1*.92 = 1.01 px at the end
      if (zk !== wK) { svg.style.setProperty('--zk', String(zk)); wK = zk; }
    }

    // ---------- main gear pose ----------
    var ox = { x: 0, v: 0 }, oy = { x: 0, v: 0 };
    function renderMain(rot, sx, sy, sc, eps) {
      if (!(Math.abs(sx - wX) <= eps && Math.abs(sy - wY) <= eps)) { posT.setTranslate(sx, sy); wX = sx; wY = sy; }
      if (!(Math.abs(sc - wS) <= 0.003)) { scT.setScale(sc, sc); wS = sc; }
      if (!(Math.abs(wrap(rot - wR)) <= eps)) { rotT.setRotate(rot, 0, 0); wR = rot; }
    }

    // ---------- relayout ----------
    var relayoutTimer = 0, built = false, geomDirty = true, sleeping = false, lastLen = NaN, lastPx = null, lastPy = null;
    function rebuild() {
      relayoutTimer = 0;
      try {
        built = buildSamples();
        buildStations();
      } catch (e) { dropStations(); }
      geomDirty = true; sleeping = false;
    }

    buildMain();
    renderMain(0, 0, 0, 1, 0);

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2, nextSmall = size < 100;
          hostSize = size;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if (nextSmall !== small) {
            small = nextSmall; C = config(small); buildMain();
            ox.x = ox.v = oy.x = oy.v = 0; N = 0; built = false;
          }
          geomDirty = true; sleeping = false;
        } catch (e) {}
      },
      relayout: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        if (N < 2) rebuild(); else relayoutTimer = setTimeout(rebuild, 120);
      },
      frame: function (t, s) {
        try {
          if (!built && !relayoutTimer) rebuild();
          var dk = !!s.dark;
          if (dk !== wDark) { wDark = dk; if (dk) svg.classList.add('zb-dk'); else svg.classList.remove('zb-dk'); }
          var len = s.len || 0, tot = s.total || total;
          var moved = geomDirty || !(Math.abs(len - lastLen) <= 0.02);
          if (reduce) {
            if (moved) {
              endZone(len, tot); strokeComp(EZ.v);
              renderMain(0, EZ.shx, EZ.shy, EZ.v / EZ.k, 0.01);
              updateGears(len); lastLen = len; geomDirty = false;
            }
            return;
          }
          var px = small || s.px == null ? null : s.px, py = small || s.py == null ? null : s.py;
          if (sleeping && !moved && px === lastPx && py === lastPy) return;
          lastPx = px; lastPy = py;
          endZone(len, tot);

          var dt = Math.min(s.dt || 16.7, 100) / 1000, tx = 0, ty = 0;
          if (px !== null && py !== null && C.pull) {
            var d = Math.sqrt(px * px + py * py);
            if (d < R_OUT && d > 0.5) {
              // no pull while a pinion is close, so the teeth stay in true mesh
              var near = 0;
              for (var i = 0; i < gears.length; i++) {
                var dl = Math.abs(len - gears[i].L);
                if (dl < 110) { var nn = smooth(110, 50, dl); if (nn > near) near = nn; }
              }
              var pull = C.pull * smooth(R_OUT, R_IN, d) * (1 - near) * (1 - EZ.settle);
              if (pull > d * 0.5) pull = d * 0.5;
              tx = px / d * pull; ty = py / d * pull;
            }
          }
          step(ox, tx, W_MAG, dt); step(oy, ty, W_MAG, dt);
          if (moved) { updateGears(len); lastLen = len; geomDirty = false; }

          var settled = Math.abs(ox.x - tx) < 0.03 && Math.abs(ox.v) < 0.05 && Math.abs(oy.x - ty) < 0.03 && Math.abs(oy.v) < 0.05;
          if (!moved && settled) { ox.x = tx; ox.v = 0; oy.x = ty; oy.v = 0; }
          // rolling: a pull along the route turns the gear as if it had travelled that far (route's own forward
          // tangent, so reversing the scroll direction never flips the coupling)
          sampleAt(EZ.lenE, P0);
          var rot = ((EZ.lenE + ox.x * P0.tx + oy.x * P0.ty) / C.R * DEG) % 360;
          strokeComp(EZ.v);
          var sx = ox.x + EZ.shx, sy = oy.x + EZ.shy, sc = EZ.v / EZ.k;
          if (!moved && settled) { renderMain(rot, sx, sy, sc, 0.01); sleeping = true; }
          else { sleeping = false; renderMain(rot, sx, sy, sc, 0.2); }
        } catch (e) {}
      },
      destroy: function () {
        if (relayoutTimer) clearTimeout(relayoutTimer);
        relayoutTimer = 0; gears = []; lroot = null;
      }
    };
  });
})(window, document);
