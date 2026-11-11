// Мегаструктура Oxygen. Искра встаёт в логотип на бетонной стене, из него по скроллу течёт неоновая лента:
// вниз по стене, вокруг шоурила, на пол, вдоль стены — за её край, и дальше через огромное пространство.
// Движок: весь бетон — один InstancedMesh с собственным шейдером (трипланарная текстура, свет считается аналитически:
// световые шахты + 8 точечных источников в uniform-массивах). Никаких three.js-источников для бетона, теней и тумана:
// один-два десятка draw call на кадр, шейдеры не перекомпилируются.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RED = 0xf40709, CREAM = 0xe1d9cf;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = t => t * t * (3 - 2 * t);
function mulberry(a) { return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(2026);

// ---------- загрузка: прелоадер ждёт всё ----------
const LOAD = { loaded: 0, total: 0 };
THREE.DefaultLoadingManager.onProgress = (u, l, t) => { LOAD.loaded = l; LOAD.total = t; document.getElementById('loadPct').textContent = String(Math.round(100 * l / Math.max(1, t))).padStart(3, '0'); };

// ---------- рендер ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010101);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1.5, 90000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.4, 0.9);
composer.addPass(bloom); composer.addPass(new OutputPass());

// ---------- бетон ----------
const texL = new THREE.TextureLoader();
const tex = (u) => { const t = texL.load(u); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
const NP = 8, NS = 8;   // точечных источников и световых шахт
const U = {
  tAlb: { value: tex('assets/concrete/albedo.jpg') }, tNrm: { value: tex('assets/concrete/normal.jpg') },
  uP: { value: Array.from({ length: NP }, () => new THREE.Vector4(0, -1e4, 0, 1)) },        // xyz, радиус
  uC: { value: Array.from({ length: NP }, () => new THREE.Vector3()) },                    // цвет × сила
  uS: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 1, 0)) },          // x, z, радиус, сила
  uSY: { value: Array.from({ length: NS }, () => new THREE.Vector2(-1e4, -1e4)) },         // пол под шахтой, верх шахты
  uSky: { value: 0 }, uL: { value: 0 }, uAmb: { value: new THREE.Vector3(0.026, 0.028, 0.036) },
};
const concrete = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    varying vec3 vW; varying vec3 vN; varying float vT;
    void main() {
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = m * instanceMatrix;
      #endif
      vec4 w = m * vec4(position, 1.0);
      vW = w.xyz; vN = normalize(mat3(m) * normal);
      vT = 1.0;
      #ifdef USE_INSTANCING_COLOR
        vT = instanceColor.r;
      #endif
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tAlb, tNrm; uniform vec4 uP[${NP}]; uniform vec3 uC[${NP}]; uniform vec4 uS[${NS}]; uniform vec2 uSY[${NS}];
    uniform float uL, uSky; uniform vec3 uAmb;
    varying vec3 vW; varying vec3 vN; varying float vT;
    void main() {
      vec3 n = normalize(vN), a = abs(n); vec2 uv; vec3 t1, t2;
      if (a.y > a.x && a.y > a.z) { uv = vW.xz; t1 = vec3(1., 0., 0.); t2 = vec3(0., 0., 1.); }
      else if (a.x > a.z) { uv = vW.zy; t1 = vec3(0., 0., 1.); t2 = vec3(0., 1., 0.); }
      else { uv = vW.xy; t1 = vec3(1., 0., 0.); t2 = vec3(0., 1., 0.); }
      uv /= 16.0;
      vec3 alb = pow(texture2D(tAlb, uv).rgb, vec3(2.2));
      float macro = texture2D(tAlb, uv * 0.061 + 0.37).r;          // крупные пятна поверх тайла: повтор не читается
      alb *= (0.85 + 0.3 * macro) * vT;
      vec3 tn = texture2D(tNrm, uv).xyz * 2.0 - 1.0;
      vec3 N = normalize(n * max(tn.z, 0.2) + (t1 * tn.x + t2 * tn.y) * 0.32);
      vec3 L = uAmb * (0.5 + 0.5 * N.y);
      // световые шахты: пятно на всём, что смотрит вверх внутри луча, и отражённый свет на стенах рядом
      for (int i = 0; i < ${NS}; i++) {
        vec4 s = uS[i]; float d = length(vW.xz - s.xy);
        float inside = 1.0 - smoothstep(s.z * 0.7, s.z * 1.08, d);
        float under = step(vW.y, uSY[i].y) * step(uSY[i].x - 1.0, vW.y);
        float pool = inside * under * max(N.y, 0.0);
        float near = exp(-max(d - s.z, 0.0) / (s.z * 2.2)) * (1.0 - smoothstep(uSY[i].x, uSY[i].x + 220.0, vW.y));
        L += vec3(0.80, 0.86, 1.0) * s.w * uL * (pool * 1.6 + near * 0.10 * (1.0 - 0.6 * abs(N.y)) + near * 0.05);
      }
      // свет из проёма в 30 км над бездной: верхние грани светлеют, бока чуть-чуть — силуэты читаются
      float aby = 1.0 - smoothstep(-900.0, -760.0, vW.z);
      L += vec3(0.55, 0.62, 0.82) * uSky * aby * (pow(max(N.y, 0.0), 2.0) * 0.55 + 0.05);
      for (int i = 0; i < ${NP}; i++) {
        vec3 dl = uP[i].xyz - vW; float d2 = dot(dl, dl), r2 = uP[i].w * uP[i].w;
        L += uC[i] * max(dot(N, dl * inversesqrt(d2 + 1e-4)), 0.0) * r2 / (r2 + d2);
      }
      gl_FragColor = vec4(alb * L, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

// ---------- геометрия: всё — инстансы одного куба ----------
const BOXES = [];   // [cx, cy, cz, sx, sy, sz, tint]
const box = (x0, x1, y0, y1, z0, z1, tint = 1) => BOXES.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tint]);
function flushBoxes() {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, BOXES.length), m = new THREE.Matrix4(), c = new THREE.Color();
  BOXES.forEach((b, i) => { m.makeScale(b[3], b[4], b[5]).setPosition(b[0], b[1], b[2]); im.setMatrixAt(i, m); im.setColorAt(i, c.setScalar(b[6])); });
  im.frustumCulled = false; scene.add(im); return im;
}

