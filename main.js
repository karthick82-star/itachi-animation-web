/* ═══════════════════════════════════════════════════════════
   UCHIHA ITACHI — scroll-scrubbed frames + mouse-tracked eyes
   ═══════════════════════════════════════════════════════════ */

const MAIN_COUNT = 71;
const EYE_COUNT  = 51;
const pad = n => String(n).padStart(3, '0');

const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/* fade in over [a,b], hold, fade out over [c,d] */
const window4 = (p, a, b, c, d) =>
  p < a || p > d ? 0 : p < b ? (p - a) / (b - a) : p > c ? 1 - (p - c) / (d - c) : 1;

/* ───────────────────────── preload ───────────────────────── */
const mainFrames = [];
const eyeFrames  = [];
let loaded = 0;
const total = MAIN_COUNT + EYE_COUNT;

const loaderEl  = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct  = document.getElementById('loaderPct');

function load(src, bucket, index) {
  return new Promise(res => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => {
      bucket[index] = img;
      loaded++;
      const pct = loaded / total;
      if (loaderFill) loaderFill.style.width = (pct * 100).toFixed(1) + '%';
      if (loaderPct) loaderPct.textContent = String(Math.round(pct * 100)).padStart(2, '0');
      res();
    };
    img.src = src;
  });
}

const jobs = [];
for (let i = 1; i <= MAIN_COUNT; i++) jobs.push(load(`frames/main/${pad(i)}.jpg`, mainFrames, i - 1));
for (let i = 1; i <= EYE_COUNT;  i++) jobs.push(load(`frames/eyes/${pad(i)}.jpg`, eyeFrames,  i - 1));

Promise.all(jobs).then(() => {
  setTimeout(() => {
    if (loaderEl) loaderEl.classList.add('done');
    document.body.classList.add('ready');
    resizeAll();
    setTimeout(() => { if (loaderEl) loaderEl.style.display = 'none'; }, 1100);
  }, 420);
});

/* ─────────────────── canvas cover-draw helper ─────────────────── */
function fitCanvas(canvas) {
  if (!canvas) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.offsetWidth  * dpr);
  const h = Math.round(canvas.offsetHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  return canvas.getContext('2d');
}

function syncSize(canvas) {
  if (!canvas) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.offsetWidth * dpr);
  const h = Math.round(canvas.offsetHeight * dpr);
  return canvas.width !== w || canvas.height !== h;
}

function drawCover(ctx, img, cw, ch, maxUp = 2.0) {
  if (!img || !img.naturalWidth) return false;
  const ir = img.naturalWidth / img.naturalHeight;
  let w = cw, h = cw / ir;
  if (h < ch) {
    const s = Math.min(ch / h, maxUp);
    w *= s; h *= s;
  }
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  return true;
}

/* ═══════════════════════════════════════════════════════════
   GHOST CURSOR
   Port of reactbits.dev/animations/ghost-cursor (three.js) to raw WebGL
   ═══════════════════════════════════════════════════════════ */
