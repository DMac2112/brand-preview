/* Oś czasu — a video-editor playhead riding the route (content creation / video).
   The route is treated as the timeline ruler, so the playhead stands perpendicular to it: a small ink head
   (inverted pentagon) sits on the route and its hairline runs off to one side, like a playhead crossing the tracks.
   On the page's final horizontal stretch it turns into the familiar upright playhead.
   - Ruler: a short window of frame ticks (every 5 frames, a longer one every second) is drawn along the real route
     around the head and fades out; the ticks are anchored to the route, so scrolling scrubs them under the head.
   - Timecode HH:MM:SS:FF at 25 fps derived from route length (2 px = 1 frame, 50 px = 1 s). Leading zero fields are
     dimmed (Final Cut style). Fixed digit slots, page font, no monospace.
   - Keyframes: a diamond on the route at the first mark of every section; it fills in once the playhead has passed.
   - Pointer within ~240 px: a ghost "skimmer" (outlined head + dotted line) slides along the route to the point
     nearest the pointer and fades in; it slides back into the playhead when the pointer leaves.
   SVG only. Per frame: SVGTransform setters + nodeValue swaps from constant tables (no strings, no allocations).
   Idle (no scroll, pointer unchanged, springs settled) = early return. Reduced motion: no springs, no ghost; the
   static playhead is updated on scroll from the same scroll->route mapping the page uses. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';

  var STEP = 4;                 // route sample spacing for lookups (px)
  var PXF = 2, FPS = 25;        // 2 px of route = 1 frame; 25 fps -> 50 px = 1 s
  var R_IN = 240, R_FULL = 130; // pointer: starts to respond at 240 px, full at 130 px
  var W_ROT = 15, W_GHOST = 12, W_FADE = 11; // critically damped spring speeds (rad/s)
  var DEG = 180 / Math.PI, TAU = Math.PI * 2;
  var DIG = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  var uid = 0;

  var CSS =
    '.ocz{overflow:visible}' +
    '.ocz .ocz-mi,.ocz .ocz-ma{fill:none;stroke:var(--steel);stroke-dashoffset:.5}' +
    '.ocz .ocz-mi{stroke-dasharray:1 9;opacity:.7}' +
    '.ocz .ocz-ma{stroke-dasharray:1 49}' +
    '.ocz .ocz-f{fill:var(--ink);stroke:var(--bg);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke}' +
    '.ocz .ocz-l{stroke:var(--ink);stroke-width:1.25;stroke-linecap:butt}' +
    '.ocz .ocz-gf{fill:var(--bg);stroke:var(--steel);stroke-width:1;stroke-linejoin:round}' +
    '.ocz .ocz-gl{stroke:var(--steel);stroke-width:1;stroke-dasharray:1.5 2;stroke-linecap:butt}' +
    '.ocz .ocz-tc{font-family:"Instrument Sans",Arial,sans-serif;font-weight:500;font-variant-numeric:tabular-nums;' +
      'fill:var(--ink);stroke:var(--bg);stroke-width:3;stroke-linejoin:round;paint-order:stroke;text-anchor:middle}' +
    '.ocz .ocz-tc .ocz-dim{fill:var(--steel)}' +
    '.route .ocz-key{fill:var(--bg);stroke:var(--steel);stroke-width:1.25;stroke-linejoin:miter;transition:fill .3s ease,stroke .3s ease}' +
    '.route .ocz-key.ocz-on{fill:var(--ink);stroke:var(--ink)}';

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
  function abs(x) { return x < 0 ? -x : x; }

  function config(small) {
    return small ? {
      half: 24, w: 4, top: -5.5, sh: 0.5, tip: 4.5, r: 0.8, line: 9, gap: 3.5,
      fs: 8, fields: 2, dimmable: 1, rulerR: 21, minorW: 3, majorW: 6, key: 3.5, ghost: 0
    } : {
      half: 88, w: 6, top: -9, sh: 1, tip: 7, r: 1.3, line: 28, gap: 5,
      fs: 10, fields: 4, dimmable: 2, rulerR: 60, minorW: 4, majorW: 9, key: 4.5, ghost: 64
    };
  }
  function flagPath(C) {
    var w = C.w, t = C.top, r = C.r;
    return 'M' + (-w + r) + ' ' + t + 'H' + (w - r) + 'Q' + w + ' ' + t + ' ' + w + ' ' + (t + r) +
      'V' + C.sh + 'L0 ' + C.tip + 'L' + (-w) + ' ' + C.sh + 'V' + (t + r) + 'Q' + (-w) + ' ' + t + ' ' + (-w + r) + ' ' + t + 'Z';
  }

  window.Travellers.register('os-czasu', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small);

    // ---- route samples (filled in relayout) ----
    var N = 0, SX = null, SY = null, total = 0, sl = STEP, endY = 0, maxScroll = 1, routeD = '';
    var P = { x: 0, y: 0 }, A = { x: 0, y: 0 }, B = { x: 0, y: 0 };

    // ---- DOM ----
    var svg = make('svg', { 'class': 'ocz', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    host.appendChild(svg);
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    var minor, major, rulerT, phR, ghT, ghR, gh, tcT, tc;
    var slots = [], fieldNodes = [], digitCache = [], fv = [0, 0, 0, 0], TW = 0, TH = 0;
    var keys = [], keyLen = [], keyOn = [];

    function build() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var h = C.half, R = C.rulerR, id = 'ocz' + (++uid);
      svg.setAttribute('viewBox', (-h) + ' ' + (-h) + ' ' + (2 * h) + ' ' + (2 * h));
      make('style', null, svg).textContent = CSS;

      // ruler window: the route itself, dashed into frame ticks, faded out radially around the head
      var defs = make('defs', null, svg);
      var grad = make('radialGradient', { id: id + 'g', gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: R }, defs);
      make('stop', { offset: 0, 'stop-color': '#fff' }, grad);
      make('stop', { offset: 0.45, 'stop-color': '#fff' }, grad);
      make('stop', { offset: 1, 'stop-color': '#000' }, grad);
      var mask = make('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse', x: -R, y: -R, width: 2 * R, height: 2 * R }, defs);
      make('rect', { x: -R, y: -R, width: 2 * R, height: 2 * R, fill: 'url(#' + id + 'g)' }, mask);
      var wrap = make('g', { mask: 'url(#' + id + 'm)' }, svg);
      var ruler = make('g', null, wrap); rulerT = tf(ruler);
      minor = make('path', { 'class': 'ocz-mi', 'stroke-width': C.minorW }, ruler);
      major = make('path', { 'class': 'ocz-ma', 'stroke-width': C.majorW }, ruler);
      if (routeD) { minor.setAttribute('d', routeD); major.setAttribute('d', routeD); }

      var fd = flagPath(C);
      // ghost skimmer (under the playhead)
      gh = make('g', { 'class': 'ocz-gh' }, svg); ghT = tf(gh); ghR = tf(gh);
      make('path', { 'class': 'ocz-gf', d: fd }, gh);
      make('line', { 'class': 'ocz-gl', x1: 0, y1: C.tip + 1.5, x2: 0, y2: C.tip + C.line }, gh);
      gh.style.visibility = 'hidden'; gh.style.opacity = '0';

      // playhead: head then line (line drawn over the head's halo so they join cleanly)
      var ph = make('g', null, svg); phR = tf(ph);
      make('path', { 'class': 'ocz-f', d: fd }, ph);
      make('line', { 'class': 'ocz-l', x1: 0, y1: C.tip - 1, x2: 0, y2: C.tip + C.line }, ph);

      // timecode: one tspan per character in a fixed slot, so digits never shuffle
      tc = make('text', { 'class': 'ocz-tc', 'font-size': C.fs }, svg); tcT = tf(tc);
      var pattern = C.fields === 4 ? 'dd:dd:dd:dd' : 'dd:dd', dw = C.fs * 0.6, cw = C.fs * 0.34, i, x;
      TW = 0; for (i = 0; i < pattern.length; i++) TW += pattern.charAt(i) === 'd' ? dw : cw;
      TH = C.fs * 0.7;
      tc.setAttribute('y', (TH / 2).toFixed(2));
      slots = []; fieldNodes = []; digitCache = [];
      x = -TW / 2;
      for (i = 0; i < pattern.length; i++) {
        var isD = pattern.charAt(i) === 'd', w = isD ? dw : cw;
        var sp = make('tspan', { x: (x + w / 2).toFixed(2) }, tc);
        var tn = document.createTextNode(isD ? '0' : ':'); sp.appendChild(tn);
        slots.push(sp);
        if (isD) digitCache.push({ node: tn, v: 0 });
        x += w;
      }
      // field f owns slots 3f, 3f+1 (digits) and 3f+2 (the colon after it, if any)
      for (i = 0; i < C.fields; i++) fieldNodes.push([slots[3 * i], slots[3 * i + 1], slots[3 * i + 2] || null]);
      lastFrames = -1; lastDim = -1;
      wRx = wRy = wRot = wGx = wGy = wGr = wOp = NaN;
    }

    // ---- geometry ----
    function at(len, out) {
      if (!N) { out.x = 0; out.y = 0; return; }
      if (len <= 0) { out.x = SX[0]; out.y = SY[0]; return; }
      var f = len / sl, i = f | 0;
      if (i >= N - 1) { out.x = SX[N - 1]; out.y = SY[N - 1]; return; }
      var u = f - i;
      out.x = SX[i] + (SX[i + 1] - SX[i]) * u;
      out.y = SY[i] + (SY[i + 1] - SY[i]) * u;
    }
    var lastAngle = Math.PI / 2;
    function tangent(len) {
      at(len - 3, A); at(len + 3, B);
      var dx = B.x - A.x, dy = B.y - A.y;
      if (dx * dx + dy * dy > 1e-6) lastAngle = Math.atan2(dy, dx);
      return lastAngle;
    }
    function lenAtY(y) {               // mirrors the page's scroll -> route mapping (used in reduced motion)
      if (!N) return 0;
      if (y <= SY[0]) return 0;
      if (y >= endY) return total;
      var lo = 0, hi = N - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (SY[mid] < y) lo = mid; else hi = mid; }
      var f = (y - SY[lo]) / Math.max(0.001, SY[hi] - SY[lo]);
      return (lo + f) * sl;
    }
    function nearestOffset(len, qx, qy, G) {
      var a = len - G, b = len + G; if (a < 0) a = 0; if (b > total) b = total;
      var i0 = Math.floor(a / sl), i1 = Math.min(N - 1, Math.ceil(b / sl)), best = 1e18, bestL = len;
      for (var i = i0; i < i1; i++) {
        var x0 = SX[i], y0 = SY[i], dx = SX[i + 1] - x0, dy = SY[i + 1] - y0, L2 = dx * dx + dy * dy;
        var u = L2 > 0 ? ((qx - x0) * dx + (qy - y0) * dy) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
        var ex = x0 + dx * u - qx, ey = y0 + dy * u - qy, d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; bestL = (i + u) * sl; }
      }
      if (bestL < a) bestL = a; if (bestL > b) bestL = b;
      return bestL - len;
    }

    // ---- state ----
    var rot = { x: Math.PI / 2, v: 0 }, gd = { x: 0, v: 0 }, fade = { x: 0, v: 0 };
    var snap = true, sleeping = false, lastLen = NaN, lastPx = null, lastPy = null;
    var wRx = NaN, wRy = NaN, wRot = NaN, wGx = NaN, wGy = NaN, wGr = NaN, wOp = NaN;
    var lastFrames = -1, lastDim = -1;

    function setTime(frames) {
      if (frames === lastFrames) return;
      lastFrames = frames;
      var ff = frames % FPS, sec = (frames - ff) / FPS, ss = sec % 60, min = (sec - ss) / 60, mm = min % 60, hh = (min - mm) / 60;
      if (C.fields === 4) { fv[0] = hh % 100; fv[1] = mm; fv[2] = ss; fv[3] = ff; }
      else { fv[0] = min % 100; fv[1] = ss; }
      var dim = 0, f;
      for (f = 0; f < C.dimmable; f++) { if (fv[f] === 0) dim = f + 1; else break; }
      for (f = 0; f < C.fields; f++) {
        var tens = (fv[f] / 10) | 0, ones = fv[f] % 10, a = digitCache[2 * f], b = digitCache[2 * f + 1];
        if (a.v !== tens) { a.v = tens; a.node.nodeValue = DIG[tens]; }
        if (b.v !== ones) { b.v = ones; b.node.nodeValue = DIG[ones]; }
      }
      if (dim !== lastDim) {
        lastDim = dim;
        for (f = 0; f < C.fields; f++) {
          var on = f < dim, fn = fieldNodes[f];
          for (var j = 0; j < 3; j++) if (fn[j]) { if (on) fn[j].classList.add('ocz-dim'); else fn[j].classList.remove('ocz-dim'); }
        }
      }
    }
    function placeText(theta) {
      // timecode sits behind the head's flat back (the -normal side), upright, never overlapping the head
      var ux = Math.sin(theta), uy = -Math.cos(theta);
      var dist = -C.top + C.gap + abs(ux) * TW / 2 + abs(uy) * TH / 2;
      tcT.setTranslate(ux * dist, uy * dist);
    }
    function updateKeys(len) {
      for (var k = 0; k < keys.length; k++) {
        var on = len >= keyLen[k] - 0.5;
        if (on !== keyOn[k]) { keyOn[k] = on; if (on) keys[k].classList.add('ocz-on'); else keys[k].classList.remove('ocz-on'); }
      }
    }
    function placeRuler(eps) {
      if (!(abs(P.x - wRx) <= eps && abs(P.y - wRy) <= eps)) { rulerT.setTranslate(-P.x, -P.y); wRx = P.x; wRy = P.y; }
    }
    function writeRot(eps) {
      if (!(abs(rot.x - wRot) <= eps)) { phR.setRotate(rot.x * DEG, 0, 0); placeText(rot.x); wRot = rot.x; }
    }
    function targetAngle(len) {
      var tt = tangent(len);
      while (tt - rot.x > Math.PI) tt -= TAU;
      while (tt - rot.x < -Math.PI) tt += TAU;
      return tt;
    }

    // static render (reduced motion, and the first frame after geometry changes)
    function renderStatic(len) {
      if (!N) return;
      at(len, P); placeRuler(0.05);
      rot.x = targetAngle(len); rot.v = 0; writeRot(0.0005);
      setTime(Math.floor(len / PXF + 1e-6)); updateKeys(len);
    }

    // ---- reduced motion: follow the scroll without springs ----
    var raf = 0;
    function applyScroll() {
      raf = 0;
      try { renderStatic(lenAtY(SY ? SY[0] + (endY - SY[0]) * Math.min(1, window.scrollY / maxScroll) : 0)); } catch (e) {}
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(applyScroll); }
    if (reduce) window.addEventListener('scroll', onScroll, { passive: true });

    build();

    return {
      resize: function (cssSize) {
        try {
          var nextSmall = (cssSize || 176) < 100;
          if (nextSmall !== small || !svg.__oczSized) {
            small = nextSmall; C = config(small); build(); svg.__oczSized = true;
            snap = true; sleeping = false; lastLen = NaN;
          }
        } catch (e) {}
      },
      relayout: function () {
        try {
          var path = env.routePath; total = env.total ? env.total() : path.getTotalLength();
          routeD = path.getAttribute('d') || '';
          if (!(total > 0) || !routeD) { N = 0; return; }
          N = Math.max(2, Math.ceil(total / STEP) + 1); sl = total / (N - 1);
          SX = new Float32Array(N); SY = new Float32Array(N);
          for (var i = 0; i < N; i++) { var p = path.getPointAtLength(i * sl); SX[i] = p.x; SY[i] = p.y; }
          endY = SY[N - 1];
          maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          minor.setAttribute('d', routeD); major.setAttribute('d', routeD);

          // keyframes: first mark of each section
          for (var k = 0; k < keys.length; k++) if (keys[k].parentNode) keys[k].parentNode.removeChild(keys[k]);
          keys = []; keyLen = []; keyOn = [];
          var ms = env.marks ? env.marks() : [], seen = {}, r = C.key;
          for (var m = 0; m < ms.length; m++) {
            var mk = ms[m], sec = String(mk.section);
            if (seen[sec]) continue; seen[sec] = true;
            var poly = make('polygon', {
              'class': 'ocz-key',
              points: mk.x + ',' + (mk.y - r) + ' ' + (mk.x + r) + ',' + mk.y + ' ' + mk.x + ',' + (mk.y + r) + ' ' + (mk.x - r) + ',' + mk.y
            }, env.layer);
            keys.push(poly); keyLen.push(mk.len || 0); keyOn.push(false);
          }
          snap = true; sleeping = false; lastLen = NaN; lastFrames = -1; wRx = wRy = wRot = NaN;
          if (reduce) applyScroll();
        } catch (e) { N = 0; }
      },
      frame: function (t, s) {
        if (!N) return;
        var len = s.len || 0;
        if (reduce) { renderStatic(len); return; }

        var px = small ? null : s.px, py = small ? null : s.py;
        if (px === undefined) px = null;
        if (py === undefined) py = null;
        if (sleeping && abs(len - lastLen) < 0.01 && px === lastPx && py === lastPy) return;
        lastLen = len; lastPx = px; lastPy = py;

        var dt = Math.min(s.dt || 16.7, 100) / 1000;
        at(len, P);
        placeRuler(0.1);

        // playhead orientation: perpendicular to the route (critically damped through curves and the final corner)
        var tt = targetAngle(len);
        if (snap) { rot.x = tt; rot.v = 0; snap = false; } else step(rot, tt, W_ROT, dt);
        writeRot(0.0035);

        setTime(Math.floor(len / PXF + 1e-6));
        updateKeys(len);

        // ghost skimmer toward the pointer
        var gTarget = 0, prox = 0;
        if (C.ghost && px !== null && py !== null) {
          var d = Math.sqrt(px * px + py * py);
          prox = smooth(R_IN, R_FULL, d);
          if (prox > 0) gTarget = nearestOffset(len, P.x + px, P.y + py, C.ghost);
        }
        step(gd, gTarget, W_GHOST, dt);
        step(fade, prox, W_FADE, dt);
        var op = fade.x * smooth(3, 12, abs(gd.x)) * 0.95;
        op = op < 0.01 ? 0 : Math.round(op * 64) / 64;
        if (op !== wOp) {
          if (op === 0) gh.style.visibility = 'hidden';
          else if (!(wOp > 0)) gh.style.visibility = '';
          gh.style.opacity = op; wOp = op;
        }
        if (op > 0) {
          var gl = len + gd.x; if (gl < 0) gl = 0; if (gl > total) gl = total;
          at(gl, A); var gx = A.x - P.x, gy = A.y - P.y, ga = tangent(gl);
          while (ga - rot.x > Math.PI) ga -= TAU;
          while (ga - rot.x < -Math.PI) ga += TAU;
          if (!(abs(gx - wGx) <= 0.2 && abs(gy - wGy) <= 0.2 && abs(ga - wGr) <= 0.0035)) {
            ghT.setTranslate(gx, gy); ghR.setRotate(ga * DEG, 0, 0); wGx = gx; wGy = gy; wGr = ga;
          }
        }

        var settled = abs(rot.x - tt) < 0.0008 && abs(rot.v) < 0.002 &&
          abs(gd.x - gTarget) < 0.05 && abs(gd.v) < 0.05 && abs(fade.x - prox) < 0.004 && abs(fade.v) < 0.01;
        if (settled) {
          rot.x = tt; rot.v = 0; gd.x = gTarget; gd.v = 0; fade.x = prox; fade.v = 0;
          writeRot(0.0005); sleeping = true;
        } else sleeping = false;
      },
      destroy: function () {
        if (reduce) window.removeEventListener('scroll', onScroll);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  });
})(window, document);