// ---------- мир ----------
// Ось: стена с логотипом стоит лицом к зрителю (+z). За ней — терраса, гигантская лестница вниз на 160 м
// и нижний зал: пол 3×3 км, колонны в километр высотой, мосты, световые шахты из перекрытия, светящаяся дальняя стена.
const WALL = { x0: -140, x1: 50, h: 270, z: 4 };
const LOGO = V(-48, 196, WALL.z + 0.6);
const REEL = { w: 48, h: 27 };
const LOW = -160, STAIR = { x0: 56, x1: 128, z0: -300, z1: -620 };
const L2 = LOW - 900, ABY = { c: V(0, 0, -3800), R: 3000, core: 260 };
const CUBES = [
  { p: V(300, LOW, -1300), s: 22, t: 'азия' }, { p: V(-300, LOW, -1800), s: 26, t: 'спорт' }, { p: V(-310, L2, -2290), s: 20, t: 'ивенты' },
  { p: V(300, L2, -2700), s: 24, t: 'мерч' }, { p: V(300, L2, -3100), s: 22, t: 'ai-продакшн' }, { p: V(0, L2, -3480), s: 46, t: 'atl' },
];
const SHAFTS = [];   // { x, z, r, k, floor, top }
let PATH = [], SEG = [], S_TOTAL = 0;