function createGhostCursor(canvas, opts = {}) {
  if (!canvas) return { resize() {}, move() {}, leave() {}, render() {}, ok: false };
  const TRAIL    = opts.trailLength ?? 28;
  const INERTIA  = opts.inertia ?? 0.5;
  const MAX_DPR  = opts.maxDevicePixelRatio ?? 0.45;
  const BUDGET   = opts.targetPixels ?? 4.2e5;
  const BRIGHT   = opts.brightness ?? 1.45;
  const EDGE     = opts.edgeIntensity ?? 0.35;
  const FADE_DELAY = opts.fadeDelayMs ?? 900;
  const FADE_DUR   = opts.fadeDurationMs ?? 1400;
  const rgb = hexToRgb(opts.color ?? '#ff2b2b');

  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance'
  });
  if (!gl) return { resize() {}, move() {}, leave() {}, render() {}, ok: false };

  const VERT = `
    attribute vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    #define MAX_TRAIL_LENGTH ${TRAIL}

    uniform float iTime;
    uniform vec3  iResolution;
    uniform vec2  iMouse;
    uniform vec2  iPrevMouse[MAX_TRAIL_LENGTH];
    uniform float iOpacity;
    uniform float iScale;
    uniform vec3  iBaseColor;
    uniform float iBrightness;
    uniform float iEdgeIntensity;

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453123); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f *= f * (3. - 2. * f);
      return mix(mix(hash(i + vec2(0.,0.)), hash(i + vec2(1.,0.)), f.x),
                 mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.5;
      mat2 m = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for(int i=0;i<5;i++){
        v += a * noise(p);
        p = m * p * 2.0;
        a *= 0.5;
      }
      return v;
    }
    vec3 tint1(vec3 base){ return mix(base, vec3(1.0), 0.15); }
    vec3 tint2(vec3 base){ return mix(base, vec3(0.8, 0.9, 1.0), 0.25); }

    vec4 blob(vec2 p, vec2 mousePos, float intensity, float activity) {
      vec2 q = vec2(fbm(p * iScale + iTime * 0.1), fbm(p * iScale + vec2(5.2,1.3) + iTime * 0.1));
      vec2 r = vec2(fbm(p * iScale + q * 1.5 + iTime * 0.15), fbm(p * iScale + q * 1.5 + vec2(8.3,2.8) + iTime * 0.15));

      float smoke = fbm(p * iScale + r * 0.8);
      float radius = 0.5 + 0.3 * (1.0 / iScale);
      float distFactor = 1.0 - smoothstep(0.0, radius * activity, length(p - mousePos));
      float alpha = pow(smoke, 2.5) * distFactor;

      vec3 c1 = tint1(iBaseColor);
      vec3 c2 = tint2(iBaseColor);
      vec3 color = mix(c1, c2, sin(iTime * 0.5) * 0.5 + 0.5);

      return vec4(color * alpha * intensity, alpha * intensity);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
      vec2 mouse = (iMouse * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);

      vec3 colorAcc = vec3(0.0);
      float alphaAcc = 0.0;

      vec4 b = blob(uv, mouse, 1.0, iOpacity);
      colorAcc += b.rgb;
      alphaAcc += b.a;

      for (int i = 0; i < MAX_TRAIL_LENGTH; i++) {
        vec2 pm = (iPrevMouse[i] * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
        float t = 1.0 - float(i) / float(MAX_TRAIL_LENGTH);
        t = pow(t, 2.0);
        if (t > 0.01) {
          vec4 bt = blob(uv, pm, t * 0.8, iOpacity);
          colorAcc += bt.rgb;
          alphaAcc += bt.a;
        }
      }

      colorAcc *= iBrightness;

      vec2 uv01 = gl_FragCoord.xy / iResolution.xy;
      float edgeDist = min(min(uv01.x, 1.0 - uv01.x), min(uv01.y, 1.0 - uv01.y));
      float distFromEdge = clamp(edgeDist * 2.0, 0.0, 1.0);
      float k = clamp(iEdgeIntensity, 0.0, 1.0);
      float edgeMask = mix(1.0 - k, 1.0, distFromEdge);

      float outAlpha = clamp(alphaAcc * iOpacity * edgeMask, 0.0, 1.0);
      gl_FragColor = vec4(colorAcc, outAlpha);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('ghost shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return { resize() {}, move() {}, leave() {}, render() {}, ok: false };

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { resize() {}, move() {}, leave() {}, render() {}, ok: false };
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uTime = U('iTime'), uRes = U('iResolution'), uMouse = U('iMouse'),
        uPrev = U('iPrevMouse[0]'), uOpacity = U('iOpacity'), uScale = U('iScale'),
        uColor = U('iBaseColor'), uBright = U('iBrightness'), uEdge = U('iEdgeIntensity');

  gl.uniform3f(uColor, rgb[0], rgb[1], rgb[2]);
  gl.uniform1f(uBright, BRIGHT);
  gl.uniform1f(uEdge, EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const trail = new Float32Array(TRAIL * 2).fill(0.5);
  const flat  = new Float32Array(TRAIL * 2).fill(0.5);
  let head = 0;

  const target = { x: 0.5, y: 0.5 };
  const cur    = { x: 0.5, y: 0.5 };
  const vel    = { x: 0, y: 0 };
  let pointerActive = false;
  let lastMove = performance.now();
  let fade = 0;
  const t0 = performance.now();

  function resize() {
    const cssW = canvas.offsetWidth, cssH = canvas.offsetHeight;
    if (cssW <= 0 || cssH <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const need = cssW * cssH * dpr * dpr;
    const s = need <= BUDGET ? 1 : Math.max(0.4, Math.min(1, Math.sqrt(BUDGET / Math.max(1, need))));
    const pr = dpr * s;
    const w = Math.max(1, Math.floor(cssW * pr));
    const h = Math.max(1, Math.floor(cssH * pr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform3f(uRes, w, h, 1);
    const base = Math.min(Math.max(1, cssW), Math.max(1, cssH));
    gl.uniform1f(uScale, Math.max(0.5, Math.min(2.0, base / 600)));
  }

  function move(x, y, active = true) {
    target.x = clamp(x); target.y = clamp(1 - y);
    pointerActive = active;
    if (active) { lastMove = performance.now(); fade = 1; }
  }
  function leave() { pointerActive = false; lastMove = performance.now(); }

  function render() {
    const now = performance.now();

    if (pointerActive) {
      vel.x = target.x - cur.x; vel.y = target.y - cur.y;
      cur.x = target.x; cur.y = target.y;
      fade = 1;
    } else {
      vel.x *= INERTIA; vel.y *= INERTIA;
      if (vel.x * vel.x + vel.y * vel.y > 1e-6) { cur.x += vel.x; cur.y += vel.y; }
      const dt = now - lastMove;
      if (dt > FADE_DELAY) fade = Math.max(0, 1 - Math.min(1, (dt - FADE_DELAY) / FADE_DUR));
    }
    if (fade <= 0.001 && !pointerActive) { gl.clear(gl.COLOR_BUFFER_BIT); return false; }

    head = (head + 1) % TRAIL;
    trail[head * 2] = cur.x; trail[head * 2 + 1] = cur.y;
    for (let i = 0; i < TRAIL; i++) {
      const src = ((head - i) % TRAIL + TRAIL) % TRAIL;
      flat[i * 2] = trail[src * 2];
      flat[i * 2 + 1] = trail[src * 2 + 1];
    }

    gl.useProgram(prog);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform2f(uMouse, cur.x, cur.y);
    gl.uniform2fv(uPrev, flat);
    gl.uniform1f(uOpacity, fade);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  return { resize, move, leave, render, ok: true };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ═══════════════════ ACT I — scroll scrub ═══════════════════ */
const scrubSection = document.getElementById('scrub');
const mainCanvas   = document.getElementById('mainCanvas');
const scrubGlow    = document.getElementById('scrubGlow');
const titleblock   = document.getElementById('titleblock');
const phases       = [...document.querySelectorAll('.phase')];
let mainCtx = fitCanvas(mainCanvas);

let frameTarget = 0, frameShown = 0, lastDrawn = -1;
let scrubProgress = 0;

function readScrub() {
  if (!scrubSection) return;
  const rect = scrubSection.getBoundingClientRect();
  const dist = scrubSection.offsetHeight - window.innerHeight;
  scrubProgress = clamp(-rect.top / (dist || 1));
  frameTarget = scrubProgress * (MAIN_COUNT - 1);
}

const PHASE_WINDOWS = [
  [0.13, 0.17, 0.21, 0.25],   // 静寂
  [0.27, 0.31, 0.37, 0.42],   // 覚醒
  [0.45, 0.49, 0.63, 0.69],   // 写輪眼
  [0.74, 0.79, 0.97, 1.01],   // 烏
];

function paintOverlays(p) {
  phases.forEach((el, i) => {
    const o = window4(p, ...PHASE_WINDOWS[i]);
    el.style.opacity = o.toFixed(3);
    el.style.setProperty('--y', `${((1 - o) * 34).toFixed(1)}px`);
    el.style.filter = `blur(${((1 - o) * 7).toFixed(2)}px)`;
  });

  if (titleblock) {
    const t = window4(p, -0.10, -0.05, 0.07, 0.13);
    titleblock.style.opacity = t.toFixed(3);
    titleblock.style.transform = `translateX(-50%) translateY(${((1 - t) * 40).toFixed(1)}px) scale(${(0.97 + t * 0.03).toFixed(3)})`;
    titleblock.style.letterSpacing = `${((1 - t) * 0.12).toFixed(3)}em`;
  }

  if (scrubGlow) {
    scrubGlow.style.opacity = (clamp((p - 0.32) / 0.16) * 0.85).toFixed(3);
  }
}

/* ═════════════════ crow-feather particle field ═════════════════ */
const featherCanvas = document.getElementById('featherCanvas');
let fCtx = fitCanvas(featherCanvas);
const feathers = [];

function seedFeathers() {
  feathers.length = 0;
  const n = window.innerWidth < 820 ? 28 : 54;
  for (let i = 0; i < n; i++) {
    feathers.push({
      x: Math.random(), y: Math.random(),
      s: 0.35 + Math.random() * 1.15,
      vx: 0.18 + Math.random() * 0.5,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.02,
      sway: Math.random() * Math.PI * 2,
      a: 0.16 + Math.random() * 0.5,
    });
  }
}
seedFeathers();

function drawFeather(ctx, f, w, h, dir, intensity) {
  const x = f.x * w, y = f.y * h;
  const len = 22 * f.s * (w / 1280 + 0.55);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(f.rot + Math.sin(f.sway) * 0.35 + (dir < 0 ? Math.PI : 0));
  ctx.globalAlpha = f.a * intensity;
  ctx.fillStyle = '#0d0d10';
  ctx.strokeStyle = 'rgba(255,43,43,.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(-len * 0.15, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(-len * 0.15,  len * 0.42, -len, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ═════════════════ AMATERASU — black flame hem ═════════════════ */
const amaCanvas = document.getElementById('amaterasuCanvas');
let amaCtx = fitCanvas(amaCanvas);
const flames = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let amaPainted = false;

function seedFlames() {
  flames.length = 0;
  const n = Math.max(22, Math.round(window.innerWidth / 26));
  for (let i = 0; i < n; i++) {
    const depth = Math.random();
    flames.push({
      x: (i + Math.random() * 1.1) / n,
      depth,
      drift: (Math.random() - 0.5) * 0.05,
      h: (0.42 + Math.random() * 0.5) * (1.15 - depth * 0.35),
      w: (0.34 + Math.random() * 0.6) * (0.7 + depth * 0.7),
      speed: 0.7 + Math.random() * 1.25,
      lean: (Math.random() - 0.5) * 0.5,
      phase: Math.random() * Math.PI * 2,
      seed: Math.random() * 100,
    });
  }
  flames.sort((a, b) => a.depth - b.depth);
}
seedFlames();

function flameBlob(f, i, BLOBS, w, h, p, tall, wide) {
  const u = i / (BLOBS - 1);
  const baseX = (f.x + Math.sin(p * 0.4 + f.seed) * f.drift) * w;
  return {
    u,
    x: baseX + (f.lean * u + Math.sin(p * 1.7 + u * 3.4 + f.seed) * 0.6 * u) * wide,
    y: h - Math.pow(u, 0.82) * tall,
    r: wide * (1 - u * 0.78) + wide * 0.06,
  };
}

function drawFlame(ctx, f, w, h, t) {
  const p = f.phase + t * f.speed;
  const lick = 0.74 + Math.sin(p) * 0.18 + Math.sin(p * 2.9 + f.seed) * 0.08;
  const tall = h * f.h * lick;
  const wide = h * 0.24 * f.w;
  const near = 0.55 + f.depth * 0.45;
  const BLOBS = 9;

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < BLOBS; i++) {
    const b = flameBlob(f, i, BLOBS, w, h, p, tall, wide);
    const r = b.r * 1.28;
    const heat = Math.pow(1 - b.u, 1.6) * 0.9 + 0.06;
    const g = ctx.createRadialGradient(b.x, b.y, r * 0.45, b.x, b.y, r);
    g.addColorStop(0,    `rgba(214,32,44,${0.42 * heat * near})`);
    g.addColorStop(0.55, `rgba(126,12,30,${0.2 * heat * near})`);
    g.addColorStop(1,    'rgba(46,0,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < BLOBS; i++) {
    const b = flameBlob(f, i, BLOBS, w, h, p, tall, wide);
    const a = (0.97 - b.u * 0.42) * near;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0,   `rgba(3,2,4,${a})`);
    g.addColorStop(0.62, `rgba(6,3,8,${a * 0.8})`);
    g.addColorStop(1,   'rgba(9,5,11,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEmbers(ctx, w, h, t) {
  ctx.globalCompositeOperation = 'lighter';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const s = i * 12.9898;
    const life = (t * (0.22 + (i % 5) * 0.05) + i / n) % 1;
    const x = ((Math.sin(s) * 0.5 + 0.5) + Math.sin(t * 0.6 + s) * 0.02) * w;
    const y = h - life * h * 0.95;
    const a = Math.sin(life * Math.PI) * 0.5;
    const r = h * 0.018 * (1.4 - life * 0.6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,74,60,${a})`);
    g.addColorStop(1, 'rgba(120,10,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function paintAmaterasu(t) {
  if (!amaCanvas || !amaCtx) return;
  const w = amaCanvas.width, h = amaCanvas.height;
  amaCtx.clearRect(0, 0, w, h);
  for (const f of flames) drawFlame(amaCtx, f, w, h, t);
  drawEmbers(amaCtx, w, h, t);
}

