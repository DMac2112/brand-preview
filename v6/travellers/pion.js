/* Pion: a mason's plumb bob (pion murarski) hanging from the route.
   The flat slider plate sits on the route point (the route above is the cord). The cord drops through it to a
   turned-steel bob: knurled cap, chamfered body with lathe grooves, cone with a hardened tip.
   The plate is exactly as wide as the bob, the way a mason checks a wall: when the bob hangs still, its shoulders
   line up with the plate's edges, and two dotted guides show that it is plumb ("w pionie").
   Physics: a damped pendulum (a bob calmed in water) driven by the pivot's real acceleration along the route,
   plus a little drag so it trails while moving. The cord stretches slightly on hard stops.
   Below the plate the route is knocked out in the page colour until it passes behind the bob, so it reads as one
   object: route (cord) -> plate -> cord -> bob, with the route ahead resuming underneath.
   Mouse within ~240 px: the steel bob is pulled toward the pointer like a magnet, then swings back and settles.
   SVG only, writes through SVGTransform objects. Idle (settled, nothing changed) = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg', DEG = 180 / Math.PI, RAD = Math.PI / 180;

  // geometry in desktop CSS px; pivot (route point) at 0,0; y down
  var HW = 9, CAP_HW = 4.6, CAP_TOP = 14, CAP_BOT = 20, CH_HW = 6.2, BODY_TOP = 22.5, BODY_BOT = 38, TIP = 56, TIP_RING = 51.5;
  var SL_H = 2.6, L_COM = 34;
  var SIL = 'M-3.2 14H3.2Q4.6 14 4.6 15.4V20H6.2L9 22.5V38L0 56L-9 38V22.5L-6.2 20H-4.6V15.4Q-4.6 14 -3.2 14Z';
  // knock-out under the cord: from the plate's underside to the bob's shoulders, so the object reads as one piece:
  // route (the cord above) -> plate -> cord -> bob, and the route ahead resumes below it
  var SKIRT = 'M-8.4 2.6H8.4L7 12.6V20.6H-7V12.6Z';

  // physics (rad, px, s)
  var W = 6.6, ZETA = 0.5;                    // pendulum: period ~0.95 s, one soft, calm overshoot
  var KA = 0.0016, KV = 0.006;                // pivot acceleration / drag coupling
  var WS = 15, ZS = 0.6, KE = 0.12;           // cord stretch spring
  var E_MIN = -2.5, E_MAX = 5, TH_MAX = 1.1;
  var MAG = 34, MAGR = 500, R_OUT = 250, R_FULL = 50, W_MAG = 8;
  var TAU_V = 0.06, VMAX = 2600, AMAX = 30000, JUMP = 500, H = 1 / 120;

  var CSS =
    '.pn{overflow:visible}' +
    '.pn .pn-h{fill:var(--bg);stroke:var(--bg);stroke-width:4;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '.pn .pn-s{fill:none;stroke:var(--steel);stroke-width:1.5;stroke-linecap:round;vector-effect:non-scaling-stroke}' +
    '.pn .pn-k{fill:var(--bg);stroke:none}' +
    '.pn .pn-o{fill:none;stroke-width:.85;stroke-linejoin:miter;vector-effect:non-scaling-stroke}' +
    '.pn .pn-g{fill:none;stroke:var(--steel);stroke-width:1;stroke-dasharray:1 2;vector-effect:non-scaling-stroke;' +
      'opacity:0;transition:opacity .12s ease-out}' +
    '.pn.pn-plumb .pn-g{opacity:1;transition:opacity .5s ease-in .1s}' +
    '.pn.pn-sm .pn-h{stroke-width:3}.pn.pn-sm .pn-o{stroke-width:.8}.pn.pn-sm .pn-s{stroke-width:1.2}';

  function make(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
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
  // light on a turned steel surface by angle around the axis (-90 left rim, 0 facing us, 90 right rim):
  // broad light from the upper left, a sharp lathe highlight, a faint second band, a reflected rim on the right
  function shade(phi) {
    var d = Math.cos((phi + 30) * RAD); d = d > 0 ? Math.pow(d, 1.4) : 0;
    var s1 = Math.exp(-Math.pow((phi + 22) / 7, 2));
    var s2 = 0.22 * Math.exp(-Math.pow((phi - 38) / 5, 2));
    var rim = 0.45 * Math.exp(-Math.pow((phi - 82) / 7, 2));
    var I = 0.05 + 0.5 * d + 0.5 * s1 + s2 + rim;
    return I < 0 ? 0 : I > 1 ? 1 : I;
  }

  window.Travellers.register('pion', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, K = small ? 0.55 : 1;
    var root = document.documentElement;

    var svg = make('svg', { 'class': 'pn', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    var s0 = small ? 48 : 176;
    svg.setAttribute('viewBox', (-s0 / 2) + ' ' + (-s0 / 2) + ' ' + s0 + ' ' + s0);
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    var uid = 'pn' + Math.floor(Math.random() * 1e9).toString(36);
    var defs = make('defs', null, svg);
    make('path', { d: SIL }, make('clipPath', { id: uid + 'c' }, defs));
    var gBody = make('linearGradient', { id: uid + 'b', gradientUnits: 'userSpaceOnUse', x1: -HW, y1: 0, x2: HW, y2: 0 }, defs);
    var gCap = make('linearGradient', { id: uid + 'k', gradientUnits: 'userSpaceOnUse', x1: -CAP_HW, y1: 0, x2: CAP_HW, y2: 0 }, defs);
    var bodyStops = [], capStops = [], N = 36, i, phi;
    for (i = 0; i <= N; i++) {
      phi = -90 + 180 * i / N;
      var off = ((Math.sin(phi * RAD) + 1) / 2).toFixed(4);
      bodyStops.push({ n: make('stop', { offset: off }, gBody), I: shade(phi) });
      capStops.push({ n: make('stop', { offset: off }, gCap), I: 0.22 + 0.62 * shade(phi) });
    }

    var rig = make('g', null, svg), rigT = tf(rig);
    make('path', { 'class': 'pn-g', d: 'M-9 4.6V21M9 4.6V21' }, rig);                         // plumb guides
    make('rect', { 'class': 'pn-h', x: -HW, y: -SL_H, width: HW * 2, height: SL_H * 2, rx: 0.6 }, rig);   // plate halo

    var swing = make('g', null, rig), swingT = tf(swing);
    make('path', { 'class': 'pn-k', d: SKIRT }, swing);
    var cord = make('line', { 'class': 'pn-s', x1: 0, y1: 0, x2: 0, y2: CAP_TOP }, swing);
    var bob = make('g', null, swing), bobT = tf(bob);
    make('path', { 'class': 'pn-h', d: SIL }, bob);
    var fills = make('g', { 'clip-path': 'url(#' + uid + 'c)' }, bob);
    make('rect', { x: -HW - 0.5, y: 19.8, width: HW * 2 + 1, height: BODY_BOT - 19.5, fill: 'url(#' + uid + 'b)' }, fills);
    // cone: slices that converge on the tip, so the light bands do too
    var cone = [], CN = 36;
    for (i = 0; i < CN; i++) {
      var p0 = -90 + 180 * i / CN, p1 = -90 + 180 * (i + 1) / CN;
      var xa = HW * Math.sin(p0 * RAD) - 0.12, xb = HW * Math.sin(p1 * RAD) + 0.12;
      cone.push({ n: make('polygon', { points: xa.toFixed(3) + ',' + (BODY_BOT - 0.3) + ' ' + xb.toFixed(3) + ',' + (BODY_BOT - 0.3) + ' 0,' + TIP }, fills),
        I: 0.88 * shade((p0 + p1) / 2) });
    }
    var lo = [], hi = [];
    function loN(n, op) { n.setAttribute('fill-opacity', op); lo.push(n); return n; }
    function hiN(n, op) { n.setAttribute('fill-opacity', op); hi.push(n); return n; }
    // hardened tip
    loN(make('polygon', { points: '-2.25,' + TIP_RING + ' 2.25,' + TIP_RING + ' 0,' + TIP }, fills), 0.42);
    loN(make('rect', { x: -2.7, y: TIP_RING - 0.25, width: 5.4, height: 0.5 }, fills), 0.8);
    // shoulders and lathe grooves
    hiN(make('polygon', { points: -CH_HW + ',' + CAP_BOT + ' ' + CH_HW + ',' + CAP_BOT + ' ' + HW + ',' + BODY_TOP + ' ' + -HW + ',' + BODY_TOP }, fills), 0.42);
    loN(make('rect', { x: -HW, y: BODY_TOP - 0.2, width: HW * 2, height: 0.45 }, fills), 0.35);
    loN(make('rect', { x: -HW, y: 33.5, width: HW * 2, height: 0.55 }, fills), 0.55);
    hiN(make('rect', { x: -HW, y: 34.05, width: HW * 2, height: 0.45 }, fills), 0.5);
    loN(make('rect', { x: -HW, y: 35.2, width: HW * 2, height: 0.55 }, fills), 0.55);
    hiN(make('rect', { x: -HW, y: 35.75, width: HW * 2, height: 0.45 }, fills), 0.5);
    loN(make('rect', { x: -HW, y: BODY_BOT - 0.25, width: HW * 2, height: 0.5 }, fills), 0.5);
    hiN(make('rect', { x: -HW, y: BODY_BOT + 0.25, width: HW * 2, height: 0.4 }, fills), 0.3);
    // knurled cap: straight knurl, lines bunch toward the edges like on a real cylinder
    make('rect', { x: -CAP_HW - 0.5, y: CAP_TOP - 0.5, width: CAP_HW * 2 + 1, height: CAP_BOT - CAP_TOP + 0.6, fill: 'url(#' + uid + 'k)' }, fills);
    for (phi = -75; phi <= 75; phi += 15) {
      var kx = CAP_HW * Math.sin(phi * RAD), kw = 0.5 * Math.cos(phi * RAD) + 0.12;
      loN(make('rect', { x: (kx - kw / 2).toFixed(3), y: 15.3, width: kw.toFixed(3), height: 3.7 }, fills), 0.6);
    }
    hiN(make('rect', { x: -CAP_HW, y: 19.25, width: CAP_HW * 2, height: 0.4 }, fills), 0.35);
    var outline = make('path', { 'class': 'pn-o', d: SIL }, bob);

    // slider plate on the route point; the cord runs through its centre
    var plate = make('rect', { x: -HW, y: -SL_H, width: HW * 2, height: SL_H * 2, rx: 0.6 }, rig);
    hiN(make('rect', { x: -HW + 0.6, y: -SL_H + 0.55, width: HW * 2 - 1.2, height: 0.6 }, rig), 0.8);
    loN(make('rect', { x: -HW + 0.6, y: SL_H - 1.1, width: HW * 2 - 1.2, height: 0.55 }, rig), 0.35);
    loN(make('rect', { x: -0.35, y: -SL_H, width: 0.7, height: SL_H * 2 }, rig), 0.5);
    var plateLine = make('rect', { 'class': 'pn-o', x: -HW, y: -SL_H, width: HW * 2, height: SL_H * 2, rx: 0.6 }, rig);
    host.appendChild(svg);

    // colours: only greys mixed from the page's own --ink and --bg; the metal never inverts in dark mode
    var darkNow = null;
    function recolor() {
      try {
        var dark = root.getAttribute('data-theme') === 'dark', cs = getComputedStyle(root);
        var ink = parse(cs.getPropertyValue('--ink'), dark ? [236, 238, 240] : [23, 25, 28]);
        var bg = parse(cs.getPropertyValue('--bg'), dark ? [17, 19, 21] : [247, 248, 249]);
        var l = dark ? lerp3(bg, ink, 0.17) : lerp3(ink, bg, 0.22), h = dark ? ink : bg;
        var tone = function (I) { return css(lerp3(l, h, I)); }, j;
        for (j = 0; j < bodyStops.length; j++) {
          bodyStops[j].n.setAttribute('stop-color', tone(bodyStops[j].I));
          capStops[j].n.setAttribute('stop-color', tone(capStops[j].I));
        }
        for (j = 0; j < cone.length; j++) cone[j].n.setAttribute('fill', tone(cone[j].I));
        var loC = tone(0), hiC = tone(1), line = css(dark ? lerp3(bg, ink, 0.45) : lerp3(ink, bg, 0.12));
        for (j = 0; j < lo.length; j++) lo[j].setAttribute('fill', loC);
        for (j = 0; j < hi.length; j++) hi[j].setAttribute('fill', hiC);
        plate.setAttribute('fill', tone(0.62));
        outline.style.stroke = line; plateLine.style.stroke = line;
        darkNow = dark;
      } catch (e) {}
    }
    var mo = null;
    try { mo = new MutationObserver(function () { if ((root.getAttribute('data-theme') === 'dark') !== darkNow) recolor(); }); mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}

    // state
    var th = 0, om = 0, e = 0, ev = 0, fvx = 0, fvy = 0, mag = { x: 0, v: 0 }, mpx = 0, mpy = 0;
    var lastLen = null, lastPx = null, lastPy = null, sleeping = false, plumb = false;
    var wDeg = NaN, wE = NaN;

    function setPlumb(on) { if (on !== plumb) { plumb = on; if (on) svg.classList.add('pn-plumb'); else svg.classList.remove('pn-plumb'); } }
    function render(force) {
      var deg = th * DEG;
      // physics angle th is + toward screen right; SVG rotate(+a) carries a hanging point to the left, hence the minus
      if (force || Math.abs(deg - wDeg) > 0.2) { swingT.setRotate(-deg, 0, 0); wDeg = deg; }
      if (force || Math.abs(e - wE) > 0.2) { bobT.setTranslate(0, e); cord.y2.baseVal.value = CAP_TOP + e; wE = e; }
      var ad = deg < 0 ? -deg : deg, ao = om < 0 ? -om : om;
      if (!plumb && ad < 0.25 && ao < 0.03 && e < 0.4 && e > -0.4) setPlumb(true);
      else if (plumb && (ad > 0.6 || ao > 0.15)) setPlumb(false);
    }
    function reset() {
      th = om = e = ev = fvx = fvy = 0; mag.x = mag.v = 0; sleeping = false;
      render(true); setPlumb(true);
    }
    function scale(sm) {
      small = sm; K = sm ? 0.55 : 1;
      rigT.setScale(K, K);
      if (sm) svg.classList.add('pn-sm'); else svg.classList.remove('pn-sm');
    }

    recolor(); scale(small); reset();

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || (small ? 48 : 176), half = size / 2;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          if ((size < 100) !== small) { scale(size < 100); reset(); }
        } catch (err) {}
      },
      relayout: function () {},
      frame: function (t, s) {
        if (!!s.dark !== darkNow) recolor();
        if (reduce) return;                                   // static, hanging plumb

        var px = small || s.px === undefined ? null : s.px, py = small || s.py === undefined ? null : s.py;
        var len = s.len || 0;
        if (sleeping && len === lastLen && px === lastPx && py === lastPy) return;
        lastPx = px; lastPy = py;

        var dt = Math.min(Math.max(s.dt || 16.7, 1), 100) / 1000;
        // pivot velocity in page px/s from travel along the route (tx,ty = unit direction of travel)
        var vx = 0, vy = 0, dLen = lastLen === null ? 0 : len - lastLen, adl = dLen < 0 ? -dLen : dLen;
        lastLen = len;
        if (adl > JUMP) { fvx = fvy = 0; }                      // a cut/jump, not a move
        else if (adl > 0) { var sp = Math.min(adl / dt, VMAX); vx = sp * (s.tx || 0); vy = sp * (s.ty || 0); }
        var a = 1 - Math.exp(-dt / TAU_V), nvx = fvx + (vx - fvx) * a, nvy = fvy + (vy - fvy) * a;
        var ax = (nvx - fvx) / dt, ay = (nvy - fvy) / dt;
        ax = ax > AMAX ? AMAX : ax < -AMAX ? -AMAX : ax; ay = ay > AMAX ? AMAX : ay < -AMAX ? -AMAX : ay;
        fvx = nvx; fvy = nvy;

        // magnet strength from the pointer's distance to the bob (critically damped, so it eases in and out)
        var mt = 0, sn = Math.sin(th), cs = Math.cos(th), dx, dy, dist;
        if (px !== null && py !== null) {
          mpx = px; mpy = py;
          dx = px - L_COM * K * sn; dy = py - L_COM * K * cs; dist = Math.sqrt(dx * dx + dy * dy);
          mt = smooth(R_OUT, R_FULL, dist);
        }
        step(mag, mt, W_MAG, dt);
        var mg = mag.x > 0.0005 ? mag.x : 0;

        // effective gravity: a pivot accelerating or moving downward lightens the bob (and upward makes it heavier);
        // clamped so a violent flick can never tip the pendulum over
        var R = W * W - KA * ay - KV * fvy, R0 = W * W;
        R = R < 0.35 * R0 ? 0.35 * R0 : R > 2.5 * R0 ? 2.5 * R0 : R;
        var n = Math.ceil(dt / H), h = dt / n, acc = 0, er = 0;
        for (var k = 0; k < n; k++) {
          sn = Math.sin(th); cs = Math.cos(th);
          acc = -R * sn - 2 * ZETA * W * om - (KA * ax + KV * fvx) * cs;
          er = -WS * WS * e - 2 * ZS * WS * ev - KE * (ax * sn + ay * cs);
          if (mg) {
            var Lk = (L_COM + e) * K;
            dx = mpx - Lk * sn; dy = mpy - Lk * cs; dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
            acc += MAG * mg * (dx * cs - dy * sn) / dist;
            er += MAGR * mg * (dx * sn + dy * cs) / dist;
          }
          om += acc * h; th += om * h;
          if (th > TH_MAX) { th = TH_MAX; if (om > 0) om = 0; } else if (th < -TH_MAX) { th = -TH_MAX; if (om < 0) om = 0; }
          ev += er * h; e += ev * h;
          if (e > E_MAX) { e = E_MAX; if (ev > 0) ev = 0; } else if (e < E_MIN) { e = E_MIN; if (ev < 0) ev = 0; }
        }

        var still = (om < 0 ? -om : om) < 0.004 && (ev < 0 ? -ev : ev) < 0.03 &&
          (acc < 0 ? -acc : acc) < 0.03 && (er < 0 ? -er : er) < 0.6 &&
          (fvx < 0 ? -fvx : fvx) < 0.5 && (fvy < 0 ? -fvy : fvy) < 0.5 &&
          Math.abs(mag.x - mt) < 0.002 && Math.abs(mag.v) < 0.01;
        if (still) {
          if (mt === 0) { th = om = e = ev = fvx = fvy = 0; mag.x = mag.v = 0; }   // hangs exactly plumb
          sleeping = true; render(true);
        } else { sleeping = false; render(false); }
      },
      destroy: function () { try { if (mo) mo.disconnect(); } catch (e) {} }
    };
  });
})(window, document);