function buildWorld(slot) {
  // зал логотипа: стена, левая стена, низкое перекрытие — сжатие перед раскрытием
  box(WALL.x0, WALL.x1, 0, WALL.h, -WALL.z, WALL.z);
  box(-320, -300, -10, 420, -300, 140);
  box(-320, 60, 300, 330, -40, 140, 0.8);
  box(-320, 320, -10, 0, -300, 160);                                   // терраса
  // монолиты на террасе — силуэты, о которые цепляется взгляд за краем стены
  box(-250, -205, 0, 380, -210, -170); box(190, 230, 0, 240, -130, -95); box(250, 330, 0, 120, -260, -230, 0.9);
  // лестница вниз: 40 ступеней по 4 м
  const N = 40, rise = -LOW / N, run = (STAIR.z0 - STAIR.z1) / N;
  for (let i = 0; i < N; i++) box(STAIR.x0, STAIR.x1, LOW - 10, -i * rise, STAIR.z0 - i * run - run, STAIR.z0 - i * run);
  box(STAIR.x0 - 6, STAIR.x0, LOW, 6, STAIR.z1, STAIR.z0); box(STAIR.x1, STAIR.x1 + 6, LOW, 6, STAIR.z1, STAIR.z0);
  // обрыв террасы и стенка под ней
  box(-320, 320, LOW, -10, -310, -300);
  // после лестницы — балкон, вырезанный в стене бездны: колонны держат перекрытие, за краем — пустота
  box(-600, 600, LOW - 20, LOW, -830, -300);
  box(-620, 620, 900, 940, -880, -300, 0.7);
  box(-620, -600, LOW, 940, -880, -300); box(600, 620, LOW, 940, -880, -300);
  [[-380, -470], [380, -470], [-380, -720], [380, -720], [-210, -800], [260, -560]].forEach(([x, z]) => box(x - 22, x + 22, LOW, 900, z - 22, z + 22));
  // бездна: колодец Ø6 км и 60 км высотой, в центре ядро. Монолиты в сотни метров, балки на километры, висящие пилоны
  const C = ABY.c, R = ABY.R;
  const corridor = (x, y, z, r) => Math.abs(x) < 560 + r && y > L2 - 400 - r && y < LOW + 500 + r && z < -650 + r && z > -3650 - r;
  for (let i = 0, n = 0; n < 18 && i < 600; i++) {
    const a = rnd() * Math.PI * 2, d = 700 + rnd() * 2000, sz = 150 + rnd() * 750, x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d, y = (rnd() - 0.5) * 12000;
    if (corridor(x, y, z, sz) || d + sz * 0.75 > R - 60) continue;
    box(x - sz / 2, x + sz / 2, y - sz * 0.8, y + sz * 0.8, z - sz / 2, z + sz / 2, 0.8 + rnd() * 0.4); n++;
  }
  for (let i = 0, n = 0; n < 34 && i < 800; i++) {
    const y = (rnd() - 0.5) * 16000, off = (rnd() - 0.5) * 5000, th = 30 + rnd() * 90, half = Math.sqrt(Math.max(R * R - off * off, 0));
    if (y > L2 - 350 && y < LOW + 450) continue;
    if (rnd() < 0.5) box(C.x - half, C.x + half, y, y + th, C.z + off - th * 0.6, C.z + off + th * 0.6);
    else box(C.x + off - th * 0.6, C.x + off + th * 0.6, y, y + th, C.z - half, C.z + half);
    n++;
  }
  box(-232, -208, L2 - 3200, LOW + 2600, -2340, -2300);   // пилон, по которому лента ныряет вниз на 900 м
  for (let i = 0, n = 0; n < 16 && i < 300; i++) {
    const a = rnd() * Math.PI * 2, d = 500 + rnd() * 2300, x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d, w = 14 + rnd() * 36;
    if (corridor(x, LOW, z, w)) continue; box(x - w / 2, x + w / 2, -2500 - rnd() * 12000, 800 + rnd() * 12000, z - w / 2, z + w / 2); n++;
  }
  // путь неоновой ленты: точки и нормаль поверхности, по которой она идёт
  const sx = slot.x, z = WALL.z + 0.25, rc = V(sx + REEL.w / 2 - 2, 104, 0), m = 2.6;
  const yt = rc.y + REEL.h / 2 + m, yb = rc.y - REEL.h / 2 - m, xl = rc.x - REEL.w / 2 - m, xr = rc.x + REEL.w / 2 + m;
  REEL.c = rc;
  const wallN = V(0, 0, 1), up = V(0, 1, 0);
  const P = [[V(sx, slot.y - 5, z), wallN], [V(sx, yt, z), wallN], [V(xr, yt, z), wallN], [V(xr, yb, z), wallN], [V(xl, yb, z), wallN], [V(xl, 0.2, z), wallN],
    [V(xl, 0.25, 9), up], [V(90, 0.25, 9), up], [V(90, 0.25, STAIR.z0 - run), up]];
  // по лестнице лента идёт прямой над кромками ступеней: на кромке — 0,25 м, между ними — 2,25 м
  const zBot = STAIR.z0 - run + 2 * LOW;
  P.push([V(90, LOW + 0.25, zBot), V(0, run, -rise).normalize()]);
  // дальше — мостки над бездной: зигзаг между площадками, нырок по пилону на 900 м вниз, нижний ярус, ворота ядра
  const at = (x, y, z, n = up) => P.push([V(x, y + 0.25, z), n]);
  at(90, LOW, -700); at(0, LOW, -700); at(0, LOW, -1300); at(220, LOW, -1300); at(220, LOW, -1800); at(-220, LOW, -1800); at(-220, LOW, -2290);
  at(-220, LOW, -2299.6, up); at(-220, L2 + 0.15, -2299.6, V(0, 0, 1)); at(-220, L2, -2290);
  at(-120, L2, -2290); at(-120, L2, -2700); at(220, L2, -2700); at(220, L2, -3100); at(0, L2, -3100); at(0, L2, -3440);
  PATH = P;
  // мостки и площадки под лентой
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i][0], b = P[i + 1][0]; if (Math.abs(a.y - b.y) > 1 || Math.min(a.z, b.z) > -826) continue;
    box(Math.min(a.x, b.x) - 5, Math.max(a.x, b.x) + 5, a.y - 4.25, a.y - 0.25, Math.min(a.z, b.z) - 5, Math.min(Math.max(a.z, b.z) + 5, -826), 0.9);
  }
  CUBES.forEach(c => { const h = c.t === 'atl' ? 90 : 50; box(c.p.x - h, c.p.x + h, c.p.y - 6, c.p.y, c.p.z - h, c.p.z + h); });
  const im = flushBoxes();
  let s = 0; SEG = [];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i][0], b = P[i + 1][0], l = a.distanceTo(b); SEG.push({ a, b, n: P[i + 1][1], s0: s, s1: s + l }); s += l; }
  S_TOTAL = s;

  // шахты света над кубами и ещё несколько — для ритма
  CUBES.forEach(c => SHAFTS.push({ x: c.p.x, z: c.p.z, r: c.s * 2.2, k: 1.0, floor: c.p.y, top: c.p.y + 2600 }));
  SHAFTS.push({ x: -260, z: -560, r: 60, k: 0.7, floor: LOW, top: 900 });
  SHAFTS.forEach((sh, i) => { U.uS.value[i].set(sh.x, sh.z, sh.r, sh.k); U.uSY.value[i].set(sh.floor, sh.top); });
  return im;
}