/* ═══════════════ ACT II — mouse-tracked eyes ═══════════════ */
const eyesSection = document.getElementById('eyes');
const eyeCanvas   = document.getElementById('eyeCanvas');
const eyeFlare    = document.getElementById('eyeFlare');
const eyeReadout  = document.getElementById('eyeReadout');
let eyeCtx = fitCanvas(eyeCanvas);

const GAZE_LUT = [
  { f: 5,  cx: 613.4 },   // far left
  { f: 4,  cx: 622.5 },
  { f: 3,  cx: 631.3 },
  { f: 2,  cx: 645.2 },
  { f: 1,  cx: 652.4 },   // centre
  { f: 28, cx: 652.5 },
  { f: 29, cx: 663.4 },
  { f: 30, cx: 671.4 },
  { f: 31, cx: 672.7 },   // far right
].map(o => ({ idx: o.f - 1, cx: o.cx }));

let mx = 0.5, my = 0.5;
let ex = 0.5, ey = 0.5;
let gazePos = (GAZE_LUT.length - 1) / 2;
let eyeLastKey = '';

window.addEventListener('pointermove', e => {
  mx = e.clientX / window.innerWidth;
  my = e.clientY / window.innerHeight;
  cursorX = e.clientX; cursorY = e.clientY;
}, { passive: true });

