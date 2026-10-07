/*
 * Liquid-metal colour bands, dispersion, contour response, simplex noise and
 * colour-burn tint adapted from Paper Shaders @paper-design/shaders 0.0.81.
 * Copyright 2026 Paper. Apache License 2.0. See licenses/LICENSE
 * and licenses/NOTICE. Shape SDF, mounting and UI code are new.
 */
(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const $ = (selector) => document.querySelector(selector);
  const stage = $('#stage');
  const journey = $('.journey');
  const metalCanvas = $('#metal');
  const orb = $('#orb');
  const sheet = $('#kontakt');
  const closeButton = $('#close-contact');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const settings = { morph: 0, tint: 0.48, brightness: 0.85, stripes: 2.1, speed: 0.42, wobble: 0.68, rim: 0.028, colorBack: '#111316', colorTint: '#d4d6d3', repetition: 2.1, softness: 0.025, shiftRed: 0, shiftBlue: 0, distortion: 0.68, contour: 0.3, angle: 0, depth: 0.7, shadow: 0.55, env: 3, envAngle: 8, envSharp: 0.055, fresnel: 1.03, spec: 0.96, heightAmp: 0.128, noiseAmp: 0.024, baseColor: '#2a2e34', ambient: 0.14, exposure: 1.15, paperMix: 0.15, shoulder: 0.11 };
  Object.assign(settings, {"env":3,"envAngle":-45.5098,"envSharp":0.077,"fresnel":1.6203,"spec":1.1805,"heightAmp":0.1423,"noiseAmp":0.0316,"shiftRed":0,"shiftBlue":0,"paperMix":0.2768,"shoulder":0.1594,"baseColor":"#22262c","ambient":0.2148,"exposure":1.2343,"rim":0.0245}); // R4-004, thin rim, no dispersion
  const query = new URLSearchParams(location.search);
  const tune = query.has('tune');
  const still = query.has('still');
  try {
    const overrides = JSON.parse(query.get('s') || '{}');
    for (const key of Object.keys(settings)) if (Object.hasOwn(overrides, key)) settings[key] = overrides[key];
    if (Object.hasOwn(overrides, 'stripes') && !Object.hasOwn(overrides, 'repetition')) settings.repetition = settings.stripes;
    if (Object.hasOwn(overrides, 'wobble') && !Object.hasOwn(overrides, 'distortion')) settings.distortion = settings.wobble;
  } catch (error) { console.warn('Invalid settings JSON:', error); }
  if (still) {
    settings.morph = Math.min(1, Math.max(0, Number(query.get('morph') ?? 0) || 0));
    document.documentElement.classList.add('still');
  }
  const hexColor = (value) => {
    const hex = String(value).replace('#', '');
    if (!/^[\da-f]{6}$/i.test(hex)) return [0.08, 0.09, 0.10];
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let morphOverride = false;
  let openedFrom = null;
  let contactOpen = false;
  let stageVisible = true;
  let pending = false;
  let lastDraw = 0;
  let elapsed = 0;
  let lastTick = 0;
  let layout = {};
  let renderDpr = Math.min(devicePixelRatio || 1, 2);
  let slowFrames = 0;
  let pointerTurn = 0;
  let rimPulse = 0;
  const arrowCanvas = $('#arrow-metal');

  const vertex300 = `#version 300 es
  precision highp float;
  out vec2 v_uv;
  void main(){
    vec2 p=vec2(float((gl_VertexID << 1)&2),float(gl_VertexID&2));
    v_uv=p;
    gl_Position=vec4(p*2.0-1.0,0.0,1.0);
  }`;
  const vertex100 = `precision highp float;
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main(){v_uv=a_position;gl_Position=vec4(a_position*2.0-1.0,0.0,1.0);}`;

  // Paper's band composition is retained; the uploaded/preprocessed mask is
  // replaced by the signed-distance field below. No per-frame textures exist.
  const fragmentBody = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform vec2 u_outer;
  uniform float u_morph,u_time,u_tint,u_brightness,u_stripes,u_wobble,u_rim,u_mode;
  uniform float u_repetition,u_softness,u_shiftRed,u_shiftBlue,u_distortion,u_contour,u_angle,u_depth,u_shadow,u_still;
  uniform float u_env,u_envAngle,u_envSharp,u_fresnel,u_spec,u_heightAmp,u_noiseAmp,u_paperMix,u_shoulder,u_ambient,u_exposure,u_pointerTurn,u_rimPulse,u_arrowHover;
  uniform vec3 u_colorBack,u_colorTint,u_baseColor;
  VARYING vec2 v_uv;
  #define PI 3.14159265358979323846
  vec2 rotate(vec2 uv,float th){return mat2(cos(th),sin(th),-sin(th),cos(th))*uv;}
  vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.0);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m;m=m*m;vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;
    vec3 ox=floor(x+0.5);vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
  float sdRoundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
  float sdSegment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));}
  vec3 gaussian(vec2 p,vec2 centre,float scale,float weight){
    vec2 d=p-centre;float value=weight*exp(-scale*dot(d,d));
    return vec3(value,-2.0*scale*value*d);
  }
  vec3 blobField(vec2 q,vec2 halfSize,float time){
    vec2 p=q/halfSize;
    vec3 field=gaussian(p,vec2(0.0),1.8,0.50);
    for(int i=0;i<5;i++){
      float n=float(i);
      float phase=n*2.39996+time*(0.38+0.035*n);
      vec2 centre=vec2(cos(phase),sin(phase))*vec2(0.70,0.66);
      centre+=vec2(0.045*sin(time*0.8+n),0.035*cos(time*0.7+n));
      field+=gaussian(p,centre,5.5,0.32+0.035*sin(time*0.9+n));
    }
    field.yz/=halfSize;
    return field;
  }
  float getColorChanges(float c1,float c2,float stripe_p,vec3 w,float blur,float bump,float tint){
    float ch=mix(c2,c1,smoothstep(0.0,2.0*blur,stripe_p));
    float border=w[0];ch=mix(ch,c2,smoothstep(border,border+2.0*blur,stripe_p));
    border=w[0]+0.4*(1.0-bump)*w[1];ch=mix(ch,c1,smoothstep(border,border+2.0*blur,stripe_p));
    border=w[0]+0.5*(1.0-bump)*w[1];ch=mix(ch,c2,smoothstep(border,border+2.0*blur,stripe_p));
    border=w[0]+w[1];ch=mix(ch,c1,smoothstep(border,border+2.0*blur,stripe_p));
    float gradient_t=(stripe_p-w[0]-w[1])/w[2];
    float gradient=mix(c1,c2,smoothstep(0.0,1.0,gradient_t));
    ch=mix(ch,gradient,smoothstep(border,border+0.5*blur,stripe_p));
    return 1.0-min(1.0,(1.0-ch)/max(tint,0.0001));
  }
  float studioStrip(vec2 r,float x,float width,float softness,float low,float high){
    float across=1.0-smoothstep(width,width+softness,abs(r.x-x));
    float lengthMask=smoothstep(low-0.20,low,r.y)*(1.0-smoothstep(high,high+0.20,r.y));
    return across*lengthMask;
  }
  vec3 chrome(vec2 p,vec2 slope,float mask){
    vec3 normal=normalize(vec3(-slope*u_heightAmp,1.0));
    vec3 view=normalize(vec3(p*0.12,1.0));
    vec3 reflected=reflect(-view,normal);
    vec2 r=rotate(reflected.xy,(u_envAngle+u_pointerTurn)*PI/180.0);
    float envLayout=floor(clamp(u_env,0.0,3.0)+0.5);
    float offset=(envLayout-1.5)*0.075;
    float soft=max(u_envSharp,0.004);
    float strips=studioStrip(r,-0.52+offset,0.035,soft,-0.85,0.84);
    strips+=0.88*studioStrip(r,0.28-offset*0.5,0.065,soft,-0.62,0.96);
    strips+=0.55*studioStrip(r,0.73+offset*0.4,0.025,soft,-0.94,0.48);
    float horizon=0.82*(1.0-smoothstep(0.012,0.012+soft*0.42,abs(r.y+0.28)));
    float fill=0.16*(1.0-smoothstep(0.22,0.65,abs(r.x+0.12)));
    float wall=0.08+0.15*smoothstep(-0.75,0.75,r.y);
    vec3 environment=vec3(0.90,0.96,1.02)*u_ambient+vec3(0.91,0.96,1.0)*wall+vec3(0.95,0.96,0.98)*min(strips,1.0)+vec3(0.92,0.95,0.98)*horizon+vec3(0.20,0.23,0.27)*fill;
    float rim=pow(1.0-max(dot(normal,view),0.0),2.6)*u_fresnel;
    vec3 key=normalize(vec3(-0.48,0.72,0.50));
    float glint=pow(max(dot(reflect(-key,normal),view),0.0),76.0);
    vec3 color=u_baseColor*(0.72+0.9*rim)+environment*(0.42+0.55*rim)*u_spec;
    color+=vec3(0.94,0.96,1.0)*glint*0.75*u_spec;
    color+=vec3(0.25,0.28,0.32)*pow(mask,5.0)*rim*0.18;
    return color;
  }
  void main(){
    float aspect=u_resolution.x/u_resolution.y;
    vec2 p=(v_uv-0.5)*vec2(aspect,1.0);
    float t=0.3*(u_time+2.8);
    if(u_mode>2.5){
      vec2 q=p-vec2((v_uv.x<0.5?-0.25:0.25)*aspect,0.0);
      float side=v_uv.x<0.5?-1.0:1.0;
      float lean=step(0.5,side*u_arrowHover);
      q=rotate(q-vec2(side*lean*0.035,0.0),side*lean*0.13);
      float stroke=min(sdSegment(q,vec2(-side*0.13,0.24),vec2(side*0.09,0.0)),sdSegment(q,vec2(side*0.09,0.0),vec2(-side*0.13,-0.24)));
      float shape=stroke-(0.061+0.003*sin(t*1.2));
      float aa=max(fwidth(shape),1.0/u_resolution.y);
      float cover=1.0-smoothstep(-aa,aa,shape);
      vec2 slope=vec2(dFdx(shape),dFdy(shape))*u_resolution.y*0.27;
      vec3 shade=chrome(q,slope,1.0);
      shade+=vec3(0.15,0.17,0.19)*(1.0-smoothstep(-0.038,-0.012,shape));
      shade=clamp(shade*u_exposure,0.0,1.0);
      FRAG_COLOR=vec4(shade*cover,cover);
      return;
    }
    float edge=0.0,alpha=1.0,shadow=0.0,heightField=0.0,chromeMask=0.0,innerLip=0.0;
    vec2 chromeSlope=vec2(0.0);
    vec2 uv=v_uv;
    if(u_mode<1.5){
      float m=(u_mode>0.5)?0.0:u_morph;
      float flatten=smoothstep(0.0,0.48,m);
      vec2 centre=vec2(0.0,mix(-0.015,0.0,flatten));
      vec2 halfSize=mix(vec2(0.42*aspect,0.39),u_outer,flatten);
      if(u_mode>0.5){centre=vec2(0.0);halfSize=vec2(0.37,0.37);}
      if(u_still>0.5 && u_mode<0.5 && m<0.01){centre=vec2(0.0);}
      vec2 q=p-centre;
      vec3 field=vec3(0.0);
      if(flatten<0.999) field=blobField(q,halfSize,u_time);
      float blob=(0.25-field.x)/max(length(field.yz),0.25);
      float corner=min(0.12,min(halfSize.x,halfSize.y)*0.55);
      float wave=0.006*u_distortion*mix(1.0,0.28,flatten)*snoise(q*7.0+vec2(u_time*0.6,-u_time*0.4));
      float slab=sdRoundBox(q,halfSize,corner)-wave;
      float outer=mix(blob,slab,flatten);
      float ring=outer;
      float hole=0.0,inner=1.0;
      if(u_mode<0.5){
        hole=smoothstep(0.63,0.96,m);
        if(hole>0.001){
          float rim=min(halfSize.x*2.0*clamp(u_rim,0.015,0.05),halfSize.y*0.38);
          vec2 innerSize=max(halfSize-vec2(rim),vec2(0.001))*hole;
          inner=sdRoundBox(q,innerSize,max(0.001,corner-rim)*hole);
          ring=max(outer,-inner);
          innerLip=smoothstep(0.95,1.0,hole)*(1.0-smoothstep(0.0,1.0/u_resolution.y,inner));
        }
      }
      float aa=max(fwidth(ring)*0.5,0.5/u_resolution.y);
      alpha=1.0-smoothstep(-aa,aa,ring);
      edge=1.0-smoothstep(0.0,mix(0.10,0.060,flatten),-ring);
      float domeT=clamp((field.x-0.25)/0.55,0.0,1.0);
      float blobHeight=domeT*domeT*(3.0-2.0*domeT);
      vec2 blobSlope=6.0*domeT*(1.0-domeT)/0.55*field.yz;
      float slabHeight=smoothstep(0.0,max(u_shoulder,0.005),-slab);
      vec2 pixelSize=max(abs(dFdx(p)),vec2(0.00001))+max(abs(dFdy(p)),vec2(0.00001));
      vec2 slabSlope=vec2(dFdx(slabHeight)/pixelSize.x,dFdy(slabHeight)/pixelSize.y);
      float across=clamp(-outer/max(inner-outer,0.0001),0.0,1.0);
      float tubeHeight=sqrt(max(0.0,1.0-pow(2.0*across-1.0,2.0)))*clamp(u_rim,0.015,0.05)/0.07;
      tubeHeight+=u_rimPulse*0.10*sin(25.0*atan(q.y,q.x)-u_time*3.0)*exp(-u_rimPulse*2.0)*smoothstep(aa*1.5,aa*5.0,-ring);
      vec2 tubeSlope=vec2(dFdx(tubeHeight)/pixelSize.x,dFdy(tubeHeight)/pixelSize.y);
      heightField=mix(mix(blobHeight,slabHeight,flatten),tubeHeight,hole);
      chromeSlope=mix(mix(blobSlope,slabSlope,flatten),tubeSlope,hole);
      float liquid=snoise(q*3.2+vec2(u_time*0.24,-u_time*0.18));
      liquid+=flatten*0.22*snoise(q*7.0+vec2(-u_time*0.20,u_time*0.24));
      float bandScale=mix(1.0,clamp(u_rim,0.015,0.05)/0.07,hole);
      float edgeBand=smoothstep(0.0,0.015*bandScale,-ring)*(1.0-smoothstep(0.045*bandScale,0.12*bandScale,-ring));
      float surfaceNoise=u_noiseAmp*liquid*edgeBand*bandScale*mix(0.22,1.0,flatten)*smoothstep(aa*1.5,aa*5.0,-ring);
      heightField+=surfaceNoise;
      chromeSlope+=vec2(dFdx(surfaceNoise)/pixelSize.x,dFdy(surfaceNoise)/pixelSize.y);
      chromeMask=1.0-smoothstep(0.0,0.11,-ring);
      // A soft ellipse touches the floor below the blob; no full-quad shadow mask.
      vec2 floorPos=(q+vec2(-0.025,halfSize.y*0.94))/vec2(halfSize.x*0.98,0.048);
      shadow=exp(-dot(floorPos,floorPos)*2.0)*0.45*u_shadow*(1.0-flatten);
      uv=q/(halfSize*2.0)+0.5;
      uv.y=1.0-uv.y;
    }else{
      // Full opaque sheet; a rolling crest just below the fixed page header.
      float crest=0.463+0.015*sin(p.x*8.0+t*0.8)+0.008*sin(p.x*17.0-t*0.45);
      edge=1.0-smoothstep(0.0,0.14,max(0.0,crest-p.y));
      heightField=max(0.0,0.09-abs(p.y-crest))*2.0;
      uv=v_uv;
    }
    vec2 rotatedUV=rotate(uv-0.5,u_angle*PI/180.0)+0.5;
    float diagBLtoTR=rotatedUV.x-rotatedUV.y;
    float diagTLtoBR=rotatedUV.x+rotatedUV.y;
    vec3 color1=vec3(0.98,0.98,1.0);
    vec3 color2=vec3(0.10,0.10,0.10+0.1*smoothstep(0.7,1.3,diagTLtoBR));
    vec2 grad_uv=uv-0.5;
    float dist=length(grad_uv+vec2(0.0,0.2*diagBLtoTR));
    grad_uv=rotate(grad_uv,(0.25-0.2*diagBLtoTR)*PI);
    float direction=grad_uv.x;
    float bump=1.0-pow(1.8*dist,1.2);
    bump*=pow(max(uv.y,0.001),0.3);
    float cycleWidth=max(u_repetition,0.3);
    float thin1=0.12*(1.0-0.4*bump);
    float thin2=0.07*(1.0+0.4*bump);
    float wide=1.0-thin1/cycleWidth-thin2/cycleWidth;
    float noise=snoise(uv-t);
    edge+=(1.0-edge)*0.07*noise*u_contour;
    direction+=diagBLtoTR;
    direction-=2.0*noise*diagBLtoTR*(smoothstep(0.0,1.0,edge)*(1.0-smoothstep(0.0,1.0,edge)))*u_contour;
    direction*=mix(1.0,1.0-edge,u_contour);
    direction-=0.36*edge*u_contour;
    direction+=0.02*(1.0-smoothstep(0.0,1.0,edge));
    bump*=clamp(pow(max(uv.y,0.001),0.1),0.3,1.0);
    direction*=(0.1+(1.1-edge)*bump);
    direction*=(0.4+0.6*(1.0-smoothstep(0.5,1.0,edge)));
    direction+=0.18*(smoothstep(0.1,0.2,uv.y)*(1.0-smoothstep(0.2,0.4,uv.y)));
    direction+=0.03*(smoothstep(0.1,0.2,1.0-uv.y)*(1.0-smoothstep(0.2,0.4,1.0-uv.y)));
    direction*=(0.5+0.5*pow(uv.y,2.0));
    direction*=cycleWidth;direction-=t;
    float dispersion=clamp(1.0-bump,0.0,1.0);
    float red=dispersion+0.03*bump*noise-diagBLtoTR;
    float blue=dispersion*1.3-0.2*edge;
    red*=clamp(u_shiftRed,0.0,0.02);blue*=clamp(u_shiftBlue,0.0,0.02);
    float blur=u_softness+fwidth(direction)*0.5;
    vec3 w=vec3(thin1,thin2-0.02*smoothstep(0.0,1.0,edge+bump),wide);
    vec3 tint=mix(vec3(0.55),vec3(0.90),u_tint);
    float r=getColorChanges(color1.r,color2.r,fract(direction+red),w,blur,bump,tint.r);
    float g=getColorChanges(color1.g,color2.g,fract(direction),w,blur,bump,tint.g);
    float b=getColorChanges(color1.b,color2.b,fract(direction-blue),w,blur,bump,tint.b);
    vec3 bands=pow(clamp(vec3(r,g,b),0.0,1.0),vec3(3.4));
    vec3 normal=normalize(vec3(-dFdx(heightField)*u_resolution.y*0.015*u_depth,-dFdy(heightField)*u_resolution.y*0.015*u_depth,1.0));
    vec3 light=normalize(vec3(-0.42,0.75,0.55));
    float diffuse=0.58+0.42*max(dot(normal,light),0.0);
    float spec=pow(max(dot(reflect(-light,normal),vec3(0.0,0.0,1.0)),0.0),28.0);
    float glint=pow(max(dot(reflect(-normalize(vec3(0.65,0.25,0.72)),normal),vec3(0.0,0.0,1.0)),0.0),70.0);
    vec3 color=mix(u_colorBack,u_colorTint,bands*u_brightness)*mix(1.0,diffuse,u_depth);
    color+=u_colorTint*(0.36*spec+0.22*glint)*u_depth;
    color+=u_colorTint*0.09*pow(max(edge,0.0),5.0)*u_depth;
    if(u_mode<1.5){
      color=mix(chrome(p,chromeSlope,chromeMask),color,clamp(u_paperMix,0.0,1.0)*mix(0.35,1.0,flatten));
      color=clamp(color*u_exposure,0.0,1.0)*(1.0-0.70*innerLip);
    }
    vec2 px=floor(gl_FragCoord.xy);
    float grain=fract(sin(dot(px,vec2(127.1,311.7)))*43758.5453);
    float neighbour=0.25*(fract(sin(dot(px+vec2(1.0,0.0),vec2(127.1,311.7)))*43758.5453)+fract(sin(dot(px+vec2(-1.0,0.0),vec2(127.1,311.7)))*43758.5453)+fract(sin(dot(px+vec2(0.0,1.0),vec2(127.1,311.7)))*43758.5453)+fract(sin(dot(px+vec2(0.0,-1.0),vec2(127.1,311.7)))*43758.5453));
    color+=(grain-neighbour)/255.0*step(0.999,alpha);
    if(u_mode>1.5){color=mix(vec3(0.035,0.039,0.040),color*0.52,0.75);alpha=1.0;}
    else if(alpha<0.999){float a=alpha+shadow*(1.0-alpha);color=mix(vec3(0.015),color,alpha/max(a,0.001));alpha=a;}
    FRAG_COLOR=vec4(color*alpha,alpha);
  }`;

  function mount(canvas) {
    let gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
    const webgl2 = !!gl;
    if (!gl) {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
      if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
    }
    const fragment = webgl2
      ? '#version 300 es\n' + fragmentBody.replace('VARYING', 'in').replaceAll('FRAG_COLOR', 'fragColor').replace('  precision highp float;', '  precision highp float;\n  out vec4 fragColor;')
      : '#extension GL_OES_standard_derivatives : enable\n' + fragmentBody.replace('VARYING', 'varying').replaceAll('FRAG_COLOR', 'gl_FragColor');
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Metal shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    const vs = compile(gl.VERTEX_SHADER, webgl2 ? vertex300 : vertex100);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);gl.attachShader(program, fs);gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.warn('Metal link:', gl.getProgramInfoLog(program)); return null; }
    gl.useProgram(program);
    if (!webgl2) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,2,0,0,2]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }
    // Premultiplied output keeps fractional edge coverage clean over the DOM aperture.
    gl.disable(gl.BLEND);
    const uniforms = {};
    for (const name of ['resolution','outer','morph','time','tint','brightness','stripes','wobble','rim','mode','repetition','softness','shiftRed','shiftBlue','distortion','contour','angle','depth','shadow','still','env','envAngle','envSharp','fresnel','spec','heightAmp','noiseAmp','paperMix','shoulder','ambient','exposure','colorBack','colorTint','baseColor','pointerTurn','rimPulse','arrowHover']) uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
    return {
      draw(width, height, outerX, outerY, morph, mode) {
        const scale = renderDpr;
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        canvas.style.width = `${w / scale}px`;
        canvas.style.height = `${h / scale}px`;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0,0,w,h);gl.useProgram(program);
        gl.uniform2f(uniforms.resolution,w,h);
        gl.uniform2f(uniforms.outer,outerX,outerY);
        gl.uniform1f(uniforms.morph,morph);
        gl.uniform1f(uniforms.time,still ? Number(query.get('t') || 0) : reduceMotion.matches ? 0 : elapsed);
        gl.uniform1f(uniforms.tint,settings.tint);
        gl.uniform1f(uniforms.brightness,settings.brightness);
        gl.uniform1f(uniforms.stripes,settings.stripes);
        gl.uniform1f(uniforms.wobble,settings.wobble);
        gl.uniform1f(uniforms.rim,settings.rim);
        gl.uniform1f(uniforms.mode,mode);
        gl.uniform1f(uniforms.pointerTurn,pointerTurn);
        gl.uniform1f(uniforms.rimPulse,rimPulse);
        gl.uniform1f(uniforms.arrowHover,reduceMotion.matches ? 0 : document.querySelector('.carousel-arrow.prev:hover') ? -1 : document.querySelector('.carousel-arrow.next:hover') ? 1 : 0);
        for (const name of ['repetition','softness','shiftRed','shiftBlue','distortion','contour','angle','depth','shadow','env','envAngle','envSharp','fresnel','spec','heightAmp','noiseAmp','paperMix','shoulder','ambient','exposure']) gl.uniform1f(uniforms[name],settings[name]);
        gl.uniform1f(uniforms.still,still ? 1 : 0);
        gl.uniform3fv(uniforms.colorBack,hexColor(settings.colorBack));
        gl.uniform3fv(uniforms.colorTint,hexColor(settings.colorTint));
        gl.uniform3fv(uniforms.baseColor,hexColor(settings.baseColor));
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
    };
  }

  const main = mount(metalCanvas);
  const orbMetal = mount($('#orb-canvas'));
  const sheetMetal = mount($('#sheet-canvas'));
  const arrowsMetal = arrowCanvas ? mount(arrowCanvas) : null;
  if (!main) document.documentElement.classList.add('no-webgl');

  function measure() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const phone = w < 700;
    const short = !phone && h < 600;
    const outerW = phone ? Math.min(w - 24, 620) : Math.min(w * 0.78, 1800);
    const outerH = phone ? Math.min(h * 0.46, outerW * 1.25, 510) : Math.min(h * (short ? 0.46 : 0.70), outerW * 0.59);
    const rim = Math.min(outerW * clamp(settings.rim,0.015,0.05), outerH * 0.38);
    const centreY = (phone ? 0.39 : short ? 0.47 : 0.51) * h;
    const frame = { x:(w-outerW)/2, y:centreY-outerH/2, w:outerW, h:outerH };
    const narrow = w < 900;
    const blobW = Math.min(w * (phone ? 0.82 : short ? 0.30 : narrow ? 0.55 : 0.38), 600);
    const blobH = Math.min(h * (phone ? 0.34 : short ? 0.42 : narrow ? 0.36 : 0.48), 440);
    const blob = { x:short || !narrow ? w-blobW-30 : (w-blobW)/2, y:short || !narrow ? h*0.54-blobH/2 : h-blobH-(phone ? 8 : 25), w:blobW, h:blobH };
    const aperture = { x:frame.x+rim, y:frame.y+rim, w:outerW-2*rim, h:outerH-2*rim };
    layout = { w,h,outerW,outerH,frame,blob,aperture,rim };
    for (const [key,value] of Object.entries(aperture)) stage.style.setProperty(`--aperture-${key}`, `${value}px`);
    stage.style.setProperty('--aperture-radius', `${Math.max(8,Math.min(0.12*(outerH*1.18),outerH*0.275)-rim)}px`);
    window.metalLayout = layout;
    dispatchEvent(new CustomEvent('metal:layout',{detail:layout}));
  }

  function progress() { return clamp((scrollY - journey.offsetTop) / Math.max(1, journey.offsetHeight - innerHeight), 0, 1); }

  function update() {
    const p = still ? 0 : progress();
    const scrollMorph = ease(0.02,0.81,p);
    settings.morph = morphOverride || still ? settings.morph : scrollMorph;
    stage.style.setProperty('--image-opacity', ease(0.68,0.90,settings.morph));
    stage.style.setProperty('--image-scale', 0.6 + 0.4 * ease(0.68,1.0,settings.morph));
    stage.style.setProperty('--caption-opacity', ease(0.84,0.99,settings.morph));
    $('#hero-copy').style.opacity = String(1 - ease(0.08,0.42,settings.morph));
    $('#hero-copy').style.pointerEvents = settings.morph > 0.45 ? 'none' : '';
    orb.classList.toggle('is-visible', p > 0.87 && !contactOpen && layout.w >= 700);
    if (reduceMotion.matches && !morphOverride) {
      const state = p < 0.34 ? 0 : p < 0.67 ? 0.45 : 1;
      settings.morph = state;
      stage.style.setProperty('--image-opacity', state === 1 ? 1 : 0);
      stage.style.setProperty('--image-scale', state === 1 ? 1 : 0.6);
      stage.style.setProperty('--caption-opacity', state === 1 ? 1 : 0);
      $('#hero-copy').style.opacity = state === 0 ? '1' : '0';
    }
    const k = ease(0,1,settings.morph);
    const a = layout.blob, b = layout.frame;
    if (a && b) {
      const mix = (x,y) => x+(y-x)*k;
      const cw=mix(a.w,b.w),ch=mix(a.h,b.h);
      const margin=Math.max(18,Math.min(cw,ch)*0.09);
      const snap = (value) => Math.round(value*renderDpr)/renderDpr;
      metalCanvas.style.left=`${snap(mix(a.x,b.x)-margin)}px`;
      metalCanvas.style.top=`${snap(mix(a.y,b.y)-margin)}px`;
      metalCanvas.style.width=`${snap(cw+2*margin)}px`;
      metalCanvas.style.height=`${snap(ch+2*margin)}px`;
    }
    const ready = settings.morph > 0.96 || !main;
    stage.classList.toggle('frame-ready',ready);
    $('#project-visual').inert = !ready || document.body.classList.contains('inside-site');
    $('#projekty').inert = !ready || document.body.classList.contains('inside-site');
    requestDraw();
  }

  function draw(now) {
    pending = false;
    if (document.hidden) return;
    if (now - lastDraw < 15 && !reduceMotion.matches) { requestDraw(); return; }
    if (lastDraw && now-lastDraw>20 && !reduceMotion.matches) slowFrames++; else slowFrames=0;
    if (slowFrames>=30) {renderDpr=renderDpr>1.75?1.5:renderDpr>1.35?1.25:1;slowFrames=0;update();}
    const dt = Math.min((now - (lastTick || now)) / 1000,0.06);
    lastTick = now;
    lastDraw = now;
    if (!reduceMotion.matches) elapsed += dt * settings.speed;
    if (main && stageVisible && !document.body.classList.contains('inside-site')) {
      const box=metalCanvas.getBoundingClientRect();
      main.draw(box.width,box.height,layout.outerW/box.height/2,layout.outerH/box.height/2,settings.morph,0);
    }
    if (orbMetal && orb.classList.contains('is-visible') && !document.body.classList.contains('inside-site')) orbMetal.draw(orb.clientWidth,orb.clientHeight,0.37,0.37,0,1);
    if (sheetMetal && contactOpen) sheetMetal.draw(innerWidth,innerHeight-$('.site-header').clientHeight,0,0,0,2);
    if (arrowsMetal && stageVisible && stage.classList.contains('frame-ready') && !document.body.classList.contains('inside-site')) arrowsMetal.draw(arrowCanvas.parentElement.clientWidth,arrowCanvas.parentElement.clientHeight,0,0,0,3);
    if (rimPulse>0) rimPulse=Math.max(0,rimPulse-dt*1.4);
    if (still) { if (main) document.body.dataset.ready = '1'; return; }
    if (!reduceMotion.matches && !document.body.classList.contains('inside-site') && (stageVisible || orb.classList.contains('is-visible') || contactOpen)) requestDraw();
  }
  function requestDraw() { if (!pending) { pending = true; requestAnimationFrame(draw); } }
  addEventListener('metal:ripple',()=>{if (!reduceMotion.matches) {rimPulse=1;requestDraw();}});
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) stage.addEventListener('pointermove',(event)=>{
    pointerTurn=clamp((event.clientX/Math.max(innerWidth,1)-0.5)*8,-4,4);
  },{passive:true});

  function openContact(event) {
    event?.preventDefault();
    if (contactOpen) return;
    openedFrom = document.activeElement;
    contactOpen = true;
    sheet.setAttribute('aria-hidden','false');
    document.body.classList.add('body-locked');
    orb.classList.remove('is-visible');
    orb.inert = true;
    $('main').inert = true;
    $('.site-header').inert = true;
    closeButton.focus();
    requestDraw();
  }
  function closeContact() {
    if (!contactOpen) return;
    contactOpen = false;
    sheet.setAttribute('aria-hidden','true');
    document.body.classList.remove('body-locked');
    orb.inert = false;
    $('main').inert = false;
    $('.site-header').inert = false;
    if (openedFrom instanceof HTMLElement) openedFrom.focus();
    update();
  }
  orb.addEventListener('click',openContact);
  $('#nav-contact').addEventListener('click',openContact);
  $('#hero-contact').addEventListener('click',openContact);
  closeButton.addEventListener('click',closeContact);
  $('#contact-form').addEventListener('submit',(event) => {event.preventDefault();$('#form-note').textContent='To tylko podgląd — wiadomość nie została wysłana.';});
  document.addEventListener('keydown',(event) => {
    if (!contactOpen) return;
    if (event.key === 'Escape') {event.preventDefault();closeContact();return;}
    if (event.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button,input,textarea')];
    const first = focusable[0], last = focusable[focusable.length-1];
    if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
  });
  $('a[href="#projekty"]').addEventListener('click',(event) => {
    if (!main) return;
    event.preventDefault();
    scrollTo({top:journey.offsetTop + (journey.offsetHeight-innerHeight)*0.82,behavior:reduceMotion.matches?'instant':'smooth'});
  });
  if (!still) addEventListener('scroll',update,{passive:true});
  new ResizeObserver(() => {measure();update();}).observe(stage);
  document.addEventListener('visibilitychange',() => {lastTick=0;if (!document.hidden) requestDraw();});
  reduceMotion.addEventListener('change',update);
  if (!still) new IntersectionObserver((entries) => {stageVisible=entries[0].isIntersecting;if (stageVisible) requestDraw();},{threshold:0}).observe(stage);

  if (tune) {
    const panel = $('#tune');panel.hidden=false;
    const options = [
      ['morph','Morph',0,1,.01],['tint','Tint',0,1,.01],['brightness','Brightness',0,1.5,.01],
      ['stripes','Stripe scale',.6,6,.05],['speed','Speed',0,2,.01],['wobble','Wobble',0,2,.01],['rim','Rim thickness',.015,.05,.001],
      ['repetition','Repetition',.6,6,.05],['softness','Softness',.002,.12,.002],['shiftRed','Red dispersion',0,.02,.001],['shiftBlue','Blue dispersion',0,.02,.001],
      ['distortion','Distortion',0,2,.01],['contour','Contour',0,1,.01],['angle','Angle',-180,180,1],['depth','Depth',0,1,.01],['shadow','Shadow',0,1,.01],
      ['env','Studio layout',0,3,1],['envAngle','Studio angle',-90,90,1],['envSharp','Light softness',.004,.14,.002],['ambient','Ambient',0,.35,.005],['exposure','Exposure',.6,1.8,.01],['fresnel','Fresnel',0,2,.01],['spec','Specular',0,2,.01],['heightAmp','Dome height',.04,.4,.005],['noiseAmp','Liquid wobble',0,.08,.002],['paperMix','Paper overlay',0,1,.01],['shoulder','Slab shoulder',.02,.20,.005]
    ];
    const holder = $('#tune-controls');
    for (const [key,label,min,max,step] of options) {
      const row = document.createElement('label');
      row.textContent=label;
      const value = document.createElement('output');value.textContent=settings[key].toFixed(2);
      const input = document.createElement('input');
      Object.assign(input,{type:'range',min,max,step,value:settings[key]});
      input.addEventListener('input',() => {
        settings[key]=Number(input.value);value.textContent=settings[key].toFixed(2);
        if (key==='morph') morphOverride=true;
        if (key==='stripes') settings.repetition=settings.stripes;
        if (key==='wobble') settings.distortion=settings.wobble;
        if (key==='rim') measure();
        update();
      });
      row.append(value,input);holder.append(row);
    }
    for (const key of ['colorBack','colorTint','baseColor']) {
      const row = document.createElement('label');row.textContent=key;
      const input = document.createElement('input');input.type='color';input.value=settings[key];
      input.addEventListener('input',() => {settings[key]=input.value;requestDraw();});
      row.append(input);holder.append(row);
    }
    $('#copy-settings').addEventListener('click',async () => {
      const json=JSON.stringify(settings,null,2);
      try {await navigator.clipboard.writeText(json);$('#copy-status').textContent='Skopiowano ustawienia.';}
      catch {const temporary=document.createElement('textarea');temporary.value=json;document.body.append(temporary);temporary.select();document.execCommand('copy');temporary.remove();$('#copy-status').textContent='Skopiowano ustawienia.';}
    });
  }

  measure();update();
})();