// ---------- свет, который видно: лучи шахт, окна в перекрытии, дальняя стена ----------
const beamMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(0xc4d0ff) } },
  vertexShader: 'varying float vY; varying float vF; void main(){ vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.); vec3 n = normalize(mat3(modelMatrix) * normal); vF = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: 'uniform float uK; uniform vec3 uC; varying float vY; varying float vF; void main(){ float a = uK * pow(vF, 2.2) * mix(.35, 1., vY); gl_FragColor = vec4(uC, a); }',
});
const FX = { beams: [], dust: null, cubes: [], glows: [] };
function cityMat(R, density, side) {
  return new THREE.ShaderMaterial({
    side, uniforms: { uL: { value: 0 }, uC: { value: ABY.c } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uL; uniform vec3 uC; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        if (${side === THREE.BackSide ? 'true' : 'false'} && abs(vW.x) < 600.0 && vW.y > ${LOW - 25}.0 && vW.y < 945.0 && vW.z > -1300.0) discard;   // проём балкона
        vec2 d = vW.xz - uC.xz; float u = atan(d.y, d.x) * ${R}.0, fy = vW.y / 32.0, fl = fract(fy);
        vec2 cell = vec2(floor(u / 9.0), floor(fy)), f = vec2(fract(u / 9.0), fl);
        float lit = step(${1 - density}, h(cell)) * step(0.62, h(floor(vec2(u / 520.0, vW.y / 1400.0))));
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.34, f.y) * step(f.y, 0.72);
        float px = length(fwidth(vW)) / 9.0, aa = 1.0 - smoothstep(0.2, 0.7, px);
        vec3 wc = mix(vec3(1.0, 0.76, 0.52), vec3(0.72, 0.84, 1.0), step(0.55, h(cell + 7.0)));
        float far = exp(-abs(vW.y - cameraPosition.y) / 7000.0);
        vec3 col = wc * lit * (win * aa + (1.0 - aa) * 0.27) * 1.5 * uL * far;
        vec3 base = vec3(0.010, 0.011, 0.013) * (0.6 + 0.6 * step(0.92, fl)) + vec3(0.03, 0.034, 0.045) * smoothstep(-2000.0, 30000.0, vW.y) * uL;
        gl_FragColor = vec4(base + col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const softDot = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const basic = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
function buildLight() {
  SHAFTS.forEach(sh => {
    const len = sh.top - sh.floor, b = new THREE.Mesh(new THREE.CylinderGeometry(sh.r * 0.85, sh.r * 1.05, len, 24, 1, true), beamMat());
    b.position.set(sh.x, sh.floor + len / 2, sh.z); scene.add(b); FX.beams.push({ b, k: sh.k });
    if (sh.top === 900) { const hole = new THREE.Mesh(new THREE.CircleGeometry(sh.r * 0.9, 32), basic(0xdfe6ff, 2.2)); hole.rotation.x = Math.PI / 2; hole.position.set(sh.x, 899, sh.z); scene.add(hole); FX.glows.push(hole); }
  });
  // стены колодца и ядро — города в разрезе: этажи по 32 м, тысячи окон (рисует шейдер, геометрии почти нет)
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ABY.R, ABY.R, 60000, 512, 1, true), cityMat(ABY.R, 0.07, THREE.BackSide)); wall.position.copy(ABY.c); scene.add(wall);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(ABY.core, ABY.core, 60000, 96, 1, true), concrete); core.position.copy(ABY.c); scene.add(core); FX.city = [wall];   // ядро — голый бетон, его красит Искра
  const sky = new THREE.Mesh(new THREE.CircleGeometry(2600, 96), basic(0xe4ebff, 1.8)); sky.rotation.x = Math.PI / 2; sky.position.set(ABY.c.x, 29900, ABY.c.z); scene.add(sky); FX.glows.push(sky);
  // Искра на ядре — 700 м: доминанта, к которой ведут мостки
  const ig = iskra.geometry.clone(); ig.computeBoundingBox(); const ib = ig.boundingBox, k = 700 / (ib.max.y - ib.min.y);
  const big = new THREE.Mesh(ig, basic(RED, 1.7)); big.scale.set(k, k, k * 0.2); big.position.set(ABY.c.x, LOW + 260, ABY.c.z + ABY.core + 30); scene.add(big); FX.glows.push(big); FX.big = big;
  // пыль в лучах
  const N = 5000, pos = new Float32Array(N * 3), r = mulberry(7);
  for (let i = 0; i < N; i++) { const sh = SHAFTS[i % SHAFTS.length], a = r() * Math.PI * 2, d = Math.sqrt(r()) * sh.r; pos.set([sh.x + Math.cos(a) * d, sh.floor + r() * 700, sh.z + Math.sin(a) * d], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  FX.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, map: softDot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xaab4d0, opacity: 0 }));
  FX.dust.frustumCulled = false; scene.add(FX.dust);
  // кубы-заглушки кейсов: светящийся объём, подпись квартала
  CUBES.forEach(c => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), basic(CREAM, 1.6)); m.position.set(c.p.x, c.p.y + c.s / 2 + (c.t === 'atl' ? 30 : 0), c.p.z); scene.add(m);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(c.s * 1.6, c.s * 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#E1D9CF'; g.font = '520 64px TT, sans-serif'; g.textAlign = 'center'; g.fillText(c.t, w / 2, 84); }), transparent: true, depthWrite: false, toneMapped: false }));
    lab.position.copy(m.position).add(V(0, c.s * 0.8, 0)); scene.add(lab); FX.cubes.push({ m, c, lab });
  });
  // крошечные люди: 1,8 м рядом с объёмами в сотни метров
  const people = [[V(30, 0, -290)], [V(36, 0, -292)], [V(-150, 0, -40)], [V(80, LOW, -660)], [V(98, -40, -460)], [V(-40, LOW, -826)], [V(-36, LOW, -827)], [V(4, LOW, -1050)], [V(222, LOW, -1560)], [V(-118, L2, -2500)], [V(-6, L2, -3420)], [V(9, L2, -3424)]];
  const pg = new THREE.CapsuleGeometry(0.32, 1.1, 3, 8); pg.translate(0, 0.87, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0x050505 }), people.length), mm = new THREE.Matrix4();
  people.forEach(([p], i) => pm.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z))); scene.add(pm);
}