window.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (!t) return;
  mx = t.clientX / window.innerWidth;
  my = t.clientY / window.innerHeight;
  cursorX = t.clientX; cursorY = t.clientY;
}, { passive: true });

/* ═══════════════ ACT III — ghost cursor + reveal + parallax ═══════════════ */
const jutsuSection = document.getElementById('jutsu');
const jutsuReveal  = document.getElementById('jutsuReveal');
const ghostCanvas  = document.getElementById('ghostCanvas');
const ghost = createGhostCursor(ghostCanvas, {
  color: '#ff2b2b',
  trailLength: 28,
  brightness: 0.45,
  edgeIntensity: 0.45,
});

let jutsuLit = false;
let revealX = 0.5, revealY = 0.5;
let revealTX = 0.5, revealTY = 0.5;
let revealR = 0, revealRT = 420;

function setLit(on) {
  if (!jutsuSection || jutsuLit === on) return;
  jutsuLit = on;
  jutsuSection.classList.toggle('lit', on);
  if (!on) ghost.leave();
}

if (jutsuSection) {
  jutsuSection.addEventListener('pointermove', e => {
    const r = jutsuSection.getBoundingClientRect();
    revealTX = clamp((e.clientX - r.left) / Math.max(1, r.width));
    revealTY = clamp((e.clientY - r.top) / Math.max(1, r.height));
    ghost.move(revealTX, revealTY, true);
    setLit(true);
  }, { passive: true });

  jutsuSection.addEventListener('pointerleave', () => setLit(false), { passive: true });

  document.querySelectorAll('.jutsu .card').forEach(card => {
    card.addEventListener('pointerenter', () => { revealRT = 580; }, { passive: true });
    card.addEventListener('pointerleave', () => { revealRT = 420; }, { passive: true });
  });
}

