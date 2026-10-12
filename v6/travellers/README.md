# V6 travellers: the graphic that rides the hairline route

One file per traveller: `travellers/<id>.js`, plain ES5 IIFE, no libraries, no modules.

```js
(function (window, document) {
  'use strict';
  window.Travellers.register('pion', function (host, env) {
    // host: the .drop element (176x176 CSS px desktop, 48x48 mobile), moved with translate3d by the page.
    //       Its centre is ON the route at the current scroll position. Draw inside it (SVG/canvas/DOM).
    //       Everything outside your shapes must be transparent. No background boxes.
    // env.reduce        prefers-reduced-motion (render static, no springs/idle animation)
    // env.mobile        true at <=760px (host is 48px, no pointer)
    // env.layer         an SVG <g> inside the full-page route <svg> (coords = CSS px of <main>, same as the route path).
    //                   Use it for anything drawn ALONG the route (ink, stitches, ticks, filings). It is cleared for you on switch.
    // env.routePath     the route <path id="routePath"> (getPointAtLength etc). You may restyle it (stroke, dasharray, opacity);
    //                   the inline style is removed for you on switch.
    // env.pointAt(len)  point on route at length len
    // env.total()       route length in px
    // env.marks()       [{len,x,y,section,id}] — one per marker; section ids: start, co-robie, realizacje, kontakt
    return {
      resize: function (cssSize, dpr) {},          // host size changed (176 or 48); dpr capped at 1.5
      relayout: function () {},                    // route geometry changed (resize, fonts, projects layout) — redraw layer stuff here
      frame: function (tMs, s) {
        // called each animation frame while the host is on screen (not when hidden / off screen)
        // s.vel  -1..1 scroll velocity along the route (sign = direction)
        // s.tx, s.ty  unit tangent of travel direction (screen coords, y down)
        // s.px, s.py  pointer relative to host centre in CSS px, or null (touch / no pointer / mobile)
        // s.dark  dark theme on;  s.dt  ms since last frame
        // s.len, s.total, s.progress (0..1)  position on the route;  s.section active section index 0..3
      },
      destroy: function () {}                      // remove your listeners/timers; DOM in host + layer is cleared for you
    };
  });
})(window, document);
```

## Hard rules
- Light on the machine: SVG/DOM transforms or Canvas2D. No WebGL. No per-frame allocations in hot paths.
  Only touch the DOM when a value changed by a visible amount (> 0.2 px / 0.2°). When nothing moves (no scroll,
  no pointer, springs settled) do no work at all.
- Size: the visible object is small — about 40–64 CSS px on desktop, ≤ 32 px on mobile. The host is 176 px only
  so the object has room to swing/extend.
- Palette: the page's own tokens only — read `getComputedStyle(document.documentElement).getPropertyValue('--ink')`
  etc. or use `currentColor` + CSS vars (`var(--ink)`, `var(--steel)`, `var(--mist)`, `var(--bg)`). Light theme
  #F7F8F9/#17191C/#8E959C/#E4E7EA; dark #111315/#ECEEF0/#7D848B/#1E2125. Metal = greys with light/dark bands.
  One small accent is allowed only if it is the point of the concept (e.g. a REC dot).
- Pointer: when the mouse comes within ~240 px the object should respond (magnetised / turn toward / react), smoothly
  with critically-damped springs, and relax when it leaves.
- Respect `env.reduce` (static, no idle motion) and dark theme (`s.dark`).
- No text over ~11 words; any text is Polish. No emoji. No monospace "terminal" clichés.
- Never throw: wrap risky bits; the page falls back to "Lekka" if create() throws.