// ---------- неоновая лента ----------
let neon;
function buildNeon() {
  const pos = [], ss = [], idx = [], w = 0.45;
  SEG.forEach(sg => {
    const dir = sg.b.clone().sub(sg.a).normalize(), side = dir.clone().cross(sg.n).normalize().multiplyScalar(w), lift = sg.n.clone().multiplyScalar(0.08);
    const a = sg.a.clone().addScaledVector(dir, -w).add(lift), b = sg.b.clone().addScaledVector(dir, w).add(lift), k = pos.length / 3;
    [a.clone().add(side), a.clone().sub(side), b.clone().add(side), b.clone().sub(side)].forEach(p => pos.push(p.x, p.y, p.z));
    ss.push(sg.s0 - w, sg.s0 - w, sg.s1 + w, sg.s1 + w); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1)); g.setIndex(idx);
  neon = new THREE.Mesh(g, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: { uDraw: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uDraw, uT; varying float vS; void main(){ if (vS > uDraw) discard; float head = exp(-(uDraw - vS) / 2.5); float pulse = 0.85 + 0.15 * sin(vS * 0.08 - uT * 3.0); vec3 c = vec3(1.0, 0.03, 0.035) * (2.6 * pulse + 9.0 * head); gl_FragColor = vec4(c, 1.0); }',
  }));
  neon.frustumCulled = false; scene.add(neon);
}
const headAt = (s, out = V(0, 0, 0)) => { s = Math.min(Math.max(s, 0), S_TOTAL); const sg = SEG.find(g => s <= g.s1) || SEG[SEG.length - 1]; return out.lerpVectors(sg.a, sg.b, (s - sg.s0) / (sg.s1 - sg.s0 || 1)); };

// ---------- логотип и Искра (из брендбука: assets/logo.svg) ----------
const logo = { mat: null }; let iskra, slot = V(0, 0, 0);
async function buildLogo() {
  const data = await new SVGLoader().loadAsync('assets/logo.svg');
  let shapes = []; data.paths.forEach(p => shapes.push(...SVGLoader.createShapes(p)));
  const bb = s => { const b = new THREE.Box2(); s.getPoints().forEach(pt => b.expandByPoint(pt)); return b; };
  const boxes = shapes.map(bb), all = new THREE.Box2(); boxes.forEach(b => all.union(b));
  const oIdx = boxes.reduce((m, b, i) => b.min.x < boxes[m].min.x ? i : m, 0), oShape = shapes[oIdx];
  let iskraPts;
  if (oShape.holes.length) {
    const hole = oShape.holes.map(h => ({ h, b: bb(h) })).sort((a, b) => (b.b.max.x - b.b.min.x) * (b.b.max.y - b.b.min.y) - (a.b.max.x - a.b.min.x) * (a.b.max.y - a.b.min.y))[0];
    iskraPts = hole.h.getPoints(6);
  } else { const inner = boxes.findIndex((b, i) => i !== oIdx && boxes[oIdx].containsBox(b)); iskraPts = shapes[inner].getPoints(6); shapes.splice(inner, 1); }
  const cx = (all.min.x + all.max.x) / 2, cy = (all.min.y + all.max.y) / 2, S = 72 / (all.max.x - all.min.x), depth = 4;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 8 }); geo.translate(-cx, -cy, 0);
  logo.mat = new THREE.MeshStandardMaterial({ color: 0x241514, emissive: RED, emissiveIntensity: 0, roughness: 0.8, metalness: 0 });
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, logo.mat)); g.scale.set(S, -S, S); g.position.copy(LOGO); scene.add(g);
  const ib = new THREE.Box2(); iskraPts.forEach(pt => ib.expandByPoint(pt));
  const icx = (ib.min.x + ib.max.x) / 2, icy = (ib.min.y + ib.max.y) / 2;
  const igeo = new THREE.ExtrudeGeometry(new THREE.Shape(iskraPts.map(pt => new THREE.Vector2(pt.x - icx, -(pt.y - icy)))), { depth: 10, bevelEnabled: false, curveSegments: 8 });
  igeo.translate(0, 0, -5);
  iskra = new THREE.Mesh(igeo, new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.2 }));
  iskra.userData.S = S; scene.add(iskra);
  g.updateMatrixWorld(true); slot.set(icx - cx, icy - cy, depth / 2).applyMatrix4(g.matrixWorld);
  // для стандартных материалов (лого, Искра) — два настоящих источника: свет Искры и заливка лого после посадки
  logo.key = new THREE.PointLight(0xffb898, 0, 120, 1.2); scene.add(logo.key);
  logo.fill = new THREE.PointLight(0xffd8c8, 0, 160, 1.2); logo.fill.position.copy(LOGO).add(V(0, -10, 50)); scene.add(logo.fill);
}