const pxItems = [...document.querySelectorAll('#jutsu [data-px]')]
  .map(el => ({ el, speed: parseFloat(el.dataset.px) || 0.2, delay: 0 }));

document.querySelectorAll('#jutsu .card').forEach((el, i) => {
  pxItems.push({ el, speed: 0.30 + i * 0.06, delay: i * 0.05 });
});
document.querySelectorAll('.jutsu__amaterasu').forEach(el => {
  pxItems.push({ el, speed: -0.22, delay: 0.1 });
});

pxItems.forEach(it => { it.el.style.opacity = '0'; });
ghost.resize();

function paintJutsu() {
  if (!jutsuSection) return;
  const r = jutsuSection.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top > vh || r.bottom < 0) return;

  const enter = clamp((vh - r.top) / (vh * 0.9));

  for (const it of pxItems) {
    const local = clamp((enter - it.delay) / (1 - it.delay || 1));
    const eased = 1 - Math.pow(1 - local, 3);
    const rect = it.el.getBoundingClientRect();
    const centred = (rect.top + rect.height / 2 - vh / 2) / vh;
    const drift = centred * it.speed * 120;
    it.el.style.opacity = eased.toFixed(3);
    it.el.style.transform = `translate3d(0, ${(drift + (1 - eased) * 60).toFixed(1)}px, 0)`;
  }
}

