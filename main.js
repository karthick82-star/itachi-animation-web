/* ═══════════════════════════════════════════════════════════
   TOJI FUSHIGURO — 伏黒甚爾 | THE SORCERER KILLER
   CINEMATIC ANIME EXPERIENCE — INTERACTIVE ENGINE
   ═══════════════════════════════════════════════════════════ */

// Utility functions
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const window4 = (p, a, b, c, d) =>
  p < a || p > d ? 0 : p < b ? (p - a) / (b - a) : p > c ? 1 - (p - c) / (d - c) : 1;

/* ───────────────────────── PRELOADER ───────────────────────── */
const ASSETS_TO_LOAD = [
  { id: 'tojiGun', src: 'assets/toji-gun.jpg' },
  { id: 'tojiCurse', src: 'assets/toji-curse.jpg' },
  { id: 'spear', src: 'assets/weapon-spear.jpg' },
  { id: 'katana', src: 'assets/weapon-katana.jpg' },
  { id: 'playful', src: 'assets/weapon-playful-cloud.jpg' },
  { id: 'chain', src: 'assets/weapon-chain.jpg' },
  { id: 'restriction', src: 'assets/ability-restriction.jpg' },
  { id: 'strength', src: 'assets/ability-strength.jpg' }
];

const loadedImages = {};
let loadedCount = 0;
const totalAssets = ASSETS_TO_LOAD.length;

const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct = document.getElementById('loaderPct');

function loadImage(item) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => {
      loadedImages[item.id] = img;
      loadedCount++;
      const pct = loadedCount / totalAssets;
      if (loaderFill) loaderFill.style.width = (pct * 100).toFixed(1) + '%';
      if (loaderPct) loaderPct.textContent = String(Math.round(pct * 100)).padStart(2, '0');
      resolve();
    };
    img.src = item.src;
  });
}

const preloadJobs = ASSETS_TO_LOAD.map(loadImage);

Promise.all(preloadJobs).then(() => {
  setTimeout(() => {
    if (loaderEl) loaderEl.classList.add('done');
    document.body.classList.add('ready');
    resizeAll();
    setTimeout(() => {
      if (loaderEl) loaderEl.style.display = 'none';
    }, 900);
  }, 450);
});