// шоурил: экран утоплен в стену, лента обходит его по периметру
const promo = { v: null, on: false };
function buildReel() {
  const v = Object.assign(document.createElement('video'), { src: 'assets/oxygen_promo_v2.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'none' });
  promo.v = v; const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(REEL.w, REEL.h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: 0x000000 }));
  m.position.set(REEL.c.x, REEL.c.y, WALL.z + 0.15); scene.add(m); promo.m = m;
}

// ---------- таймлайн ----------
// p 0…0.17 — Искра в темноте летит к стене и встаёт в лого; дальше всё движение привязано к голове ленты.
const P_LINE = 0.19;
let CAMK = [], ISK = [], SMAP = [];
function buildTimeline() {
  const s = slot, L0 = LOGO, rc = REEL.c, sl = iskra.userData.S;
  const sAt = pt => { let best = 0, bd = 1e9; for (let x = 0; x <= S_TOTAL; x += 0.5) { const d = headAt(x).distanceTo(pt); if (d < bd) { bd = d; best = x; } } return best; };
  const sv = PATH.map(p => sAt(p[0]));
  // p ↔ длина ленты: стена неторопливо, пространство быстрее
  const sEdge = sv[11] + 130;   // край балкона
  SMAP = [[P_LINE, 0], [0.25, sv[1]], [0.36, sv[4]], [0.42, sv[6]], [0.5, sv[7]], [0.56, sv[8]], [0.62, sv[9]], [0.67, sEdge], [0.71, sEdge + 1], [0.8, sv[17]], [0.86, sv[18]], [0.985, S_TOTAL]];
  const pOf = x => { for (let i = 0; i < SMAP.length - 1; i++) if (x <= SMAP[i + 1][1]) return SMAP[i][0] + (SMAP[i + 1][0] - SMAP[i][0]) * (x - SMAP[i][1]) / (SMAP[i + 1][1] - SMAP[i][1] || 1); return 1; };
  const narrow = innerWidth < 760;
  CAMK = [
    { p: 0.00, pos: V(L0.x + 4, L0.y + 4, 250), look: V(L0.x + 4, L0.y, 0) },
    { p: 0.05, pos: V(L0.x + 4, L0.y + 4, 248), look: V(L0.x + 4, L0.y, 0) },
    { p: 0.11, pos: V(L0.x + 24, L0.y + 12, 130), look: V(s.x + 10, s.y, 0) },
    { p: 0.155, pos: V(s.x + 8, s.y + 4, 58), look: V(s.x, s.y, 4) },
    { p: 0.175, pos: V(L0.x, L0.y - 2, 100), look: V(L0.x, L0.y - 4, 0) },
    { p: P_LINE, pos: V(L0.x, L0.y - 4, 100), look: V(L0.x, L0.y - 8, 0) },
    { p: pOf(sv[1]), pos: V(rc.x - 4, (s.y + PATH[1][0].y) / 2, 92), look: V(rc.x - 4, PATH[1][0].y + 4, 0) },
    { p: pOf(sv[2]), pos: V(rc.x, rc.y + 2, 74), look: V(rc.x, rc.y, 0) },
    { p: pOf(sv[4]), pos: V(rc.x, rc.y - 1, 72), look: V(rc.x, rc.y - 2, 0) },
    { p: pOf(sv[5]), pos: V(PATH[5][0].x + 18, 16, 56), look: V(PATH[5][0].x + 12, 6, 0) },
    { p: pOf(sv[6] + 30), pos: V(PATH[6][0].x + 44, 12, 52), look: V(PATH[6][0].x + 44, 9, 0) },
    // шаг вбок вдоль стены: камера не поворачивается, стена кончается — и за ней открывается зал
    { p: pOf(sv[7] - 30), pos: V(62, 12, 50), look: V(62, 9.5, 0) },
    { p: pOf(sv[7]), pos: V(88, 13, 48), look: V(90, 10, -120) },
    { p: pOf(sv[7] + 160), pos: V(96, 26, -60), look: V(90, -30, -800) },
    { p: pOf(sv[8]), pos: V(104, 34, -236), look: V(90, -120, -900) },
    { p: pOf((sv[8] + sv[9]) / 2), pos: V(112, -50, -430), look: V(80, -150, -1000) },
    { p: pOf(sv[9]), pos: V(110, -116, -575), look: V(70, -140, -1000) },
  ];
  // край балкона: лента замирает, камера выходит за край и смотрит на ядро и вверх — 30 км до неба
  CAMK.push({ p: pOf(sv[10]), pos: V(70, LOW + 26, -600), look: V(40, LOW + 10, -900) });
  CAMK.push({ p: 0.665, pos: V(10, LOW + 30, -720), look: V(0, LOW + 120, -3800) });
  CAMK.push({ p: 0.69, pos: V(-30, LOW + 70, -860), look: V(0, LOW + 900, -3800) });
  CAMK.push({ p: 0.712, pos: V(30, LOW + 60, -980), look: V(0, LOW - 300, -3800) });
  [12, 13, 14, 15].forEach(i => { const v = PATH[i][0]; CAMK.push({ p: pOf(sv[i]), pos: v.clone().add(V(0, 38, 130)), look: v.clone().add(V(0, 10, -180)) }); });
  // нырок: лента уходит вниз по пилону, камера падает рядом с ней на 900 м сквозь балки
  CAMK.push({ p: pOf(sv[17]), pos: V(-150, LOW + 40, -2190), look: V(-220, LOW - 60, -2300) });
  CAMK.push({ p: pOf((sv[17] + sv[18]) / 2), pos: V(-110, LOW - 420, -2170), look: V(-220, LOW - 560, -2300) });
  CAMK.push({ p: pOf(sv[18]), pos: V(-100, L2 + 46, -2160), look: V(-200, L2, -2320) });
  [20, 21, 22, 23, 24].forEach(i => { const v = PATH[i][0]; CAMK.push({ p: pOf(sv[i]), pos: v.clone().add(V(0, 38, 130)), look: v.clone().add(V(0, 10, -180)) }); });
  // финал: ворота ядра, взгляд вверх на Искру
  CAMK.push({ p: 1, pos: V(60, L2 + 160, -2780), look: V(0, LOW + 120, -3540) });
  CAMK.sort((a, b) => a.p - b.p);
  CAMK.pos = new THREE.CatmullRomCurve3(CAMK.map(k => k.pos), false, 'centripetal');
  CAMK.look = new THREE.CatmullRomCurve3(CAMK.map(k => k.look), false, 'centripetal');
  const hero = narrow ? 1.6 : 2.4;
  ISK = [
    { p: 0.00, pos: V(L0.x + 4, L0.y + 1, 160), sc: sl * hero, spin: 0 },
    { p: 0.05, pos: V(L0.x + 4, L0.y + 1, 160), sc: sl * hero, spin: 1.2 },
    { p: 0.11, pos: V(s.x + 12, s.y + 6, 44), sc: sl * 1.6, spin: 7 },
    { p: 0.155, pos: V(s.x, s.y + 2, s.z + 14), sc: sl * 1.15, spin: 11.6 },
    { p: 0.17, pos: s.clone(), sc: sl, spin: 4 * Math.PI },
    { p: 1.00, pos: s.clone(), sc: sl, spin: 4 * Math.PI },
  ];
}
const sOfP = p => { if (p <= SMAP[0][0]) return 0; for (let i = 0; i < SMAP.length - 1; i++) if (p <= SMAP[i + 1][0]) return SMAP[i][1] + (SMAP[i + 1][1] - SMAP[i][1]) * (p - SMAP[i][0]) / (SMAP[i + 1][0] - SMAP[i][0]); return S_TOTAL; };