/* ═════════════════════ custom cursor ═════════════════════ */
const cursorEl = document.getElementById('cursor');
let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
let cx = cursorX, cy = cursorY;

document.querySelectorAll('a, button, .card, .eyes__sticky').forEach(el => {
  el.addEventListener('pointerenter', () => { if (cursorEl) cursorEl.classList.add('hot'); });
  el.addEventListener('pointerleave', () => { if (cursorEl) cursorEl.classList.remove('hot'); });
});

/* ═════════════════════ scroll chrome ═════════════════════ */
const hint = document.getElementById('hint');
const railScroll = document.getElementById('railScroll');
let lastScrollY = window.scrollY;
let scrollDir = 1, scrollVel = 0;

function readScroll() {
  const y = window.scrollY;
  const d = y - lastScrollY;
  if (Math.abs(d) > 0.4) scrollDir = d > 0 ? 1 : -1;
  scrollVel = lerp(scrollVel, Math.min(Math.abs(d) / 42, 1), 0.12);
  lastScrollY = y;

  const doc = document.documentElement.scrollHeight - window.innerHeight;
  const pct = Math.round((y / (doc || 1)) * 100);
  if (railScroll) railScroll.textContent = `SCROLL ${String(pct).padStart(3, '0')}%`;
  if (hint) hint.classList.toggle('hide', y > window.innerHeight * 0.4);
}

/* ═══════════════════════════════════════════════════════════
   STORM — lightning flashes + synthesised thunder
   ═══════════════════════════════════════════════════════════ */
const STRIKE_GAP   = 500;
const STRIKE_EVERY = [3200, 7000];

const stormFlash = document.getElementById('stormFlash');
const stormBolt  = document.getElementById('stormBolt');
const boltPath   = document.getElementById('boltPath');
const boltGlow   = document.getElementById('boltGlow');

let audioCtx = null, thunderOn = false;

function initAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function playThunder(power = 1) {
  if (!thunderOn) return;
  const ctx = initAudio();
  if (!ctx || ctx.state === 'suspended') return;

  const now = ctx.currentTime;
  const dur = 2.2 + Math.random() * 2.4 * power;

  const frames = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400 * power, now);
  lp.frequency.exponentialRampToValueAtTime(90, now + dur);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 28;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.55 * power, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.16 * power, now + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(58, now);
  sub.frequency.exponentialRampToValueAtTime(24, now + dur * 0.8);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.exponentialRampToValueAtTime(0.32 * power, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.85);

  src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
  sub.connect(subGain); subGain.connect(ctx.destination);

  src.start(now); src.stop(now + dur);
  sub.start(now); sub.stop(now + dur);
}

function makeBolt() {
  const x0 = 80 + Math.random() * 840;
  let x = x0, y = 0;
  let dPath = `M ${x.toFixed(0)} 0`;
  const steps = 14 + Math.floor(Math.random() * 8);
  const forks = [];
  const drift = (Math.random() - 0.5) * 40;

  for (let i = 1; i <= steps; i++) {
    y = (i / steps) * (620 + Math.random() * 300);
    x += drift + (Math.random() - 0.5) * 130;
    x = Math.max(20, Math.min(980, x));
    dPath += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
    if (Math.random() < 0.30 && i > 3) {
      let fx = x, fy = y, f = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
      const fs = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < fs; k++) {
        fx += (Math.random() - 0.5) * 150;
        fy += 40 + Math.random() * 80;
        f += ` L ${fx.toFixed(0)} ${fy.toFixed(0)}`;
      }
      forks.push(f);
    }
  }
  return { d: dPath + ' ' + forks.join(' '), x: x0 / 1000 };
}

