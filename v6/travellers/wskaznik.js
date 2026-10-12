/* Wskaźnik — the mouse pointer riding the route (websites = interfaces).
   A drawn arrow cursor in the page's own drawing language: flat steel fill, 1.5 px ink outline (the route's weight),
   and the bg-coloured rim every real cursor has, so it knocks the route out where it crosses it. Its hotspot (the tip)
   sits exactly on the route; it leans a little with the scroll, as if dragged.
   Mouse within ~240 px: the arrow turns to aim its tip at the visitor's pointer. Within ~70 px it becomes the
   pointing hand and reaches toward the pointer; when the two tips touch, one ring ripples out (a click).
   End of the route: if the "Napisz do mnie" button has room to the left of its label, the hand hovers there, finger up,
   and clicks once (desktop). Otherwise it points at the button from the line and gives one small nudge (mobile).
   Reduced motion: no springs; the same poses are shown as states (arrow on the route, hand at the button at the end).
   SVG only. Transforms are written through SVGTransform objects (no strings per frame), only when a value moved
   by a visible amount. Idle (no scroll, no pointer change, springs settled, nothing playing) = early return. */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg', D2R = Math.PI / 180, TAU = Math.PI * 2;

  // geometry in cursor units (1 unit = 1 px of a real 1x cursor); hotspot at 0,0
  var ARROW = 'M0 0V16.2L3.9 12.4L6.4 18.3L8.9 17.2L6.5 11.5H11.9Z';
  // pointing hand: index finger up (round tip = hotspot), three curled fingers stepping down to the right,
  // a narrow thumb out at ~40 deg with a round tip, a soft heel, and a short wrist with rounded corners
  var HAND = 'M-1.6 10.57V1.6A1.6 1.6 0 0 1 1.6 1.6V7.75A1.35 1.35 0 0 1 4.3 7.75V8.4A1.3 1.3 0 0 1 6.9 8.4' +
             'V9.3A1.1 1.1 0 0 1 9.1 9.3V12.3C9.1 14.3 8.3 15.4 7.4 16.3V17.4A1 1 0 0 1 6.4 18.4H0.5' +
             'A1 1 0 0 1 -0.5 17.4V16.2C-0.5 15 -1.75 13.58 -2.82 12.68L-5.27 10.62A1.2 1.2 0 0 1 -3.73 8.78Z';
  var HAND_DET = 'M1.6 7.75V10.3M4.3 8.4V10.5M6.9 9.3V10.9';
  var HAND_MINX = -5.7, HAND_MAXX = 9.1, HAND_MAXY = 18.4, HAND_K = 0.97;
  var PHI_ARROW = -113 * D2R;   // direction the arrow tip points when upright (bisector of its head)
  var PHI_HAND = -90 * D2R;     // the index finger points straight up

  var R_FACE = 240, R_FULL = 150, R_HAND_IN = 70, R_HAND_OUT = 88, R_TOUCH = 13, R_REARM = 110;
  var LEAN = 18 * D2R, REACH = 14;
  var W_TURN = 11, W_OFF = 15, W_POP = 30, W_FLIP = 18;
  var RING_MS = 640, PRESS_MS = 95, NUDGE_MS = 560, NUDGE_PX = 2.5;

  var CSS =
    '.wk{overflow:visible}' +
    '.wk .wk-halo{fill:var(--bg);stroke:var(--bg);stroke-linejoin:round;stroke-linecap:round}' +
    '.wk .wk-body{fill:var(--steel);stroke:var(--ink);stroke-linejoin:round;stroke-linecap:round}' +
    '.wk .wk-det{fill:none;stroke:var(--ink);stroke-linecap:round}' +
    '.wk .wk-shf{flood-color:var(--ink);flood-opacity:.12}' +
    ':root[data-theme="dark"] .wk .wk-shf{flood-color:#000;flood-opacity:.4}' +
    '.wk .wk-ring{fill:none;stroke:var(--ink)}' +
    '.wk .wk-ring.wk-inv{stroke:var(--bg)}';

  function make(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // exact critically damped spring step: stable for any dt, never overshoots from rest
  function step(sp, target, w, dt) {
    var x0 = sp.x - target, k = sp.v + w * x0, e = Math.exp(-w * dt);
    sp.x = target + (x0 + k * dt) * e;
    sp.v = (sp.v - w * k * dt) * e;
  }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function settled(sp, target, eps, veps) { return Math.abs(sp.x - target) < eps && Math.abs(sp.v) < veps; }

  window.Travellers.register('wskaznik', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, hostSize = small ? 48 : 176;
    var S, LINE, RIM, END_VIS;
    function dims() {
      S = small ? 1.3 : 2.3; LINE = small ? 1.25 : 1.5; RIM = small ? 1.2 : 1.6; END_VIS = small ? 0.95 : 0.84;
    }
    dims();

    var svg = make('svg', { 'class': 'wk', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    var defs = make('defs', null, svg);
    // a small, tight lift; applied to an un-rotated wrapper so it always falls straight down the screen
    var shF = make('filter', { id: 'wk-shadow', filterUnits: 'userSpaceOnUse', x: '-64', y: '-64', width: '128', height: '128',
      'color-interpolation-filters': 'sRGB' }, defs);
    var shD = make('feDropShadow', { 'class': 'wk-shf', dx: '0', dy: '1', stdDeviation: '0.8' }, shF);
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    var pos = make('g', null, svg), posT = tf(pos), posS = tf(pos);   // screen offset + counter-scale
    var ring = make('circle', { 'class': 'wk-ring', cx: '0', cy: '0', r: '4', opacity: '0' }, pos);
    var lift = make('g', { filter: 'url(#wk-shadow)' }, pos);
    var rot = make('g', null, lift), rotR = tf(rot), rotS = tf(rot);  // aim + press
    var arrow = make('g', null, rot), arrowS = tf(arrow);
    var aHalo = make('path', { 'class': 'wk-halo', d: ARROW }, arrow);
    var aBody = make('path', { 'class': 'wk-body', d: ARROW }, arrow);
    var hand = make('g', null, rot), handS = tf(hand);
    var hHalo = make('path', { 'class': 'wk-halo', d: HAND }, hand);
    var hBody = make('path', { 'class': 'wk-body', d: HAND }, hand);
    var hDet = make('path', { 'class': 'wk-det', d: HAND_DET }, hand);
    hand.style.display = 'none';
    host.appendChild(svg);

    function strokes() {
      var ua = 1 / S, uh = 1 / (S * HAND_K);
      aHalo.setAttribute('stroke-width', ((LINE + RIM * 2) * ua).toFixed(3));
      hHalo.setAttribute('stroke-width', ((LINE + RIM * 2) * uh).toFixed(3));
      aBody.setAttribute('stroke-width', (LINE * ua).toFixed(3));
      hBody.setAttribute('stroke-width', (LINE * uh).toFixed(3));
      hDet.setAttribute('stroke-width', (LINE * 0.8 * uh).toFixed(3));
      ring.setAttribute('stroke-width', small ? '1.1' : '1.3');
      shD.setAttribute('dy', small ? '0.7' : '1'); shD.setAttribute('stdDeviation', small ? '0.55' : '0.8');
      arrowS.setScale(S, S);
    }

    // end of route: where is the contact button relative to the last route point?
    // endHover: the hand fits inside the button's empty left padding (finger up, clicks once);
    // otherwise it points at the button from the line (endBeta) and nudges once.
    var endHover = false, endDX = 0, endDY = 0, endBeta = PHI_HAND;
    function labelLeft(btn, fallback) {
      try {
        for (var n = btn.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3 && /\S/.test(n.nodeValue)) {
            var r = document.createRange(); r.selectNodeContents(n);
            var b = r.getBoundingClientRect();
            if (b.width > 0) return b.left;
          }
        }
      } catch (e) {}
      return fallback;
    }
    function measureEnd() {
      endHover = false; endDX = endDY = 0; endBeta = PHI_HAND;
      try {
        var marks = env.marks(), m = marks[marks.length - 1], btn = document.querySelector('.contact-button');
        if (!m || !btn || !env.main) return;
        var mr = env.main.getBoundingClientRect(), br = btn.getBoundingClientRect();
        var x0 = br.left - mr.left, x1 = br.right - mr.left, y0 = br.top - mr.top, y1 = br.bottom - mr.top;
        var onBtn = m.x >= x0 - 3 && m.x <= x1 && m.y >= y0 && m.y <= y1;
        var lx = labelLeft(btn, br.right - 40) - mr.left;
        if (onBtn) {
          // room between the route end (the button's left edge) and the label, against the hand's real size there
          var sc = S * HAND_K * END_VIS, pad = RIM + LINE * 0.5 + 1;
          var hw = (HAND_MAXX - HAND_MINX) * sc + pad * 2, hh = HAND_MAXY * sc + pad * 2;
          var left = Math.max(x0, m.x), room = lx - left;
          if (room >= hw + 14 && (y1 - y0) >= hh + 8) {
            endHover = true;
            endDX = left + room * 0.5 - m.x - (HAND_MINX + HAND_MAXX) * 0.5 * sc;   // hand box centred in the room
            endDY = (y0 + y1) * 0.5 - m.y - HAND_MAXY * 0.5 * sc;
            return;
          }
          // too tight: stay on the line just outside the edge and point in at the label
          endBeta = 0; endDX = Math.min(0, x0 - m.x) - 4;
          return;
        }
        var cx = clamp(m.x, x0, x1), cy = clamp(m.y, y0, y1);
        if (Math.abs(cx - m.x) + Math.abs(cy - m.y) > 1) endBeta = Math.atan2(cy - m.y, cx - m.x);
      } catch (e) {}
    }
    function flipFor(b, prev) {                 // keep the thumb on the upper side when the hand points left
      var th = wrap(b - PHI_HAND);
      return th < -28 * D2R ? -1 : th > -6 * D2R ? 1 : prev;
    }
    var E = { bt: 0, ox: 0, oy: 0, flip: 1 };
    function endTarget(settle) {
      var e = smooth(0.7, 1, settle);
      if (endHover) { E.bt = PHI_HAND; E.flip = 1; }
      else { E.bt = endBeta; E.flip = flipFor(endBeta, 1); }
      E.ox = endDX * e; E.oy = endDY * e;
    }

    // state
    var beta = { x: PHI_ARROW, v: 0 }, ox = { x: 0, v: 0 }, oy = { x: 0, v: 0 }, pop = { x: 1, v: 0 }, flip = { x: 1, v: 0 };
    var isHand = false, near = false, endMode = false, flipT = 1, swapped = false;
    var touchArmed = true, endArmed = true, ringT = -1, pressUntil = 0, nudgeT = -1, nx = 0, ny = 0;
    var sleeping = false, lastPx = null, lastPy = null, lastLen = -1, pendingClick = false, failed = false;
    var wOx = NaN, wOy = NaN, wK = NaN, wTh = NaN, wP = NaN, wF = NaN, wHs = 1;

    function setShape(h) {
      if (h === isHand) return;
      isHand = h;
      hand.style.display = h ? '' : 'none';
      arrow.style.display = h ? 'none' : '';
      pop.x = 0.8; pop.v = 0;                         // real cursors swap instantly; this one pops in
      wTh = NaN; swapped = true;                      // rotation offset differs per shape; flip set fresh
    }
    function startRing(t, inverted) {
      ringT = t; pressUntil = t + PRESS_MS;
      if (inverted) ring.classList.add('wk-inv'); else ring.classList.remove('wk-inv');
    }
    function forceWrite() { wOx = wOy = wK = wTh = wP = wF = NaN; }
    function render(eps, hs, k) {
      var tx = ox.x + nx, ty = oy.x + ny;
      if (!(Math.abs(tx - wOx) <= eps && Math.abs(ty - wOy) <= eps) || Math.abs(hs - wHs) > 0.001) {
        posT.setTranslate(tx / hs, ty / hs); wOx = tx; wOy = ty; wHs = hs;
      }
      if (!(Math.abs(k - wK) <= 0.002)) { posS.setScale(k, k); wK = k; }
      var th = (beta.x - (isHand ? PHI_HAND : PHI_ARROW)) / D2R;
      if (!(Math.abs(th - wTh) <= eps)) { rotR.setRotate(th, 0, 0); wTh = th; }
      var p = pop.x;
      if (!(Math.abs(p - wP) <= eps * 0.02)) { rotS.setScale(p, p); wP = p; }
      var f = flip.x;
      if (!(Math.abs(f - wF) <= eps * 0.05)) { handS.setScale(S * HAND_K * f, S * HAND_K); wF = f; }
    }
    function stopPlays() { ringT = -1; pressUntil = 0; nudgeT = -1; nx = ny = 0; ring.setAttribute('opacity', '0'); }

    // reduced motion: a pose per scroll position, no springs, nothing plays on its own
    function applyStatic(settle) {
      var hs = 1 - 0.74 * settle, k = (1 - (1 - END_VIS) * settle) / hs, atEnd = settle > 0.7;
      setShape(atEnd); swapped = false; pop.x = 1; pop.v = 0; stopPlays();
      if (atEnd) { endTarget(settle); beta.x = E.bt; ox.x = E.ox; oy.x = E.oy; flip.x = E.flip; }
      else { beta.x = PHI_ARROW; ox.x = oy.x = 0; flip.x = 1; }
      beta.v = ox.v = oy.v = flip.v = 0;
      forceWrite(); render(0, hs, k);
    }
    var rRaf = 0, rSettle = -1;
    function readReduce() {
      rRaf = 0;
      try {
        // the page scales the host down over the last stretch of the route: 1 - 0.74 * settle
        var m = /scale\(([^)]+)\)/.exec(host.style.transform || ''), sc = m ? parseFloat(m[1]) : 1;
        if (!(sc > 0)) sc = 1;
        var st = clamp((1 - sc) / 0.74, 0, 1);
        if (Math.abs(st - rSettle) > 0.002) { rSettle = st; applyStatic(st); }
      } catch (e) {}
    }
    function onReduceScroll() { if (!rRaf) rRaf = window.requestAnimationFrame(readReduce); }  // after the page placed the host
    if (reduce) window.addEventListener('scroll', onReduceScroll, { passive: true });

    function staticPose() {
      beta.x = PHI_ARROW; beta.v = 0; ox.x = ox.v = oy.x = oy.v = 0; pop.x = 1; pop.v = 0; flip.x = 1; flip.v = 0;
      setShape(false); swapped = false; pop.x = 1; stopPlays();
      forceWrite(); render(0, 1, 1);
    }

    strokes(); staticPose();

    function frame(t, s) {
      var len = s.len || 0, total = s.total || 0;
      // the page shrinks the host over the last hostSize px of route; keep the cursor at its own size
      var settle = total ? clamp((len - (total - hostSize)) / hostSize, 0, 1) : 0;
      if (reduce) { rSettle = settle; applyStatic(settle); return; }

      var px = small ? null : s.px, py = small ? null : s.py;
      if (px === undefined) px = null;
      if (py === undefined) py = null;
      var vel = s.vel || 0, av = vel < 0 ? -vel : vel;
      var animating = ringT >= 0 || t < pressUntil || nudgeT >= 0;
      if (sleeping && !animating && !pendingClick && px === lastPx && py === lastPy &&
          Math.abs(len - lastLen) < 0.01 && av < 0.002) return;
      lastPx = px; lastPy = py; lastLen = len;
      var dt = Math.min(s.dt || 16.7, 64) / 1000;
      var hs = 1 - 0.74 * settle, k = (1 - (1 - END_VIS) * settle) / hs;

      var hasP = px !== null && py !== null;
      var d = hasP ? Math.sqrt(px * px + py * py) : 1e9, alpha = hasP ? Math.atan2(py, px) : 0;
      near = hasP && (near ? d < R_HAND_OUT : d < R_HAND_IN);
      endMode = endMode ? settle > 0.45 : settle > 0.7;
      setShape(near || endMode);

      // aim: where the tip points (radians, screen coords)
      var phi = isHand ? PHI_HAND : PHI_ARROW, bt, tox = 0, toy = 0;
      if (endMode && !near) {
        endTarget(settle); bt = E.bt; tox = E.ox; toy = E.oy; flipT = E.flip;
      } else {
        // lean: the body trails behind the travel, pivoting on the tip
        var cross = Math.cos(beta.x) * (s.ty || 0) - Math.sin(beta.x) * (s.tx || 0);
        var base = phi + clamp(cross, -1, 1) * Math.min(av * 1.6, 1) * LEAN;
        var w = near ? 1 : (hasP ? smooth(R_FACE, R_FULL, d) : 0);
        bt = base + w * wrap(alpha - base);
        if (near) {
          var reach = clamp((R_HAND_IN + 2 - d) * 0.5, 0, Math.min(REACH, d - 6));
          tox = Math.cos(alpha) * reach; toy = Math.sin(alpha) * reach;
        }
        flipT = isHand ? flipFor(bt, flipT) : 1;
      }
      bt = beta.x + wrap(bt - beta.x);
      if (swapped) { flip.x = flipT; flip.v = 0; swapped = false; }

      step(beta, bt, W_TURN, dt); step(ox, tox, W_OFF, dt); step(oy, toy, W_OFF, dt);
      step(pop, t < pressUntil ? 0.88 : 1, W_POP, dt); step(flip, flipT, W_FLIP, dt);

      // touch: fingertip meets the pointer -> one ripple, re-armed when the pointer leaves
      if (near && touchArmed) {
        var gx = px - ox.x, gy = py - oy.x;
        if (gx * gx + gy * gy < R_TOUCH * R_TOUCH) { touchArmed = false; startRing(t, false); }
      }
      if (!hasP || d > R_REARM) touchArmed = true;
      // arrival: over the button it clicks once; pointing from the line it only nudges toward it
      if (endMode && endArmed && settle > 0.985 && av < 0.004 && !near) {
        endArmed = false;
        if (endHover) startRing(t, true); else nudgeT = t;
      }
      if (settle < 0.5) { endArmed = true; nudgeT = -1; }
      pendingClick = endMode && endArmed && settle > 0.985;

      nx = ny = 0;
      if (nudgeT >= 0) {
        var un = (t - nudgeT) / NUDGE_MS;
        if (un >= 1 || near) nudgeT = -1;
        else { var sn = Math.sin(Math.PI * un), a = NUDGE_PX * sn * sn; nx = Math.cos(endBeta) * a; ny = Math.sin(endBeta) * a; }
      }
      if (ringT >= 0) {
        var u = (t - ringT) / RING_MS;
        if (u >= 1) { ringT = -1; ring.setAttribute('opacity', '0'); }
        else {
          var e = 1 - (1 - u) * (1 - u) * (1 - u), r0 = small ? 2.5 : 4, r1 = small ? 11 : 21;
          ring.setAttribute('r', (r0 + (r1 - r0) * e).toFixed(2));
          ring.setAttribute('opacity', (0.85 * Math.pow(1 - u, 1.3)).toFixed(3));
        }
      }

      var busy = ringT >= 0 || t < pressUntil || pendingClick || nudgeT >= 0;
      if (!busy && settled(beta, bt, 0.002, 0.01) && settled(ox, tox, 0.05, 0.1) && settled(oy, toy, 0.05, 0.1) &&
          settled(pop, 1, 0.002, 0.01) && settled(flip, flipT, 0.004, 0.02)) {
        beta.x = bt; ox.x = tox; oy.x = toy; pop.x = 1; flip.x = flipT; beta.v = ox.v = oy.v = pop.v = flip.v = 0;
        render(0.001, hs, k); sleeping = true;
      } else { sleeping = false; render(0.2, hs, k); }
    }

    return {
      resize: function (cssSize) {
        try {
          var size = cssSize || hostSize, half = size / 2;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + size + ' ' + size);
          var nextSmall = size < 100;
          if (nextSmall !== small || hostSize !== size) {
            small = nextSmall; hostSize = size; dims(); strokes(); measureEnd(); staticPose();
          }
          forceWrite(); sleeping = false; rSettle = -1;
        } catch (e) {}
      },
      relayout: function () { measureEnd(); sleeping = false; rSettle = -1; if (reduce) onReduceScroll(); },
      frame: function (t, s) {
        if (failed) return;
        try { frame(t, s); } catch (e) { failed = true; }
      },
      destroy: function () {
        if (reduce) window.removeEventListener('scroll', onReduceScroll);
        if (rRaf) window.cancelAnimationFrame(rRaf);
        rRaf = 0;
      }
    };
  });
})(window, document);