// ---------- цикл ----------
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b }));
const pctEl = document.getElementById('pct');
let pSm = 0; const mouse = new THREE.Vector2(), mouseSm = new THREE.Vector2(), look = V(0, 0, 0), head = V(0, 0, 0), tmp = V(0, 0, 0);
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
const clock = new THREE.Clock();
const RED_C = new THREE.Color(1, 0.06, 0.05), RED_V = V(1, 0.06, 0.05), CREAM_V = V(1, 0.9, 0.78);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? clamp01(scrollY / max) : 0;
  pSm += (p - pSm) * (1 - Math.exp(-dt * 2.6));
  // камера по сплайну ключей
  const k = CAMK; let i = 0; while (i < k.length - 2 && pSm > k[i + 1].p) i++;
  const u = (i + clamp01((pSm - k[i].p) / (k[i + 1].p - k[i].p))) / (k.length - 1);
  k.pos.getPoint(u, camera.position); k.look.getPoint(u, look);
  mouseSm.lerp(mouse, Math.min(1, dt * 3)); camera.position.x += mouseSm.x * 3; camera.position.y -= mouseSm.y * 2;
  camera.lookAt(look);
  // Искра
  let j = 0; while (j < ISK.length - 2 && pSm > ISK[j + 1].p) j++;
  const a = ISK[j], b = ISK[j + 1], t = smooth(clamp01((pSm - a.p) / (b.p - a.p)));
  iskra.position.lerpVectors(a.pos, b.pos, t); iskra.scale.setScalar(a.sc + (b.sc - a.sc) * t); iskra.rotation.set(0, 0, a.spin + (b.spin - a.spin) * t);
  const landed = clamp01((pSm - 0.165) / 0.02);
  iskra.rotation.y = (1 - landed) * Math.sin(time * 1.6) * 0.5; iskra.position.y += (1 - landed) * Math.sin(time * 1.3) * 0.8;
  const flick = 0.9 + 0.1 * Math.sin(time * 13) * Math.sin(time * 7.3);
  logo.key.position.copy(iskra.position).add(V(0, 0, -3)); logo.key.intensity = 260 * (1 - landed) * flick;   // свет за Искрой: она остаётся красной, светит на стену
  logo.mat.emissiveIntensity = 1.3 * landed; logo.mat.color.set(0x241514).lerp(RED_C, landed); logo.fill.intensity = 120 * landed;
  iskra.material.emissiveIntensity = 1.0 * (1 - landed) + 1.3 * landed;
  // лента
  const s = sOfP(pSm); neon.material.uniforms.uDraw.value = pSm < P_LINE ? -1 : s; neon.material.uniforms.uT.value = time;
  headAt(s, head);
  // свет для бетона: Искра, лого, голова ленты и хвост, ближайшие кубы
  const P = U.uP.value, C = U.uC.value;
  if (landed < 0.999) { P[0].set(iskra.position.x, iskra.position.y, iskra.position.z + 4, 26); C[0].set(1, 0.55, 0.42).multiplyScalar(3.2 * (1 - landed) * flick); }
  else { const b = FX.big.position; P[0].set(b.x, b.y, b.z + 120, 520); C[0].set(1, 0.07, 0.05).multiplyScalar(2.2); }   // после посадки этот слот — красный отсвет Искры на ядре
  P[1].set(LOGO.x, LOGO.y - 6, LOGO.z + 12, 40); C[1].set(1, 0.08, 0.06).multiplyScalar(1.6 * landed);
  const lineOn = pSm >= P_LINE ? 1 : 0;
  P[2].set(head.x, head.y + 1.5, head.z + 1.5, 10); C[2].copy(RED_V).multiplyScalar(1.7 * lineOn);
  headAt(s - 30, tmp); P[3].set(tmp.x, tmp.y + 1.5, tmp.z + 1.5, 22); C[3].copy(RED_V).multiplyScalar(0.5 * lineOn * clamp01(s / 30));
  const near = FX.cubes.map(c => ({ c, d: c.m.position.distanceTo(camera.position) })).sort((x, y) => x.d - y.d);
  for (let n = 0; n < 4; n++) { const c = near[n].c, mp = c.m.position; P[4 + n].set(mp.x, mp.y + c.c.s * 0.2, mp.z, c.c.s * 1.6); C[4 + n].copy(CREAM_V).multiplyScalar(0.9 * U.uL.value); }
  // свет зала включается, когда Искра встала в логотип (за стеной его ещё не видно — он ждёт зрителя)
  const Lh = clamp01((pSm - 0.17) / 0.06); U.uL.value = Lh;
  FX.beams.forEach(o => { o.b.material.uniforms.uK.value = 0.022 * o.k * Lh; });
  FX.glows.forEach(g => { g.visible = Lh > 0.01; }); FX.city.forEach(c => { c.material.uniforms.uL.value = Lh; }); U.uSky.value = 0.5 * Lh;
  FX.cubes.forEach(c => { c.m.visible = c.lab.visible = Lh > 0.01; c.m.rotation.y = 0; });
  FX.dust.material.opacity = 0.28 * Lh; FX.dust.rotation.y = Math.sin(time * 0.02) * 0.002; FX.dust.position.y = Math.sin(time * 0.15) * 3;
  // ролик
  if (!promo.on && pSm > 0.2) { promo.on = true; promo.v.play().then(() => promo.m.material.color.set(0xffffff)).catch(() => addEventListener('pointerdown', () => promo.v.play().then(() => promo.m.material.color.set(0xffffff)), { once: true })); }
  // тексты
  ovs.forEach(o => o.el.classList.toggle('on', pSm >= o.a && pSm <= o.b));
  pctEl.textContent = `${String(Math.round(pSm * 100)).padStart(3, '0')}% · 20_26`;
  composer.render();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
await document.fonts.load('520 64px TT').catch(() => {});
await buildLogo();
buildWorld(slot); buildLight(); buildNeon(); buildReel(); buildTimeline();
renderer.compile(scene, camera);
window.__mega = { cam: camera, composer, bloom, go: p => { scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)); pSm = p; }, renderer, scene };
const AT = new URLSearchParams(location.search).get('p'); if (AT) window.__mega.go(+AT);
frame();
await new Promise(res => { const t0 = performance.now(); let calm = 0; const tick = () => { calm = LOAD.total === LOAD.loaded ? calm + 1 : 0; if (calm > 3 || performance.now() - t0 > 30000) return res(); setTimeout(tick, 150); }; tick(); });
document.getElementById('loader').classList.add('done'); document.documentElement.classList.remove('lock');