let stormTimer = null;

function flicker(el, peak, ms) {
  if (!el) return;
  el.style.transition = 'none';
  el.style.opacity = String(peak);
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms cubic-bezier(.22,1,.36,1)`;
    el.style.opacity = '0';
  });
}

function strike() {
  const heavy = Math.random() < 0.55;
  const power = heavy ? 1 : 0.55 + Math.random() * 0.25;

  if (heavy && boltPath && boltGlow) {
    const b = makeBolt();
    boltPath.setAttribute('d', b.d);
    boltGlow.setAttribute('d', b.d);
    if (stormFlash) stormFlash.style.setProperty('--bx', (b.x * 100).toFixed(0) + '%');
    flicker(stormBolt, 1, 190);
  } else if (stormFlash) {
    stormFlash.style.setProperty('--bx', (15 + Math.random() * 70).toFixed(0) + '%');
  }

  if (stormFlash) flicker(stormFlash, heavy ? 0.9 : 0.42, heavy ? 380 : 300);

  const beats = heavy ? 1 + Math.floor(Math.random() * 2) : 1;
  for (let i = 1; i <= beats; i++) {
    setTimeout(() => {
      if (stormFlash) flicker(stormFlash, (heavy ? 0.7 : 0.3) * (1 - i * 0.2), 260);
      if (heavy && i === 1 && stormBolt) flicker(stormBolt, 0.75, 140);
    }, STRIKE_GAP * i);
  }

  setTimeout(() => playThunder(power), heavy ? 260 : 620);

  const [lo, hi] = STRIKE_EVERY;
  stormTimer = setTimeout(strike, lo + Math.random() * (hi - lo));
}

if (!reduceMotion) stormTimer = setTimeout(strike, 1800);

const soundToggle = document.getElementById('soundToggle');
const soundState  = document.getElementById('soundState');
if (soundToggle) {
  soundToggle.addEventListener('click', async () => {
    thunderOn = !thunderOn;
    soundToggle.setAttribute('aria-pressed', String(thunderOn));
    if (soundState) soundState.textContent = thunderOn ? 'ON' : 'OFF';
    if (thunderOn) {
      const ctx = initAudio();
      if (ctx && ctx.state === 'suspended') await ctx.resume();
      playThunder(0.7);
    }
  });
}

/* ═════════════════════ resize ═════════════════════ */
function resizeAll() {
  mainCtx = fitCanvas(mainCanvas);
  fCtx    = fitCanvas(featherCanvas);
  eyeCtx  = fitCanvas(eyeCanvas);
  amaCtx  = fitCanvas(amaCanvas);
  lastDrawn = -1; eyeLastKey = '';
  seedFeathers();
  seedFlames(); amaPainted = false;
  ghost.resize();
}
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resizeAll, 140); });

/* ═════════════════════ main loop ═════════════════════ */
function tick() {
  readScroll();
  readScrub();

  if (syncSize(mainCanvas) || syncSize(eyeCanvas) ||
      syncSize(featherCanvas) || syncSize(amaCanvas)) resizeAll();

  if (!reduceMotion) paintAmaterasu(performance.now() / 1000);
  else if (!amaPainted) { paintAmaterasu(0); amaPainted = true; }

  /* — Act I: scrubbed frames (71 frames) — */
  frameShown = lerp(frameShown, frameTarget, 0.14);
  const idx = Math.round(clamp(frameShown, 0, MAIN_COUNT - 1));
  if (idx !== lastDrawn && mainCanvas && mainCtx) {
    const w = mainCanvas.width, h = mainCanvas.height;
    mainCtx.clearRect(0, 0, w, h);
    if (drawCover(mainCtx, mainFrames[idx], w, h)) lastDrawn = idx;
  }
  paintOverlays(scrubProgress);

  /* — feathers: fly forward on scroll down, backward on scroll up — */
  if (featherCanvas && fCtx) {
    const fw = featherCanvas.width, fh = featherCanvas.height;
    const intensity = clamp((scrubProgress - 0.70) / 0.14) * (0.45 + scrollVel * 0.55);
    fCtx.clearRect(0, 0, fw, fh);
    if (intensity > 0.01) {
      const speed = (0.0009 + scrollVel * 0.006) * scrollDir;
      for (const f of feathers) {
        f.x += f.vx * speed;
        f.y += Math.sin(f.sway) * 0.0006 + f.vx * speed * 0.18;
        f.sway += 0.02 + f.vx * 0.01;
        f.rot  += f.spin * (0.3 + scrollVel);
        if (f.x > 1.15) f.x = -0.15;
        if (f.x < -0.15) f.x = 1.15;
        if (f.y > 1.15) f.y = -0.15;
        if (f.y < -0.15) f.y = 1.15;
        drawFeather(fCtx, f, fw, fh, scrollDir, intensity);
      }
    }
  }

  /* — Act II: gaze follows the pointer (51 frames) — */
  ex = lerp(ex, mx, 0.075);
  ey = lerp(ey, my, 0.075);

  if (eyesSection && eyeCanvas && eyeCtx) {
    const eyeRect = eyesSection.getBoundingClientRect();
    const eyeVisible = eyeRect.top < window.innerHeight && eyeRect.bottom > 0;

    if (eyeVisible) {
      gazePos = lerp(gazePos, ex * (GAZE_LUT.length - 1), 0.13);
      const g = clamp(gazePos, 0, GAZE_LUT.length - 1);
      const i0 = Math.floor(g), i1 = Math.min(i0 + 1, GAZE_LUT.length - 1);
      const t = g - i0;
      const key = `${i0}|${t.toFixed(2)}`;

      if (key !== eyeLastKey) {
        const w = eyeCanvas.width, h = eyeCanvas.height;
        eyeCtx.clearRect(0, 0, w, h);
        eyeCtx.globalAlpha = 1;
        const okA = drawCover(eyeCtx, eyeFrames[GAZE_LUT[i0].idx], w, h, 1.18);
        if (t > 0.01 && i1 !== i0) {
          eyeCtx.globalAlpha = t;
          drawCover(eyeCtx, eyeFrames[GAZE_LUT[i1].idx], w, h, 1.18);
          eyeCtx.globalAlpha = 1;
        }
        if (okA) eyeLastKey = key;
      }

      if (eyeFlare) {
        eyeFlare.style.setProperty('--mx', (ex * 100).toFixed(1) + '%');
        eyeFlare.style.setProperty('--my', (ey * 100).toFixed(1) + '%');
      }

      if (eyeReadout) {
        const axis = (ex - 0.5) * 200;
        const dir = axis < -8 ? '左' : axis > 8 ? '右' : '中';
        eyeReadout.textContent =
          `視線 ${dir} ${Math.abs(axis).toFixed(1).padStart(4, '0')} / FRAME ` +
          String(GAZE_LUT[Math.round(g)].idx + 1).padStart(2, '0');
      }
    }
  }

  /* — Act III: parallax, reveal mask, ghost cursor — */
  paintJutsu();

  if (jutsuSection) {
    const jr = jutsuSection.getBoundingClientRect();
    if (jr.top < window.innerHeight && jr.bottom > 0) {
      revealX = lerp(revealX, revealTX, 0.13);
      revealY = lerp(revealY, revealTY, 0.13);
      revealR = lerp(revealR, jutsuLit ? revealRT : 0, 0.09);
      const rs = jutsuSection.style;
      rs.setProperty('--rx', (revealX * 100).toFixed(2) + '%');
      rs.setProperty('--ry', (revealY * 100).toFixed(2) + '%');
      rs.setProperty('--r',  revealR.toFixed(0) + 'px');
      if (ghost.ok && (jutsuLit || revealR > 1)) ghost.render();
    }
  }

  /* — cursor — */
  if (cursorEl) {
    cx = lerp(cx, cursorX, 0.2);
    cy = lerp(cy, cursorY, 0.2);
    cursorEl.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ═════════════════════ reveals ═════════════════════ */
document.querySelectorAll(
  '.quote__jp, .quote blockquote, .quote__mark, .footer__big, .footer__row'
).forEach((el, i) => {
  el.setAttribute('data-reveal', '');
  if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i % 4);
});

const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.18 });
document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
