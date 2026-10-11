(function (window, document) {
  'use strict';

  var TAU = Math.PI * 2;
  var svgSerial = 0;
  var list = [
    { id: 'ferro', label: 'Ferro' },
    { id: 'mercury', label: 'Rtęć' },
    { id: 'trail', label: 'Ślad' },
    { id: 'lite', label: 'Lekka' }
  ];

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function smooth(lo, hi, x) {
    x = clamp((x - lo) / (hi - lo), 0, 1);
    return x * x * (3 - 2 * x);
  }
  function spring(x) { return { x: x || 0, v: 0 }; }

  // Exact critical damping: stable after pauses, with no integration substeps.
  function critical(a, target, dt) {
    var y = a.x - target, j = a.v + 8 * y, e = Math.exp(-8 * dt);
    a.x = target + (y + j * dt) * e;
    a.v = (a.v - 8 * j * dt) * e;
  }
  function wobble(a, target, dt) {
    var omega = 14, damping = 0.24, decay = omega * damping;
    var wd = omega * Math.sqrt(1 - damping * damping);
    var y = a.x - target, e = Math.exp(-decay * dt);
    var c = Math.cos(wd * dt), sn = Math.sin(wd * dt), v = a.v;
    a.x = target + e * (y * c + (v + decay * y) * sn / wd);
    a.v = e * (v * c - (decay * v + omega * omega * y) * sn / wd);
  }

  function motion(id, env) {
    var m = {
      size: env.mobile ? 48 : 176, mobile: !!env.mobile, time: 0,
      x: spring(), y: spring(), angle: spring(), breath: spring(1),
      stretch: spring(), flow: spring(), lag: spring(),
      tx: spring(), ty: spring(1), spikes: [], values: new Float32Array(8)
    };
    var i;
    for (i = 0; i < 8; i++) m.spikes.push(spring());
    m.resize = function (size) {
      var mobile = size <= 48, j;
      if (mobile && !m.mobile) {
        // Pointer deformation must not carry into the much smaller mobile host.
        m.x.x = 0; m.x.v = 0; m.y.x = 0; m.y.v = 0;
        for (j = 0; j < 8; j++) {
          m.spikes[j].x = 0; m.spikes[j].v = 0; m.values[j] = 0;
        }
      }
      m.size = size; m.mobile = mobile;
    };
    m.update = function (s) {
      if (env.reduce) return;
      var dt = clamp((s.dt || 16.7) / 1000, 0.001, 0.05);
      var px = s.px, py = s.py, distance = 0, dx = 0, dy = 0, proximity = 0;
      var mercury = id === 'mercury', reach = mercury ? 220 : 260;
      var vel = clamp(s.vel || 0, -1, 1), gain, a, j;
      m.time += dt;
      if (!m.mobile && px != null && py != null) {
        distance = Math.sqrt(px * px + py * py);
        if (distance > 0.001) { dx = px / distance; dy = py / distance; }
        proximity = 1 - smooth(40, reach, distance);
      }
      critical(m.x, dx * proximity * (mercury ? 10 : 14), dt);
      critical(m.y, dy * proximity * (mercury ? 10 : 14), dt);
      critical(m.angle, m.time * 0.075, dt);
      critical(m.breath, mercury ? 1 : 1 + 0.012 * Math.sin(m.time * 0.48), dt);
      if (mercury) {
        // Optional route tangent; callers supplying only the documented state
        // get vertical travel. The page supplies its already measured tangent.
        critical(m.tx, s.tx == null ? 0 : s.tx, dt);
        critical(m.ty, s.ty == null ? 1 : s.ty, dt);
        critical(m.flow, vel, dt);
        critical(m.lag, -vel * (m.mobile ? 2 : 5), dt);
        wobble(m.stretch, Math.abs(vel) * 0.35, dt);
      }
      if (id === 'ferro' || id === 'lite') {
        for (j = 0; j < 8; j++) {
          a = j * TAU / 8 + m.angle.x;
          gain = Math.max(0, Math.cos(a) * dx + Math.sin(a) * dy);
          critical(m.spikes[j], gain * gain * gain * proximity, dt);
          m.values[j] = m.spikes[j].x;
        }
      }
    };
    return m;
  }

  var vertexSource = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  var fragmentSource = [
    'precision highp float;',
    'uniform vec2 uRes,uOffset,uPull,uTravel;',
    'uniform float uSize,uRadius,uAngle,uStretch,uFlow,uDark;',
    'uniform float uSpikes[8];',
    'float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}',
    'float segment2(vec2 p,vec2 a,vec2 b){vec2 e=b-a;vec2 q=p-a-e*clamp(dot(p-a,e)/dot(e,e),0.0,1.0);return dot(q,q);}',
    'float cone(vec2 p,float r,float gain){',
    '  float w=r*(0.08+0.10*gain);',
    '  vec2 a=vec2(r*0.82,-w),b=vec2(r*(1.0+0.75*gain),0.0),c=vec2(r*0.82,w);',
    '  float d=min(segment2(p,a,b),min(segment2(p,b,c),segment2(p,c,a)));',
    '  float side=min(cross2(b-a,p-a),min(cross2(c-b,p-b),cross2(a-c,p-c)));',
    '  return sqrt(d)*(side<0.0?1.0:-1.0);',
    '}',
    'float smoothMin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}',
    'float body(vec2 p){',
    '  vec2 q=p-uOffset;',
    '  float pull=length(uPull),r=uRadius;',
    '  vec2 axis=uPull/max(pull,0.0001);',
    '  float elongation=1.0+0.10*clamp(pull/14.0,0.0,1.0);',
    '  q-=axis*dot(q,axis)*(1.0-1.0/elongation);',
    '#if MODE == 1',
    '  vec2 along=uTravel/max(length(uTravel),0.0001);',
    '  float stretch=1.0+uStretch;',
    '  float y=dot(q,along)/stretch;',
    '  float taper=1.0+0.16*uFlow*clamp(y/r,-1.0,1.0);',
    '  vec2 mercury=vec2(dot(q,vec2(along.y,-along.x))*sqrt(stretch)/taper,y);',
    '  float d=length(mercury)-r;',
    '#else',
    '  float d=length(q)-r;',
    '#endif',
    '#if MODE == 0',
    '  for(int i=0;i<8;i++){',
    '    float gain=uSpikes[i];',
    '    if(gain>0.002){',
    '      float a=float(i)*0.78539816339+uAngle;',
    '      vec2 direction=vec2(cos(a),sin(a));',
    '      vec2 local=vec2(dot(q,direction),dot(q,vec2(-direction.y,direction.x)));',
    '      d=smoothMin(d,cone(local,r,gain),r*0.10*gain);',
    '    }',
    '  }',
    '#else',
    '  float facing=max(0.0,dot(q/max(length(q),0.0001),axis));',
    '  d-=r*0.08*clamp(pull/14.0,0.0,1.0)*facing*facing*facing;',
    '#endif',
    '  return d;',
    '}',
    'float heightAt(vec2 p){float d=clamp(body(p),-uRadius,0.0);return sqrt(max(0.0,-d*(2.0*uRadius+d)));}',
    // Light studio, rectangular softboxes, and two narrow dark reflections.
    'float studio(vec3 R){',
    '  vec2 rx=R.xy,v=(rx-vec2(-0.15,0.35))*vec2(0.9,1.6);',
    '  float env=0.05+0.04*rx.y+0.42*exp(-dot(v,v)*3.0);',
    '  vec2 b=abs(rx-vec2(-0.12,0.30))-vec2(0.40,0.05);float box=max(b.x,b.y);',
    '  env+=0.30*(1.0-smoothstep(-0.03,0.12,box))+0.55*(1.0-smoothstep(-0.008,0.012,box));',
    '  vec2 b2=abs(rx-vec2(0.36,-0.10))-vec2(0.03,0.30);',
    '  env+=0.30*(1.0-smoothstep(-0.005,0.02,max(b2.x,b2.y)));',
    '  env+=0.22*(1.0-smoothstep(0.0,0.035,abs(rx.y+0.10+0.12*rx.x)));',
    '  env+=0.14*(1.0-smoothstep(0.0,0.03,abs(rx.y-0.62-0.08*rx.x)));',
    '  env+=smoothstep(0.62,0.97,length(rx))*(0.30+0.45*dot(normalize(rx+0.00001),vec2(-0.53,0.85)));',
    '  return env;',
    '}',
    'void main(){',
    '  vec2 p=(gl_FragCoord.xy/uRes-0.5)*uSize;p.y=-p.y;',
    '  float d=body(p),aa=1.3*uSize/uRes.x;',
    '  float alpha=1.0-smoothstep(-0.5*aa,0.5*aa,d);',
    '  if(alpha<=0.0){gl_FragColor=vec4(0.0);return;}',
    '  float e=0.45;',
    '  vec2 gradient=vec2(heightAt(p+vec2(e,0.0))-heightAt(p-vec2(e,0.0)),heightAt(p+vec2(0.0,e))-heightAt(p-vec2(0.0,e)))/(2.0*e);',
    '  vec3 N=normalize(vec3(-gradient.x,gradient.y,1.0));',
    '  vec3 R=reflect(vec3(0.0,0.0,-1.0),N);',
    '  float bandA=1.0-smoothstep(0.018,0.055,abs(R.y+0.10+0.14*R.x));',
    '  float bandB=1.0-smoothstep(0.012,0.040,abs(R.y-0.48-0.08*R.x));',
    '  vec2 spot=(R.xy-vec2(-0.30,0.46))*vec2(12.0,18.0);',
    '  float rim=1.0-smoothstep(0.0,1.8,max(0.0,-d));',
    // Chrome = high value range: dark floor below the horizon, bright sky above, darker toward the silhouette.
    '  float horizon=smoothstep(-0.32,0.22,R.y+0.10*R.x);',
    '  vec3 floorC=mix(vec3(0.16,0.17,0.19),vec3(0.30,0.32,0.35),uDark);',
    '  vec3 skyC=mix(vec3(0.70,0.73,0.76),vec3(0.62,0.65,0.69),uDark);',
    '  vec3 chrome=mix(floorC+0.30*smoothstep(-0.25,-0.85,R.y),skyC,horizon)+0.42*vec3(studio(R));',
    '  chrome-=vec3(0.45)*bandA*horizon+vec3(0.30)*bandB;',
    '  chrome+=vec3(0.55)*exp(-dot(spot,spot));',
    '  float edge=pow(1.0-clamp(N.z,0.0,1.0),1.6);',
    '  chrome=mix(chrome,floorC*0.8,edge*0.55);',
    '  chrome=mix(chrome,vec3(mix(0.62,0.97,uDark)),rim*mix(0.35,0.80,uDark));',
    '  chrome=clamp(chrome,0.07,1.0);',
    '  gl_FragColor=vec4(chrome*alpha,alpha);',
    '}'
  ].join('\n');

  function svgNode(name, attributes, parent) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name), key;
    for (key in attributes) if (Object.prototype.hasOwnProperty.call(attributes, key)) el.setAttribute(key, attributes[key]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function gradient(parent, type, id, attributes, stops) {
    var el = svgNode(type, attributes, parent), i;
    el.setAttribute('id', id);
    for (i = 0; i < stops.length; i++) svgNode('stop', { offset: stops[i][0], 'stop-color': stops[i][1] }, el);
    return el;
  }

  // Intentional vector edition: a machined silver silhouette and curved bands.
  function createLite(host, env) {
    var prefix = 'dropChrome' + (++svgSerial), m = motion('lite', env);
    var svg = svgNode('svg', { 'aria-hidden': 'true', focusable: 'false', viewBox: '-88 -88 176 176' }, host);
    var defs = svgNode('defs', {}, svg);
    gradient(defs, 'radialGradient', prefix + 'body', { cx: '30%', cy: '23%', r: '79%' }, [
      ['0', '#FFFFFF'], ['.25', '#F2F5F7'], ['.43', '#BDC5CC'],
      ['.49', '#384048'], ['.56', '#FFFFFF'], ['.76', '#B5BFC8'],
      ['.93', '#424D58'], ['1', '#F4F7FA']
    ]);
    gradient(defs, 'linearGradient', prefix + 'spike', { x1: '0', y1: '0', x2: '0', y2: '1' }, [
      ['0', '#FFFFFF'], ['.28', '#D9E0E6'], ['.45', '#303943'],
      ['.55', '#F8FAFC'], ['.8', '#7E8B96'], ['1', '#E8EEF3']
    ]);
    gradient(defs, 'linearGradient', prefix + 'band', { x1: '0', y1: '0', x2: '0', y2: '1' }, [
      ['0', '#20272E'], ['.5', '#46525D'], ['.78', '#A5B2BD'], ['1', '#FFFFFF']
    ]);
    gradient(defs, 'linearGradient', prefix + 'rim', { x1: '0', y1: '0', x2: '1', y2: '1' }, [
      ['0', '#FFFFFF'], ['.35', '#EEF4F8'], ['.65', '#788894'], ['1', '#FFFFFF']
    ]);
    var clip = svgNode('clipPath', { id: prefix + 'clip' }, defs);
    svgNode('circle', { r: '1' }, clip);
    var movable = svgNode('g', {}, svg), spikesGroup = svgNode('g', {}, movable);
    var polygons = [], lengths = [], radii = [], i;
    for (i = 0; i < 8; i++) {
      polygons.push(svgNode('polygon', {
        fill: 'url(#' + prefix + 'spike)', transform: 'rotate(' + (i * 45) + ')', opacity: '0'
      }, spikesGroup));
      lengths.push(-1); radii.push(-1);
    }
    var ball = svgNode('g', { transform: 'scale(28)' }, movable);
    svgNode('circle', { r: '1', fill: 'url(#' + prefix + 'body)' }, ball);
    var bands = svgNode('g', { 'clip-path': 'url(#' + prefix + 'clip)' }, ball);
    svgNode('path', {
      d: 'M -1 -.17 C -.5 .10 .35 .25 1.04 .04 L 1.04 .22 C .3 .45 -.55 .31 -1.04 .02 Z',
      fill: 'url(#' + prefix + 'band)'
    }, bands);
    svgNode('path', {
      d: 'M -.98 .51 C -.35 .76 .36 .83 1.02 .41 L 1.04 .55 C .4 .98 -.4 .96 -1.02 .64 Z',
      fill: 'url(#' + prefix + 'band)', opacity: '.86'
    }, bands);
    svgNode('path', {
      d: 'M -.79 -.47 C -.49 -.76 .26 -.73 .73 -.53 C .26 -.63 -.32 -.62 -.72 -.39 Z',
      fill: '#FFFFFF', opacity: '.94'
    }, bands);
    var rim = svgNode('circle', { r: '.988', fill: 'none', stroke: 'url(#' + prefix + 'rim)', 'stroke-width': '.024' }, ball);
    var lastX = -999, lastY = -999, lastRadius = -1, lastAngle = -999, lastDark = null;
    var api = { isLite: true, wantsTrail: false };
    api.resize = function (size) {
      m.resize(size);
      svg.setAttribute('viewBox', (-size / 2) + ' ' + (-size / 2) + ' ' + size + ' ' + size);
      lastRadius = -1;
      ball.setAttribute('transform', 'scale(' + (m.mobile ? 15 : 28) + ')');
    };
    api.frame = function (t, s) {
      m.update(s);
      var r = (m.mobile ? 15 : 28) * m.breath.x, length, gain, w, j;
      if (Math.abs(m.x.x - lastX) > 0.2 || Math.abs(m.y.x - lastY) > 0.2) {
        movable.setAttribute('transform', 'translate(' + m.x.x.toFixed(2) + ' ' + m.y.x.toFixed(2) + ')');
        lastX = m.x.x; lastY = m.y.x;
      }
      if (Math.abs(r - lastRadius) > 0.2) {
        ball.setAttribute('transform', 'scale(' + r.toFixed(3) + ')'); lastRadius = r;
      }
      if (Math.abs(m.angle.x - lastAngle) * r * 1.75 > 0.2) {
        spikesGroup.setAttribute('transform', 'rotate(' + (m.angle.x * 180 / Math.PI).toFixed(3) + ')');
        lastAngle = m.angle.x;
      }
      for (j = 0; j < 8; j++) {
        gain = m.values[j]; length = r * 0.75 * gain;
        if (Math.abs(length - lengths[j]) > 0.2 || Math.abs(r - radii[j]) > 0.2 || (length <= 0.2 && lengths[j] > 0.2)) {
          w = r * (0.08 + 0.10 * gain);
          polygons[j].setAttribute('points', (r * 0.82).toFixed(2) + ',' + (-w).toFixed(2) + ' ' + (r + length).toFixed(2) + ',0 ' + (r * 0.82).toFixed(2) + ',' + w.toFixed(2));
          polygons[j].setAttribute('opacity', length > 0.2 ? '1' : '0');
          lengths[j] = length; radii[j] = r;
        }
      }
      if (lastDark !== s.dark) {
        rim.setAttribute('opacity', s.dark ? '1' : '.65'); lastDark = s.dark;
      }
    };
    api.destroy = function () { if (svg.parentNode) svg.parentNode.removeChild(svg); };
    return api;
  }

  function createGL(id, host, env) {
    var canvas = document.createElement('canvas'), gl = null, program = null, buffer = null;
    var vertex = null, fragment = null, lose = null, fallback = null, dead = false;
    var m = motion(id, env), size = env.mobile ? 48 : 176, dpr = 1;
    var u = {}, api = { isLite: false, wantsTrail: id === 'trail' };

    function release() {
      canvas.removeEventListener('webglcontextlost', lost);
      if (gl && !gl.isContextLost()) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        if (lose) lose.loseContext();
      }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      gl = null; buffer = null; program = null; vertex = null; fragment = null;
    }
    function useLite(reason) {
      if (fallback || dead) return;
      release();
      fallback = createLite(host, env);
      fallback.resize(size, dpr);
      api.isLite = true; api.wantsTrail = false; api.fallbackReason = reason;
    }
    function lost(e) { e.preventDefault(); useLite('WebGL context lost'); }
    function compile(type, source) {
      var shader = gl.createShader(type);
      if (!shader) throw new Error('Shader allocation failed');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader); throw new Error('Shader compilation failed');
      }
      return shader;
    }
    api.resize = function (cssSize, ratio) {
      size = cssSize; dpr = Math.min(ratio || 1, 1.5); m.resize(size);
      if (fallback) { fallback.resize(size, dpr); return; }
      if (!gl || dead) return;
      var pixels = Math.max(1, Math.round(size * dpr));
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels; canvas.height = pixels;
      }
      gl.viewport(0, 0, pixels, pixels);
    };
    api.frame = function (t, s) {
      if (dead) return;
      if (fallback) { fallback.frame(t, s); return; }
      if (!gl || gl.isContextLost()) {
        useLite('WebGL context lost');
        if (fallback) fallback.frame(t, s);
        return;
      }
      m.update(s);
      var tx = m.tx.x, ty = m.ty.x, magnitude = Math.sqrt(tx * tx + ty * ty);
      if (magnitude < 0.001) { tx = 0; ty = 1; } else { tx /= magnitude; ty /= magnitude; }
      gl.useProgram(program);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uSize, size);
      gl.uniform1f(u.uRadius, (m.mobile ? 15 : 28) * m.breath.x);
      gl.uniform2f(u.uPull, m.x.x, m.y.x);
      gl.uniform2f(u.uOffset, m.x.x + tx * m.lag.x, m.y.x + ty * m.lag.x);
      gl.uniform2f(u.uTravel, tx, ty);
      gl.uniform1f(u.uAngle, m.angle.x);
      gl.uniform1f(u.uStretch, clamp(m.stretch.x, -0.12, 0.35));
      gl.uniform1f(u.uFlow, m.flow.x);
      gl.uniform1f(u.uDark, s.dark ? 1 : 0);
      gl.uniform1fv(u.uSpikes, m.values);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    api.destroy = function () {
      dead = true;
      if (fallback) { fallback.destroy(); fallback = null; }
      release();
    };
    canvas.addEventListener('webglcontextlost', lost, false);
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) throw new Error('WebGL unavailable');
      lose = gl.getExtension('WEBGL_lose_context');
      vertex = compile(gl.VERTEX_SHADER, vertexSource);
      fragment = compile(gl.FRAGMENT_SHADER, '#define MODE ' + (id === 'ferro' ? 0 : id === 'mercury' ? 1 : 2) + '\n' + fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
      gl.deleteShader(vertex); gl.deleteShader(fragment); vertex = null; fragment = null;
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var location = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      var names = ['uRes', 'uSize', 'uRadius', 'uOffset', 'uPull', 'uTravel', 'uAngle', 'uStretch', 'uFlow', 'uDark'], i;
      for (i = 0; i < names.length; i++) u[names[i]] = gl.getUniformLocation(program, names[i]);
      u.uSpikes = gl.getUniformLocation(program, 'uSpikes[0]');
      host.appendChild(canvas);
      api.resize(size, window.devicePixelRatio || 1);
    } catch (e) { useLite(e.message || 'WebGL unavailable'); }
    return api;
  }

  window.DropVariants = {
    list: list,
    create: function (id, host, env) {
      env = env || { reduce: false, mobile: false };
      if (id === 'lite') return createLite(host, env);
      if (id !== 'mercury' && id !== 'trail') id = 'ferro';
      return createGL(id, host, env);
    }
  };
})(window, document);
