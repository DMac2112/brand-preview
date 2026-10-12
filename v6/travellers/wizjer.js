/* Wizjer — a camcorder viewfinder riding the route (content creation).
   A 3:2 recording frame of four corner brackets sits on the route point. Top-left, above the frame: a red REC dot
   that blinks slowly and the word REC. Bottom-right, below it: the timecode. The page is the footage, so the
   timecode is the scroll position (whole route = 3 minutes); scrolling back rewinds it.
   Scroll: the frame zooms out with speed and trails a little behind the move, like a hand-held pan.
   Mouse within ~240 px: autofocus. The frame slides toward the pointer and opens slightly while it hunts, then locks
   once: the brackets snap tight and turn ink. It lets go when the pointer leaves.
   End of the route: the page shrinks the host into the contact button; the frame counter-scales so it stays a
   readable small frame, and the labels fade out.
   SVG only. Moving parts are written through SVGTransform objects (no strings per frame) and only when a value
   changed by > 0.2 px. Idle (no scroll, no pointer change, springs settled) = early return; the only idle work is
   the REC blink, one class flip twice per 2.4 s, and only while the page is calling frame() (host on screen). */
(function (window, document) {
  'use strict';
  if (!window.Travellers) return;
  var NS = 'http://www.w3.org/2000/svg';

  var BLINK = 2400, BLINK_ON = 1500;          // slow camcorder blink: on 1.5 s, off 0.9 s
  var R_IN = 240, R_LOCK = 190, R_NEAR = 70, R_OUT = 275;
  var W_SIZE = 13, W_SNAP = 40, W_OFF = 11;   // critically damped spring speeds (rad/s)
  var SNAP_MS = 90;                           // the bite of the focus snap before it settles
  var TAPE = 180;                             // whole route = 03:00 of footage

  var CSS =
    '.wz{overflow:visible}' +
    '.wz .wz-h{fill:none;stroke:var(--bg);stroke-width:var(--wz-hw,4.5px);stroke-linecap:square;stroke-linejoin:miter;opacity:var(--wz-halo,1)}' +
    '.wz .wz-l{fill:none;stroke:var(--steel);stroke-width:var(--wz-sw,1.5px);stroke-linecap:butt;stroke-linejoin:miter;transition:stroke .55s ease}' +
    '.wz.wz-lock .wz-l{stroke:var(--ink);transition:none}' +
    '.wz .wz-dot{fill:#D8342C;stroke:var(--bg);stroke-width:1.6;paint-order:stroke;transition:opacity .14s ease-out}' +
    '.wz.wz-off .wz-dot{opacity:.12;transition:opacity .34s ease-in}' +
    ':root[data-theme="dark"] .wz .wz-dot{fill:#E5483F}' +
    '.wz text{font-family:"Instrument Sans",Arial,sans-serif;font-size:8px;stroke:var(--bg);stroke-width:2.6;' +
      'stroke-linejoin:round;paint-order:stroke;opacity:var(--wz-lab,1)}' +
    '.wz .wz-t{fill:var(--ink);font-weight:600;letter-spacing:.08em}' +
    '.wz .wz-tc{fill:var(--steel);font-weight:500;letter-spacing:.03em;font-variant-numeric:tabular-nums;' +
      'font-feature-settings:"tnum" 1;text-anchor:end}';

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
  function two(n) { return n < 10 ? '0' + n : '' + n; }

  // sizes in CSS px; f is the frame scale (1 = at rest)
  function config(small) {
    return small ? {
      W: 30, H: 20, arm: 0.3, zoom: 0.22, hunt: 0, tight: 1, pinch: 0, maxShift: 0, lag: 3, endShrink: 0.35,
      dotR: 2, dotY: -5.2, text: false
    } : {
      W: 60, H: 40, arm: 0.25, zoom: 0.26, hunt: 0.08, tight: 0.78, pinch: 0.07, maxShift: 22, lag: 7, endShrink: 0.42,
      dotR: 2.6, dotY: -8.4, text: true
    };
  }

  window.Travellers.register('wizjer', function (host, env) {
    var reduce = !!env.reduce, small = !!env.mobile, C = config(small), hostSize = small ? 48 : 176;

    var svg = make('svg', { 'class': 'wz', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'visible';
    make('style', null, svg).textContent = CSS;
    function tf(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    var root = make('g', null, svg), rootT = tf(root);          // end-of-route counter-scale
    var cam = make('g', null, root), camT = tf(cam);            // pan: pointer pull + scroll lag
    var corners = [], PX = [-1, 1, 1, -1], PY = [-1, -1, 1, 1];
    for (var i = 0; i < 4; i++) {
      var g = make('g', null, cam), gt = tf(g), gs = tf(g);
      make('path', { 'class': 'wz-h', d: 'M0 1V0H1', 'vector-effect': 'non-scaling-stroke' }, g);
      make('path', { 'class': 'wz-l', d: 'M0 1V0H1', 'vector-effect': 'non-scaling-stroke' }, g);
      corners.push({ t: gt, s: gs, px: PX[i], py: PY[i] });
    }
    var rec = make('g', null, cam), recT = tf(rec);             // anchored to the top-left corner
    var dot = make('circle', { 'class': 'wz-dot' }, rec);
    var txt = make('text', { 'class': 'wz-t' }, rec);
    txt.textContent = 'REC';
    var tcg = make('g', null, cam), tcT = tf(tcg);              // anchored to the bottom-right corner
    var tc = make('text', { 'class': 'wz-tc' }, tcg);
    tc.textContent = '00:00';
    host.appendChild(svg);

    var sz = { x: 1, v: 0 }, ox = { x: 0, v: 0 }, oy = { x: 0, v: 0 };
    var FREE = 0, SEEK = 1, LOCK = 2, state = FREE, lockT = 0, steady = 0;
    var sleeping = false, lastPx = null, lastPy = null, blinkOn = true, lastSec = -1, settle = -1, endE = 1;
    var wOx = NaN, wOy = NaN, wF = NaN;

    function layoutLabels() {
      dot.setAttribute('cx', C.dotR); dot.setAttribute('cy', C.dotY); dot.setAttribute('r', C.dotR);
      txt.setAttribute('x', C.dotR * 2 + 3.4); txt.setAttribute('y', C.dotY + 2.85);
      tc.setAttribute('x', 0.6); tc.setAttribute('y', 11.5);
      txt.style.display = C.text ? '' : 'none';
      tc.style.display = C.text && !reduce ? '' : 'none';
    }
    function render(eps) {
      var o1 = ox.x, o2 = oy.x, f = sz.x;
      if (!(Math.abs(o1 - wOx) <= eps && Math.abs(o2 - wOy) <= eps)) { camT.setTranslate(o1, o2); wOx = o1; wOy = o2; }
      if (!(Math.abs(f - wF) * C.W * 0.5 <= eps)) {
        var hw = C.W * f / 2, hh = C.H * f / 2, a = C.H * C.arm * (0.4 + 0.6 * f);
        for (var j = 0; j < 4; j++) { var c = corners[j]; c.t.setTranslate(c.px * hw, c.py * hh); c.s.setScale(-c.px * a, -c.py * a); }
        recT.setTranslate(-hw, -hh); tcT.setTranslate(hw, hh);
        wF = f;
      }
    }
    // the page scales the host by 1 - .74*settle over the last host-length of the route; keep the frame readable
    function applySettle(v) {
      settle = v;
      var k = 1 - 0.74 * v; endE = 1 - C.endShrink * v;
      var c = endE / (k > 0.05 ? k : 0.05);
      rootT.setScale(c, c);
      svg.style.setProperty('--wz-lab', (1 - smooth(0.08, 0.5, v)).toFixed(3));
      svg.style.setProperty('--wz-halo', (1 - smooth(0.3, 0.85, v)).toFixed(3));
      // non-scaling-stroke ignores our group scale but not the page's CSS scale: keep the hairline 1.5 px on screen
      svg.style.setProperty('--wz-sw', (1.5 / (k > 0.05 ? k : 0.05)).toFixed(3) + 'px');
      svg.style.setProperty('--wz-hw', (4.5 / (k > 0.05 ? k : 0.05)).toFixed(3) + 'px');
    }
    function reset() {
      sz.x = 1; sz.v = 0; ox.x = ox.v = oy.x = oy.v = 0;
      state = FREE; steady = 0; sleeping = false;
      svg.classList.remove('wz-lock'); svg.classList.remove('wz-off'); blinkOn = true;
      wOx = wOy = wF = NaN; render(0);
    }

    layoutLabels(); applySettle(0); reset();

    return {
      resize: function (cssSize) {
        try {
          hostSize = cssSize || (small ? 48 : 176);
          var half = hostSize / 2, nextSmall = hostSize < 100;
          svg.setAttribute('viewBox', (-half) + ' ' + (-half) + ' ' + (half * 2) + ' ' + (half * 2));
          if (nextSmall !== small || !svg.__wzSized) {
            small = nextSmall; C = config(small); layoutLabels(); svg.__wzSized = true;
            settle = -1; applySettle(0); reset();
          }
        } catch (e) {}
      },
      relayout: function () {},
      frame: function (t, s) {
        if (reduce) return;                                  // static frame, solid dot, no timecode
        var on = (t % BLINK) < BLINK_ON;
        if (on !== blinkOn) { blinkOn = on; if (on) svg.classList.remove('wz-off'); else svg.classList.add('wz-off'); }

        var total = s.total || 0, len = s.len || 0;
        if (C.text) {
          var sec = Math.floor((s.progress || 0) * TAPE + 1e-6);
          if (sec !== lastSec) { lastSec = sec; tc.textContent = two(Math.floor(sec / 60)) + ':' + two(sec % 60); }
        }
        var st = total > 0 ? (len - (total - hostSize)) / hostSize : 0;
        st = st < 0 ? 0 : st > 1 ? 1 : st;
        if (Math.abs(st - settle) > 0.002 || (st !== settle && (st === 0 || st === 1))) applySettle(st);

        var px = small ? null : s.px, py = small ? null : s.py;
        if (px === undefined) px = null;
        if (py === undefined) py = null;
        var vel = s.vel || 0, av = vel < 0 ? -vel : vel;
        if (sleeping && px === lastPx && py === lastPy && av < 0.002) return;
        lastPx = px; lastPy = py;

        var dt = Math.min(s.dt || 16.7, 100) / 1000;
        var hasP = px !== null && py !== null;
        var d = hasP ? Math.sqrt(px * px + py * py) : 1e9;

        // autofocus: FREE -> SEEK (in range) -> LOCK (frame arrived, once) -> FREE (pointer gone)
        if (state === FREE) { if (d < R_IN && C.maxShift > 0) { state = SEEK; steady = 0; } }
        else if (d > R_OUT) { if (state === LOCK) svg.classList.remove('wz-lock'); state = FREE; }

        var tox = 0, toy = 0;
        if (hasP && d > 0.5 && d < R_IN) {
          var pull = smooth(R_IN, R_NEAR, d), shift = Math.min(d * 0.45, C.maxShift) * pull / endE;
          tox = px / d * shift; toy = py / d * shift;
        }
        tox -= (s.tx || 0) * av * C.lag; toy -= (s.ty || 0) * av * C.lag;    // pan lags behind travel

        var zoom = C.zoom * av, tf_, w = W_SIZE;
        if (state === LOCK) { tf_ = (t - lockT < SNAP_MS ? C.tight - C.pinch : C.tight) + zoom * 0.5; w = W_SNAP; }
        else if (state === SEEK) tf_ = 1 + C.hunt + zoom;
        else tf_ = 1 + zoom;

        step(sz, tf_, w, dt); step(ox, tox, W_OFF, dt); step(oy, toy, W_OFF, dt);

        if (state === SEEK && d < R_LOCK) {
          var ex = ox.x - tox, ey = oy.x - toy;
          if (ex * ex + ey * ey < 2.25 && ox.v * ox.v + oy.v * oy.v < 400) steady += dt * 1000; else steady = 0;
          if (steady > 70) { state = LOCK; lockT = t; svg.classList.add('wz-lock'); }
        }

        var busy = (state === SEEK && d < R_LOCK) || (state === LOCK && t - lockT < SNAP_MS + 60);
        if (!busy && Math.abs(sz.x - tf_) < 0.001 && Math.abs(sz.v) < 0.002 &&
            Math.abs(ox.x - tox) < 0.04 && Math.abs(oy.x - toy) < 0.04 && Math.abs(ox.v) < 0.05 && Math.abs(oy.v) < 0.05) {
          sz.x = tf_; ox.x = tox; oy.x = toy; sz.v = ox.v = oy.v = 0;
          render(0.001); sleeping = true;
        } else { sleeping = false; render(0.2); }
      },
      destroy: function () {}
    };
  });
})(window, document);