/* ─────────────────── CANVAS SIZING HELPERS ─────────────────── */
function fitCanvas(canvas) {
  if (!canvas) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.offsetWidth * dpr);
  const h = Math.round(canvas.offsetHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
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

/* Draws image covering canvas area with zoom & offset control */
function drawCoverWithZoom(ctx, img, cw, ch, zoom = 1.0, offsetX = 0, offsetY = 0, alpha = 1.0) {
  if (!img || !img.naturalWidth) return false;
  ctx.save();
  ctx.globalAlpha = alpha;

  const ir = img.naturalWidth / img.naturalHeight;
  const cr = cw / ch;
  let w, h;

  if (cr > ir) {
    w = cw * zoom;
    h = (cw / ir) * zoom;
  } else {
    h = ch * zoom;
    w = (ch * ir) * zoom;
  }

  const x = (cw - w) / 2 + offsetX;
  const y = (ch - h) / 2 + offsetY;

  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  return true;
}

/* ═══════════════════════════════════════════════════════════
   GHOST CURSOR — WEBGL PURPLE CURSED SMOKE SHADER
   ═══════════════════════════════════════════════════════════ */
function createGhostCursor(canvas, opts = {}) {
  if (!canvas) return { resize() {}, move() {}, render() {}, leave() {}, ok: false };
  const TRAIL = opts.trailLength ?? 28;
  const INERTIA = opts.inertia ?? 0.5;
  const MAX_DPR = opts.maxDevicePixelRatio ?? 0.55;
  const BUDGET = opts.targetPixels ?? 4.5e5;
  const BRIGHT = opts.brightness ?? 1.5;
  const EDGE = opts.edgeIntensity ?? 0.38;
  const FADE_DELAY = opts.fadeDelayMs ?? 900;
  const FADE_DUR = opts.fadeDurationMs ?? 1400;
  const rgb = hexToRgb(opts.color ?? '#7200FF');

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance'
  });
  if (!gl) return { resize() {}, move() {}, render() {}, leave() {}, ok: false };

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
    vec3 tint1(vec3 base){ return mix(base, vec3(0.7, 0.3, 1.0), 0.4); }
    vec3 tint2(vec3 base){ return mix(base, vec3(0.9, 0.6, 1.0), 0.3); }

    vec4 blob(vec2 p, vec2 mousePos, float intensity, float activity) {
      vec2 q = vec2(fbm(p * iScale + iTime * 0.1), fbm(p * iScale + vec2(5.2,1.3) + iTime * 0.1));
      vec2 r = vec2(fbm(p * iScale + q * 1.5 + iTime * 0.15), fbm(p * iScale + q * 1.5 + vec2(8.3,2.8) + iTime * 0.15));

      float smoke = fbm(p * iScale + r * 0.8);
      float radius = 0.55 + 0.32 * (1.0 / iScale);
      float distFactor = 1.0 - smoothstep(0.0, radius * activity, length(p - mousePos));
      float alpha = pow(smoke, 2.4) * distFactor;

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
  if (!vs || !fs) return { resize() {}, move() {}, render() {}, leave() {}, ok: false };

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { resize() {}, move() {}, render() {}, leave() {}, ok: false };
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const uTime = U('iTime'),
    uRes = U('iResolution'),
    uMouse = U('iMouse'),
    uPrev = U('iPrevMouse[0]'),
    uOpacity = U('iOpacity'),
    uScale = U('iScale'),
    uColor = U('iBaseColor'),
    uBright = U('iBrightness'),
    uEdge = U('iEdgeIntensity');

  gl.uniform3f(uColor, rgb[0], rgb[1], rgb[2]);
  gl.uniform1f(uBright, BRIGHT);
  gl.uniform1f(uEdge, EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const trail = new Float32Array(TRAIL * 2).fill(0.5);
  const flat = new Float32Array(TRAIL * 2).fill(0.5);
  let head = 0;

  const target = { x: 0.5, y: 0.5 };
  const cur = { x: 0.5, y: 0.5 };
  const vel = { x: 0, y: 0 };
  let pointerActive = false;
  let lastMove = performance.now();
  let fade = 0;
  const t0 = performance.now();

  function resize() {
    const cssW = canvas.offsetWidth,
      cssH = canvas.offsetHeight;
    if (cssW <= 0 || cssH <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const need = cssW * cssH * dpr * dpr;
    const s = need <= BUDGET ? 1 : Math.max(0.4, Math.min(1, Math.sqrt(BUDGET / Math.max(1, need))));
    const pr = dpr * s;
    const w = Math.max(1, Math.floor(cssW * pr));
    const h = Math.max(1, Math.floor(cssH * pr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform3f(uRes, w, h, 1);
    const base = Math.min(Math.max(1, cssW), Math.max(1, cssH));
    gl.uniform1f(uScale, Math.max(0.5, Math.min(2.0, base / 600)));
  }

  function move(x, y, active = true) {
    target.x = clamp(x);
    target.y = clamp(1 - y);
    pointerActive = active;
    if (active) {
      lastMove = performance.now();
      fade = 1;
    }
  }
  function leave() {
    pointerActive = false;
    lastMove = performance.now();
  }

  function render() {
    const now = performance.now();

    if (pointerActive) {
      vel.x = target.x - cur.x;
      vel.y = target.y - cur.y;
      cur.x = target.x;
      cur.y = target.y;
      fade = 1;
    } else {
      vel.x *= INERTIA;
      vel.y *= INERTIA;
      if (vel.x * vel.x + vel.y * vel.y > 1e-6) {
        cur.x += vel.x;
        cur.y += vel.y;
      }
      const dt = now - lastMove;
      if (dt > FADE_DELAY) fade = Math.max(0, 1 - Math.min(1, (dt - FADE_DELAY) / FADE_DUR));
    }
    if (fade <= 0.001 && !pointerActive) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return false;
    }

    head = (head + 1) % TRAIL;
    trail[head * 2] = cur.x;
    trail[head * 2 + 1] = cur.y;
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

/* ═══════════════════════════════════════════════════════════
   ACT I — CINEMATIC SCROLL SCRUB (TOJI CHARACTER ENGINE)
   ═══════════════════════════════════════════════════════════ */
const scrubSection = document.getElementById('scrub');
const mainCanvas = document.getElementById('mainCanvas');
const scrubGlow = document.getElementById('scrubGlow');
const titleblock = document.getElementById('titleblock');
const phases = [...document.querySelectorAll('.phase')];
let mainCtx = fitCanvas(mainCanvas);

let scrubProgress = 0;
let easedScrub = 0;

function readScrub() {
  if (!scrubSection) return;
  const rect = scrubSection.getBoundingClientRect();
  const dist = scrubSection.offsetHeight - window.innerHeight;
  scrubProgress = clamp(-rect.top / (dist || 1));
}

const PHASE_WINDOWS = [
  [0.10, 0.16, 0.22, 0.28], // Phase 0: 天与呪縛
  [0.30, 0.36, 0.44, 0.50], // Phase 1: 五感研磨
  [0.53, 0.59, 0.69, 0.75], // Phase 2: 格納呪霊
  [0.78, 0.84, 0.95, 1.01]  // Phase 3: 術師殺し
];

function paintOverlays(p) {
  phases.forEach((el, i) => {
    const o = window4(p, ...PHASE_WINDOWS[i]);
    el.style.opacity = o.toFixed(3);
    el.style.setProperty('--y', `${((1 - o) * 34).toFixed(1)}px`);
    el.style.filter = `blur(${((1 - o) * 8).toFixed(2)}px)`;
  });

  if (titleblock) {
    const t = window4(p, -0.10, -0.05, 0.08, 0.14);
    titleblock.style.opacity = t.toFixed(3);
    titleblock.style.transform = `translateX(-50%) translateY(${((1 - t) * 40).toFixed(1)}px) scale(${(0.96 + t * 0.04).toFixed(3)})`;
    titleblock.style.letterSpacing = `${((1 - t) * 0.1).toFixed(3)}em`;
  }

  if (scrubGlow) {
    // Purple cursed aura increases with scroll
    const glowIntensity = clamp((p - 0.25) / 0.3) * 0.9;
    scrubGlow.style.opacity = glowIntensity.toFixed(3);
  }
}

/* ═══════════════════════════════════════════════════════════
   FLOATING PURPLE CURSED PARTICLES & EMBERS
   ═══════════════════════════════════════════════════════════ */
const particleCanvas = document.getElementById('particleCanvas');
let pCtx = fitCanvas(particleCanvas);
const particles = [];

function seedParticles() {
  particles.length = 0;
  const count = window.innerWidth < 820 ? 32 : 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      r: 1.2 + Math.random() * 2.8,
      vx: (Math.random() - 0.5) * 0.25,
      vy: 0.2 + Math.random() * 0.65,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.015 + Math.random() * 0.025,
      color: Math.random() > 0.4 ? 'rgba(180, 74, 255, ' : 'rgba(114, 0, 255, ',
      alpha: 0.2 + Math.random() * 0.6
    });
  }
}
seedParticles();

function drawParticle(ctx, pt, w, h, intensity) {
  const x = pt.x * w;
  const y = pt.y * h;
  const rad = pt.r * (w / 1280 + 0.6);

  ctx.save();
  ctx.globalAlpha = pt.alpha * intensity;
  ctx.fillStyle = pt.color + '0.9)';
  ctx.shadowColor = '#B44AFF';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════
   CURSED HEM — VIOLET ENERGY FIRE & EMBERS
   ═══════════════════════════════════════════════════════════ */
const hemCanvas = document.getElementById('cursedHemCanvas');
let hemCtx = fitCanvas(hemCanvas);
const flames = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let hemPainted = false;

function seedFlames() {
  flames.length = 0;
  const n = Math.max(24, Math.round(window.innerWidth / 26));
  for (let i = 0; i < n; i++) {
    const depth = Math.random();
    flames.push({
      x: (i + Math.random() * 1.1) / n,
      depth,
      drift: (Math.random() - 0.5) * 0.06,
      h: (0.42 + Math.random() * 0.5) * (1.15 - depth * 0.35),
      w: (0.34 + Math.random() * 0.6) * (0.7 + depth * 0.7),
      speed: 0.75 + Math.random() * 1.25,
      lean: (Math.random() - 0.5) * 0.45,
      phase: Math.random() * Math.PI * 2,
      seed: Math.random() * 100
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
    r: wide * (1 - u * 0.78) + wide * 0.06
  };
}

function drawFlame(ctx, f, w, h, t) {
  const p = f.phase + t * f.speed;
  const lick = 0.74 + Math.sin(p) * 0.18 + Math.sin(p * 2.9 + f.seed) * 0.08;
  const tall = h * f.h * lick;
  const wide = h * 0.24 * f.w;
  const near = 0.55 + f.depth * 0.45;
  const BLOBS = 9;

  // Pass 1: Neon violet halo
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < BLOBS; i++) {
    const b = flameBlob(f, i, BLOBS, w, h, p, tall, wide);
    const r = b.r * 1.3;
    const heat = Math.pow(1 - b.u, 1.5) * 0.9 + 0.06;
    const g = ctx.createRadialGradient(b.x, b.y, r * 0.45, b.x, b.y, r);
    g.addColorStop(0, `rgba(180, 74, 255, ${0.45 * heat * near})`);
    g.addColorStop(0.55, `rgba(114, 0, 255, ${0.22 * heat * near})`);
    g.addColorStop(1, 'rgba(24, 7, 45, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pass 2: Dark void core punched inside halo
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < BLOBS; i++) {
    const b = flameBlob(f, i, BLOBS, w, h, p, tall, wide);
    const a = (0.96 - b.u * 0.4) * near;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(8, 5, 16, ${a})`);
    g.addColorStop(0.65, `rgba(24, 7, 45, ${a * 0.85})`);
    g.addColorStop(1, 'rgba(114, 0, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEmbers(ctx, w, h, t) {
  ctx.globalCompositeOperation = 'lighter';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const s = i * 14.85;
    const life = (t * (0.24 + (i % 5) * 0.05) + i / n) % 1;
    const x = ((Math.sin(s) * 0.5 + 0.5) + Math.sin(t * 0.6 + s) * 0.02) * w;
    const y = h - life * h * 0.95;
    const a = Math.sin(life * Math.PI) * 0.55;
    const r = h * 0.016 * (1.4 - life * 0.6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(220, 180, 255, ${a})`);
    g.addColorStop(0.6, `rgba(180, 74, 255, ${a * 0.6})`);
    g.addColorStop(1, 'rgba(114, 0, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function paintCursedHem(t) {
  if (!hemCanvas || !hemCtx) return;
  const w = hemCanvas.width,
    h = hemCanvas.height;
  hemCtx.clearRect(0, 0, w, h);
  for (const f of flames) drawFlame(hemCtx, f, w, h, t);
  drawEmbers(hemCtx, w, h, t);
}

/* ═══════════════════════════════════════════════════════════
   ACT II — COMBAT TARGETING & 3D PARALLAX GAZE CANVAS
   ═══════════════════════════════════════════════════════════ */
const eyesSection = document.getElementById('target');
const eyeCanvas = document.getElementById('eyeCanvas');
const eyeFlare = document.getElementById('eyeFlare');
const eyeReadout = document.getElementById('eyeReadout');
const eyesReticle = document.getElementById('eyesReticle');
let eyeCtx = fitCanvas(eyeCanvas);

let mx = 0.5, my = 0.5;
let ex = 0.5, ey = 0.5;

window.addEventListener(
  'pointermove',
  (e) => {
    mx = e.clientX / window.innerWidth;
    my = e.clientY / window.innerHeight;
    cursorX = e.clientX;
    cursorY = e.clientY;
  },
  { passive: true }
);

window.addEventListener(
  'touchmove',
  (e) => {
    const t = e.touches[0];
    if (!t) return;
    mx = t.clientX / window.innerWidth;
    my = t.clientY / window.innerHeight;
    cursorX = t.clientX;
    cursorY = t.clientY;
  },
  { passive: true }
);

/* ═══════════════════════════════════════════════════════════
   ACT III — JUTSU / WEAPONS SECTION INTERACTIVITY
   ═══════════════════════════════════════════════════════════ */
const jutsuSection = document.getElementById('weapons');
const jutsuReveal = document.getElementById('jutsuReveal');
const ghostCanvas = document.getElementById('ghostCanvas');
const ghost = createGhostCursor(ghostCanvas, {
  color: '#7200FF',
  trailLength: 28,
  brightness: 0.52,
  edgeIntensity: 0.45
});

let jutsuLit = false;
let revealX = 0.5, revealY = 0.5;
let revealTX = 0.5, revealTY = 0.5;
let revealR = 0, revealRT = 450;

function setLit(on) {
  if (!jutsuSection || jutsuLit === on) return;
  jutsuLit = on;
  jutsuSection.classList.toggle('lit', on);
  if (!on) ghost.leave();
}

if (jutsuSection) {
  jutsuSection.addEventListener(
    'pointermove',
    (e) => {
      const r = jutsuSection.getBoundingClientRect();
      revealTX = clamp((e.clientX - r.left) / Math.max(1, r.width));
      revealTY = clamp((e.clientY - r.top) / Math.max(1, r.height));
      ghost.move(revealTX, revealTY, true);
      setLit(true);
    },
    { passive: true }
  );

  jutsuSection.addEventListener('pointerleave', () => setLit(false), { passive: true });

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointerenter', () => { revealRT = 620; }, { passive: true });
    card.addEventListener('pointerleave', () => { revealRT = 450; }, { passive: true });
  });
}

const pxItems = [...document.querySelectorAll('#weapons [data-px]')].map((el) => ({
  el,
  speed: parseFloat(el.dataset.px) || 0.2,
  delay: 0
}));

document.querySelectorAll('#weapons .card').forEach((el, i) => {
  pxItems.push({ el, speed: 0.28 + i * 0.05, delay: i * 0.04 });
});

pxItems.forEach((it) => {
  it.el.style.opacity = '0';
});
ghost.resize();

function paintJutsu() {
  if (!jutsuSection) return;
  const r = jutsuSection.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top > vh || r.bottom < 0) return;

  const enter = clamp((vh - r.top) / (vh * 0.85));

  for (const it of pxItems) {
    const local = clamp((enter - it.delay) / (1 - it.delay || 1));
    const eased = 1 - Math.pow(1 - local, 3);
    const rect = it.el.getBoundingClientRect();
    const centred = (rect.top + rect.height / 2 - vh / 2) / vh;
    const drift = centred * it.speed * 110;
    it.el.style.opacity = eased.toFixed(3);
    it.el.style.transform = `translate3d(0, ${(drift + (1 - eased) * 55).toFixed(1)}px, 0)`;
  }
}

/* ═══════════════════════════════════════════════════════════
   CUSTOM PURPLE CURSOR
   ═══════════════════════════════════════════════════════════ */
const cursorEl = document.getElementById('cursor');
let cursorX = window.innerWidth / 2,
  cursorY = window.innerHeight / 2;
let cx = cursorX,
  cy = cursorY;

document.querySelectorAll('a, button, .card, .character-card-visual, .sticky-badge').forEach((el) => {
  el.addEventListener('pointerenter', () => {
    if (cursorEl) cursorEl.classList.add('hot');
  });
  el.addEventListener('pointerleave', () => {
    if (cursorEl) cursorEl.classList.remove('hot');
  });
});

/* ═══════════════════════════════════════════════════════════
   SCROLL CHROME & ACTIVE NAVIGATION
   ═══════════════════════════════════════════════════════════ */
const hint = document.getElementById('hint');
const railScroll = document.getElementById('railScroll');
const railBar = document.getElementById('railBar');
const navLinks = [...document.querySelectorAll('.chrome__nav a')];
let lastScrollY = window.scrollY;
let scrollDir = 1,
  scrollVel = 0;

function readScroll() {
  const y = window.scrollY;
  const d = y - lastScrollY;
  if (Math.abs(d) > 0.4) scrollDir = d > 0 ? 1 : -1;
  scrollVel = lerp(scrollVel, Math.min(Math.abs(d) / 40, 1), 0.12);
  lastScrollY = y;

  const doc = document.documentElement.scrollHeight - window.innerHeight;
  const pct = Math.round((y / (doc || 1)) * 100);
  if (railScroll) railScroll.textContent = `SCROLL ${String(pct).padStart(3, '0')}%`;
  if (railBar) railBar.style.height = `${pct}%`;
  if (hint) hint.classList.toggle('hide', y > window.innerHeight * 0.35);

  // Active section indicator
  const sections = ['scrub', 'target', 'character', 'abilities', 'weapons', 'about'];
  for (let i = sections.length - 1; i >= 0; i--) {
    const sec = document.getElementById(sections[i]);
    if (sec) {
      const top = sec.getBoundingClientRect().top;
      if (top <= window.innerHeight * 0.4) {
        navLinks.forEach((a) => {
          const href = a.getAttribute('href').replace('#', '');
          const match = href === sections[i] || (sections[i] === 'target' && href === 'target');
          a.classList.toggle('active', match);
        });
        break;
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   PURPLE LIGHTNING STORM & SYNTHESIZED THUNDER AUDIO
   ═══════════════════════════════════════════════════════════ */
const STRIKE_GAP = 480;
const STRIKE_EVERY = [3500, 7500];

const stormFlash = document.getElementById('stormFlash');
const stormBolt = document.getElementById('stormBolt');
const boltPath = document.getElementById('boltPath');
const boltGlow = document.getElementById('boltGlow');

let audioCtx = null,
  thunderOn = false;

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
  const dur = 2.4 + Math.random() * 2.2 * power;

  const frames = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.4;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200 * power, now);
  lp.frequency.exponentialRampToValueAtTime(75, now + dur);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 26;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.55 * power, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.18 * power, now + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(54, now);
  sub.frequency.exponentialRampToValueAtTime(22, now + dur * 0.85);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.exponentialRampToValueAtTime(0.34 * power, now + 0.12);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.85);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);

  sub.connect(subGain);
  subGain.connect(ctx.destination);

  src.start(now);
  src.stop(now + dur);
  sub.start(now);
  sub.stop(now + dur);
}

function makeBolt() {
  const x0 = 80 + Math.random() * 840;
  let x = x0,
    y = 0;
  let dPath = `M ${x.toFixed(0)} 0`;
  const steps = 14 + Math.floor(Math.random() * 8);
  const forks = [];
  const drift = (Math.random() - 0.5) * 45;

  for (let i = 1; i <= steps; i++) {
    y = (i / steps) * (620 + Math.random() * 320);
    x += drift + (Math.random() - 0.5) * 135;
    x = Math.max(20, Math.min(980, x));
    dPath += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
    if (Math.random() < 0.32 && i > 3) {
      let fx = x,
        fy = y,
        f = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
      const fs = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < fs; k++) {
        fx += (Math.random() - 0.5) * 160;
        fy += 40 + Math.random() * 85;
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
  const heavy = Math.random() < 0.6;
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

  if (stormFlash) flicker(stormFlash, heavy ? 0.92 : 0.45, heavy ? 380 : 300);

  const beats = heavy ? 1 + Math.floor(Math.random() * 2) : 1;
  for (let i = 1; i <= beats; i++) {
    setTimeout(() => {
      if (stormFlash) flicker(stormFlash, (heavy ? 0.75 : 0.35) * (1 - i * 0.2), 260);
      if (heavy && i === 1 && stormBolt) flicker(stormBolt, 0.8, 140);
    }, STRIKE_GAP * i);
  }

  setTimeout(() => playThunder(power), heavy ? 250 : 600);

  const [lo, hi] = STRIKE_EVERY;
  stormTimer = setTimeout(strike, lo + Math.random() * (hi - lo));
}

if (!reduceMotion) stormTimer = setTimeout(strike, 1900);

const soundToggle = document.getElementById('soundToggle');
const soundState = document.getElementById('soundState');
if (soundToggle) {
  soundToggle.addEventListener('click', async () => {
    thunderOn = !thunderOn;
    soundToggle.setAttribute('aria-pressed', String(thunderOn));
    if (soundState) soundState.textContent = thunderOn ? 'ON' : 'OFF';
    if (thunderOn) {
      const ctx = initAudio();
      if (ctx && ctx.state === 'suspended') await ctx.resume();
      playThunder(0.75);
    }
  });
}

// Mobile burger toggle
const burgerToggle = document.getElementById('burgerToggle');
const chromeNav = document.getElementById('chromeNav');
if (burgerToggle && chromeNav) {
  burgerToggle.addEventListener('click', () => {
    const open = chromeNav.classList.toggle('open');
    burgerToggle.classList.toggle('open', open);
    burgerToggle.setAttribute('aria-expanded', String(open));
  });

  chromeNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      chromeNav.classList.remove('open');
      burgerToggle.classList.remove('open');
      burgerToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   WINDOW RESIZE HANDLER
   ═══════════════════════════════════════════════════════════ */
function resizeAll() {
  mainCtx = fitCanvas(mainCanvas);
  pCtx = fitCanvas(particleCanvas);
  eyeCtx = fitCanvas(eyeCanvas);
  hemCtx = fitCanvas(hemCanvas);
  seedParticles();
  seedFlames();
  hemPainted = false;
  ghost.resize();
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeAll, 120);
});

/* ═══════════════════════════════════════════════════════════
   MAIN 60FPS RAF ANIMATION LOOP
   ═══════════════════════════════════════════════════════════ */
function tick() {
  readScroll();
  readScrub();

  if (
    syncSize(mainCanvas) ||
    syncSize(eyeCanvas) ||
    syncSize(particleCanvas) ||
    syncSize(hemCanvas)
  ) {
    resizeAll();
  }

  const nowSec = performance.now() / 1000;

  // 1. Violet Cursed Energy Hem
  if (!reduceMotion) {
    paintCursedHem(nowSec);
  } else if (!hemPainted) {
    paintCursedHem(0);
    hemPainted = true;
  }

  // 2. Act I — Cinematic Toji Scroll Presentation
  easedScrub = lerp(easedScrub, scrubProgress, 0.1);
  if (mainCanvas && mainCtx) {
    const mw = mainCanvas.width,
      mh = mainCanvas.height;
    mainCtx.clearRect(0, 0, mw, mh);

    // Deep dark background
    mainCtx.fillStyle = '#080510';
    mainCtx.fillRect(0, 0, mw, mh);

    // Subtle ambient purple radial glow behind Toji
    const radGlow = mainCtx.createRadialGradient(
      mw * 0.55,
      mh * 0.5,
      mw * 0.1,
      mw * 0.55,
      mh * 0.5,
      mw * 0.7
    );
    radGlow.addColorStop(0, 'rgba(114, 0, 255, 0.35)');
    radGlow.addColorStop(0.5, 'rgba(24, 7, 45, 0.25)');
    radGlow.addColorStop(1, 'rgba(8, 5, 16, 0)');
    mainCtx.fillStyle = radGlow;
    mainCtx.fillRect(0, 0, mw, mh);

    // Image choreography:
    // 0.00 - 0.48: Tactical Mercenary Toji with gun (tojiGun)
    // 0.48 - 0.55: Cursed Energy Transition & Awakening
    // 0.55 - 1.00: Unleashed Sorcerer Killer with Inventory Curse (tojiCurse)
    const zoom1 = 1.0 + easedScrub * 0.16;
    const offsetY1 = -easedScrub * mh * 0.06;
    const zoom2 = 1.05 + (easedScrub - 0.48) * 0.18;
    const offsetY2 = -(easedScrub - 0.48) * mh * 0.05;

    // Mouse parallax subtle tilt
    const mouseOffsetX = (ex - 0.5) * 25;
    const mouseOffsetY = (ey - 0.5) * 20;

    if (easedScrub <= 0.48) {
      drawCoverWithZoom(mainCtx, loadedImages.tojiGun, mw, mh, zoom1, mouseOffsetX, offsetY1 + mouseOffsetY, 1.0);
    } else if (easedScrub < 0.56) {
      // Crossfade transition with chromatic distortion
      const crossT = (easedScrub - 0.48) / 0.08;
      drawCoverWithZoom(mainCtx, loadedImages.tojiGun, mw, mh, zoom1, mouseOffsetX, offsetY1 + mouseOffsetY, 1.0 - crossT);
      drawCoverWithZoom(mainCtx, loadedImages.tojiCurse, mw, mh, zoom2, mouseOffsetX, offsetY2 + mouseOffsetY, crossT);

      // Flash line during transition
      mainCtx.save();
      mainCtx.fillStyle = `rgba(180, 74, 255, ${(Math.sin(crossT * Math.PI) * 0.3).toFixed(2)})`;
      mainCtx.fillRect(0, 0, mw, mh);
      mainCtx.restore();
    } else {
      drawCoverWithZoom(mainCtx, loadedImages.tojiCurse, mw, mh, zoom2, mouseOffsetX, offsetY2 + mouseOffsetY, 1.0);
    }
  }

  paintOverlays(scrubProgress);

  // 3. Floating Purple Cursed Particles
  if (particleCanvas && pCtx) {
    const pw = particleCanvas.width,
      ph = particleCanvas.height;
    pCtx.clearRect(0, 0, pw, ph);

    const particleIntensity = clamp((scrubProgress - 0.05) / 0.2) * (0.6 + scrollVel * 0.4);
    if (particleIntensity > 0.02) {
      const speed = (0.0012 + scrollVel * 0.008) * scrollDir;
      for (const pt of particles) {
        pt.y -= pt.vy * speed + 0.0004;
        pt.x += Math.sin(pt.sway) * 0.0008 + pt.vx * 0.001;
        pt.sway += pt.swaySpeed;

        if (pt.y < -0.1) pt.y = 1.1;
        if (pt.y > 1.1) pt.y = -0.1;
        if (pt.x < -0.1) pt.x = 1.1;
        if (pt.x > 1.1) pt.x = -0.1;

        drawParticle(pCtx, pt, pw, ph, particleIntensity);
      }
    }
  }

  // 4. Act II — 3D Parallax Combat Gaze & Targeting Tracking
  ex = lerp(ex, mx, 0.085);
  ey = lerp(ey, my, 0.085);

  if (eyesSection && eyeCanvas && eyeCtx) {
    const er = eyesSection.getBoundingClientRect();
    const isEyeVisible = er.top < window.innerHeight && er.bottom > 0;

    if (isEyeVisible) {
      const ew = eyeCanvas.width,
        eh = eyeCanvas.height;
      eyeCtx.clearRect(0, 0, ew, eh);

      // Calculate 3D perspective offsets
      const pOffsetX = (ex - 0.5) * 45;
      const pOffsetY = (ey - 0.5) * 35;

      // Draw Toji close-up with dynamic perspective
      drawCoverWithZoom(eyeCtx, loadedImages.tojiCurse, ew, eh, 1.12, pOffsetX, pOffsetY, 1.0);

      // Dynamic specular rim lighting following cursor
      const rimGrad = eyeCtx.createRadialGradient(
        ew * ex,
        eh * ey,
        40,
        ew * ex,
        eh * ey,
        ew * 0.55
      );
      rimGrad.addColorStop(0, 'rgba(180, 74, 255, 0.22)');
      rimGrad.addColorStop(0.6, 'rgba(114, 0, 255, 0.06)');
      rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      eyeCtx.fillStyle = rimGrad;
      eyeCtx.fillRect(0, 0, ew, eh);

      // Lens flare position
      if (eyeFlare) {
        eyeFlare.style.setProperty('--mx', (ex * 100).toFixed(1) + '%');
        eyeFlare.style.setProperty('--my', (ey * 100).toFixed(1) + '%');
      }

      // Targeting reticle position
      if (eyesReticle) {
        eyesReticle.style.left = `${(ex * 100).toFixed(1)}%`;
        eyesReticle.style.top = `${(ey * 100).toFixed(1)}%`;
      }

      // HUD readout text
      if (eyeReadout) {
        const axisX = (ex - 0.5) * 200;
        const dir = axisX < -10 ? '左' : axisX > 10 ? '右' : '中立';
        eyeReadout.textContent = `照準 ${dir} ${Math.abs(axisX).toFixed(1).padStart(4, '0')} / CURSED ENERGY: 0.00% [NULL]`;
      }
    }
  }

  // 5. Act III — Ghost Cursor & Reveal Mask
  paintJutsu();
  if (jutsuSection) {
    const jr = jutsuSection.getBoundingClientRect();
    if (jr.top < window.innerHeight && jr.bottom > 0) {
      revealX = lerp(revealX, revealTX, 0.12);
      revealY = lerp(revealY, revealTY, 0.12);
      revealR = lerp(revealR, jutsuLit ? revealRT : 0, 0.09);

      const js = jutsuSection.style;
      js.setProperty('--rx', (revealX * 100).toFixed(2) + '%');
      js.setProperty('--ry', (revealY * 100).toFixed(2) + '%');
      js.setProperty('--r', `${revealR.toFixed(0)}px`);

      if (ghost.ok && (jutsuLit || revealR > 1)) {
        ghost.render();
      }
    }
  }

  // 6. Custom Cursor Smooth Tracking
  cx = lerp(cx, cursorX, 0.22);
  cy = lerp(cy, cursorY, 0.22);
  if (cursorEl) {
    cursorEl.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ═══════════════════════════════════════════════════════════
   SCROLL REVEALS (INTERSECTION OBSERVER)
   ═══════════════════════════════════════════════════════════ */
document
  .querySelectorAll(
    '.character-grid > div, .section-header, .quote__jp, .quote blockquote, .quote__mark, .footer__big, .footer__kanji, .footer__row'
  )
  .forEach((el, i) => {
    el.setAttribute('data-reveal', '');
    if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i % 4);
  });

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealObserver.unobserve(e.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));
