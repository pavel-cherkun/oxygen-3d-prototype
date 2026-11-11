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
import { Reflector } from 'three/addons/objects/Reflector.js';

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
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 9000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.4, 0.9);
composer.addPass(bloom); composer.addPass(new OutputPass());

// ---------- бетон ----------
const texL = new THREE.TextureLoader();
const tex = (u) => { const t = texL.load(u); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
const NP = 12, NS = 8;   // точечных источников и световых шахт
// Бетон по референсам: сама поверхность гладкая и почти однотонная. Живость даёт не зерно, а
// 1) свет — пятна шахт, лампы, отражённый свет; 2) сырость — вертикальные потёки на стенах, тёмная полоса у пола, лужи;
// 3) воздух — дымка своего цвета в каждой локации (как на рефах: глубина читается слоями, а не деталями).
const U = {
  tAlb: { value: tex('assets/concrete/albedo.jpg') }, tNrm: { value: tex('assets/concrete/normal.jpg') }, tStain: { value: tex('assets/concrete/stain.jpg') },
  uP: { value: Array.from({ length: NP }, () => new THREE.Vector4(0, -1e4, 0, 1)) },        // xyz, радиус
  uC: { value: Array.from({ length: NP }, () => new THREE.Vector3()) },                    // цвет × сила
  uS: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 1, 0)) },          // x, z, радиус, сила
  uSY: { value: Array.from({ length: NS }, () => new THREE.Vector2(-1e4, -1e4)) },         // пол под шахтой, верх шахты
  uL: { value: 0 }, uAmb: { value: new THREE.Vector3(0.026, 0.028, 0.036) },
  uHaze: { value: new THREE.Vector3(0, 0, 0) }, uHazeK: { value: 0 }, uT: { value: 0 },
};
const HAZE = /* glsl */`uniform vec3 uHaze; uniform float uHazeK;
  vec3 haze(vec3 c, vec3 w) { float f = 1.0 - exp(-length(w - cameraPosition) * uHazeK); return mix(c, uHaze, f); }`;
const LIGHT = /* glsl */`uniform vec4 uP[${NP}]; uniform vec3 uC[${NP}]; uniform vec4 uS[${NS}]; uniform vec2 uSY[${NS}]; uniform float uL; uniform vec3 uAmb;
  vec3 light(vec3 N, vec3 w) {
    vec3 L = uAmb * (0.5 + 0.5 * N.y);
    for (int i = 0; i < ${NS}; i++) {
      vec4 s = uS[i]; float d = length(w.xz - s.xy);
      float inside = 1.0 - smoothstep(s.z * 0.7, s.z * 1.08, d);
      float under = step(w.y, uSY[i].y) * step(uSY[i].x - 1.0, w.y);
      float pool = inside * under * max(N.y, 0.0);
      float near = exp(-max(d - s.z, 0.0) / (s.z * 2.0 + 40.0)) * under;
      L += vec3(0.80, 0.86, 1.0) * s.w * uL * (pool * 1.6 + near * 0.22 * (1.0 - 0.5 * abs(N.y)) + near * 0.05);
    }
    for (int i = 0; i < ${NP}; i++) {
      vec3 dl = uP[i].xyz - w; float d2 = dot(dl, dl), r2 = uP[i].w * uP[i].w;
      L += uC[i] * max(dot(N, dl * inversesqrt(d2 + 1e-4)), 0.0) * r2 / (r2 + d2);
    }
    return L;
  }`;
// один шейдер на всё: бетон (текстура + сырость) или FLAT — цвет из инстанса (товары, сакура, сталь, кабели)
function litMat({ flat = false, glow = 0, side = THREE.DoubleSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: U, side, defines: Object.assign({}, flat ? { FLAT: 1 } : {}, glow ? { GLOW: glow.toFixed(3) } : {}),
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(m) * normal); vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tAlb, tNrm, tStain;
      ${LIGHT}
      ${HAZE}
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      void main() {
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 N = n, alb;
        #ifdef FLAT
          alb = vC;
        #else
          vec3 a = abs(n); vec2 uv; vec3 t1, t2;
          if (a.y > a.x && a.y > a.z) { uv = vW.xz; t1 = vec3(1., 0., 0.); t2 = vec3(0., 0., 1.); }
          else if (a.x > a.z) { uv = vW.zy; t1 = vec3(0., 0., 1.); t2 = vec3(0., 1., 0.); }
          else { uv = vW.xy; t1 = vec3(1., 0., 0.); t2 = vec3(0., 1., 0.); }
          alb = pow(texture2D(tAlb, uv / 16.0).rgb, vec3(2.2)) * vC.r;
          vec3 tn = texture2D(tNrm, uv / 16.0).xyz * 2.0 - 1.0;
          N = normalize(n * max(tn.z, 0.2) + (t1 * tn.x + t2 * tn.y) * 0.7);
          float wall = 1.0 - smoothstep(0.6, 0.9, a.y);
          float streak = texture2D(tStain, vec2(uv.x / 97.0, uv.y / 900.0)).r;                 // потёки по вертикали
          alb *= mix(1.0, 1.0 - 0.32 * streak, wall);
          float up = min(abs(vW.y + 160.0), abs(vW.y));                                         // высота над ближайшим полом
          alb *= mix(1.0, mix(0.42, 1.0, smoothstep(0.0, 11.0, up)), wall);                     // тёмная мокрая кайма у пола
          float pud = texture2D(tStain, vW.xz / 300.0).g;
          alb *= mix(1.0, 1.0 - 0.6 * smoothstep(0.35, 0.7, pud), step(0.9, n.y));            // сырые пятна на полу
          alb *= 0.9 + 0.2 * texture2D(tStain, vW.xz / 1900.0 + vW.y / 2300.0).g;              // крупный тон, километрами
        #endif
        vec3 L = light(N, vW);
        #ifdef GLOW
          L += vec3(GLOW);
        #endif
        vec3 c = haze(alb * L, vW);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
const concrete = litMat(), flatMat = litMat({ flat: true });

// ---------- геометрия: инстансы ----------
// бетонные коробки (в т.ч. повёрнутые — пролёты лестниц) складываются в один InstancedMesh
const BOXES = [];   // [Matrix4, tint]
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const box = (x0, x1, y0, y1, z0, z1, tint = 1) => BOXES.push([new THREE.Matrix4().compose(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), V(x1 - x0, y1 - y0, z1 - z0)), tint]);
const boxR = (c, s, r, tint = 1) => BOXES.push([new THREE.Matrix4().compose(c, _q.clone().setFromEuler(_e.set(r[0], r[1], r[2])), s), tint]);
function flushBoxes() { return inst(new THREE.BoxGeometry(1, 1, 1), concrete, BOXES.map(([m, t]) => ({ m, c: new THREE.Color(t, t, t) }))); }
function inst(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((o, i) => { im.setMatrixAt(i, o.m); im.setColorAt(i, o.c || new THREE.Color(1, 1, 1)); });
  im.frustumCulled = false; scene.add(im); return im;
}
const M = (p, r = [0, 0, 0], s = V(1, 1, 1)) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), s);
// балка между двумя точками (сталь, кабели, ветви)
const beam = (a, b, t) => { const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(t, d.length(), t)); };

// ---------- мир ----------
// Ось: стена с логотипом лицом к зрителю (+z). За ней — терраса и лестница вниз на 160 м. Дальше — цепочка лиминальных
// пространств мегаструктуры по доске megastructures: гипостильный зал (G-Cans) → красная труба → цилиндр с сакурой (Азия) →
// бесконечный продуктовый (ритейл) → сфера в стальном каркасе (ИИ) → колодец лестниц → вентиляционная шахта с вентилятором-Искрой.
const WALL = { x0: -140, x1: 50, h: 270, z: 4 };
const LOGO = V(-48, 196, WALL.z + 0.6);
const REEL = { w: 48, h: 27 };
const LOW = -160, STAIR = { x0: 56, x1: 128, z0: -300, z1: -620 };
const ZN = { hyp: -1500, asia: -2100, asiaR: 260, ret0: -2420, ret1: -3320, ai0: -3420, ai1: -4440, st1: -5160, fan: -6420 };
const CUBES = [
  { p: V(-170, LOW, -880), s: 30, t: 'спорт' }, { p: V(170, LOW, -1220), s: 30, t: 'ивенты' }, { p: V(-222, LOW, -2100), s: 22, t: 'азия' },
  { p: V(-30, LOW, -2880), s: 14, t: 'ритейл' }, { p: V(235, LOW, -3930), s: 28, t: 'ai-продакшн' }, { p: V(-80, LOW, -4700), s: 30, t: 'мерч' }, { p: V(80, LOW, -4950), s: 34, t: 'atl' },
];
const SHAFTS = [];   // { x, z, r, k, floor, top }
const LAMPS = [];    // точечные источники локаций: { p, r, c } — к камере подсаживаются ближайшие 8
const ZONES = [      // дымка и общий свет по локациям (по z камеры)
  { z: 200, haze: [0, 0, 0], k: 0, amb: [0.026, 0.028, 0.036] },
  { z: -700, haze: [0.012, 0.016, 0.024], k: 0.0009, amb: [0.035, 0.038, 0.048] },
  { z: -1400, haze: [0.012, 0.016, 0.024], k: 0.0009, amb: [0.035, 0.038, 0.048] },
  { z: -1530, haze: [0.05, 0.004, 0.003], k: 0.002, amb: [0.03, 0.004, 0.004] },
  { z: -1860, haze: [0.03, 0.034, 0.045], k: 0.0008, amb: [0.03, 0.033, 0.04] },
  { z: -2440, haze: [0.05, 0.055, 0.05], k: 0.0007, amb: [0.06, 0.064, 0.06] },
  { z: -3440, haze: [0.012, 0.02, 0.036], k: 0.0007, amb: [0.02, 0.026, 0.04] },
  { z: -4460, haze: [0.022, 0.024, 0.03], k: 0.0006, amb: [0.04, 0.042, 0.048] },
  { z: -5120, haze: [0.022, 0.024, 0.03], k: 0.0006, amb: [0.04, 0.042, 0.048] },
  { z: -5240, haze: [0.06, 0.03, 0.012], k: 0.0018, amb: [0.025, 0.015, 0.01] },
];
let PATH = [], SEG = [], S_TOTAL = 0;
const FX = { beams: [], glows: [], cubes: [], dots: [] };

// стена с круглым проёмом: коробки вокруг квадратного выреза и вставка с круглой дырой
function portalWall(z, X, top, r = 36, dir = -1) {
  const t = 12, z0 = dir < 0 ? z - t : z, z1 = dir < 0 ? z : z + t;
  box(-X, -r - 4, LOW, top, z0, z1); box(r + 4, X, LOW, top, z0, z1); box(-r - 4, r + 4, LOW + 2 * r + 4, top, z0, z1);
  const sh = new THREE.Shape([V(-r - 4, 0), V(r + 4, 0), V(r + 4, 2 * r + 4), V(-r - 4, 2 * r + 4)].map(p => new THREE.Vector2(p.x, p.y)));
  sh.holes.push(new THREE.Path().absarc(0, r, r, 0, Math.PI * 2, false));
  const g = new THREE.ShapeGeometry(sh, 48);
  inst(g, concrete, [{ m: M(V(0, LOW, z0)) }, { m: M(V(0, LOW, z1)) }]);
}
// труба: туннель-водовод с рёбрами
function pipe(z0, z1, r, ribs) {
  const len = z0 - z1, g = new THREE.CylinderGeometry(r, r, len, 64, 1, true);
  inst(g, concrete, [{ m: M(V(0, LOW + r, (z0 + z1) / 2), [Math.PI / 2, 0, 0]) }]);
  if (ribs) inst(new THREE.TorusGeometry(r - 0.6, 1.3, 8, 64), concrete, Array.from({ length: Math.floor(len / ribs) }, (_, i) => ({ m: M(V(0, LOW + r, z0 - ribs / 2 - i * ribs)) })));
}

function buildWorld(slot) {
  // ===== зал логотипа и терраса (как в одобренной версии) =====
  box(WALL.x0, WALL.x1, 0, WALL.h, -WALL.z, WALL.z);
  box(-320, -300, -10, 420, -300, 140);
  box(-320, 60, 300, 330, -40, 140, 0.8);
  box(-320, 320, -10, 0, -300, 160);
  box(-250, -205, 0, 380, -210, -170); box(190, 230, 0, 240, -130, -95); box(250, 330, 0, 120, -260, -230, 0.9);
  const N = 40, rise = -LOW / N, run = (STAIR.z0 - STAIR.z1) / N;
  for (let i = 0; i < N; i++) box(STAIR.x0, STAIR.x1, LOW - 10, -i * rise, STAIR.z0 - i * run - run, STAIR.z0 - i * run);
  box(STAIR.x0 - 6, STAIR.x0, LOW, 6, STAIR.z1, STAIR.z0); box(STAIR.x1, STAIR.x1 + 6, LOW, 6, STAIR.z1, STAIR.z0);
  box(-320, 320, LOW, -10, -310, -300);

  // ===== путь ленты =====
  const sx = slot.x, z = WALL.z + 0.25, rc = V(sx + REEL.w / 2 - 2, 104, 0), m = 2.6;
  const yt = rc.y + REEL.h / 2 + m, yb = rc.y - REEL.h / 2 - m, xl = rc.x - REEL.w / 2 - m, xr = rc.x + REEL.w / 2 + m;
  REEL.c = rc;
  const wallN = V(0, 0, 1), up = V(0, 1, 0);
  const P = [[V(sx, slot.y - 5, z), wallN], [V(sx, yt, z), wallN], [V(xr, yt, z), wallN], [V(xr, yb, z), wallN], [V(xl, yb, z), wallN], [V(xl, 0.2, z), wallN],
    [V(xl, 0.25, 9), up], [V(90, 0.25, 9), up], [V(90, 0.25, STAIR.z0 - run), up]];
  const zBot = STAIR.z0 - run + 2 * LOW;
  P.push([V(90, LOW + 0.25, zBot), V(0, run, -rise).normalize()]);
  [[90, -700], [-90, -700], [-90, -1060], [90, -1060], [90, -1380], [0, -1380], [0, -1950], [-150, -1950], [-150, -2250], [0, -2250], [0, -3700], [160, -3700], [160, -4150], [0, -4150], [0, ZN.fan + 40]]
    .forEach(([x, zz]) => P.push([V(x, LOW + 0.25, zz), up]));
  PATH = P;
  let s = 0; SEG = [];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i][0], b = P[i + 1][0], l = a.distanceTo(b); SEG.push({ a, b, n: P[i + 1][1], s0: s, s1: s + l }); s += l; }
  S_TOTAL = s;
  const nearPath = (x, zz, r) => SEG.some(g => { if (g.a.y > LOW + 1) return false; const ab = g.b.clone().sub(g.a), t = clamp01(V(x, LOW, zz).sub(g.a).dot(ab) / ab.lengthSq()); return g.a.clone().addScaledVector(ab, t).distanceTo(V(x, LOW + 0.25, zz)) < r; });

  // ===== общий пол всех залов =====
  box(-720, 720, LOW - 20, LOW, ZN.fan - 120, -300);

  // ===== 1. гипостильный зал (реф: G-Cans) — колонны 30×30 м, лампы под потолком, мокрый пол =====
  const HX = 700, HY = LOW + 420;
  box(-HX, HX, HY, HY + 30, ZN.hyp, -300, 0.7);
  box(-HX - 20, -HX, LOW, HY, ZN.hyp, -300); box(HX, HX + 20, LOW, HY, ZN.hyp, -300);
  box(-HX, -320, LOW, HY, -310, -300); box(320, HX, LOW, HY, -310, -300); box(-320, 320, 0, HY, -310, -300, 0.8);
  const lampGlow = [];
  for (let x = -630; x <= 630; x += 140) for (let zz = -400; zz >= -1440; zz -= 140) {
    if (nearPath(x, zz, 50) || CUBES.some(c => Math.hypot(x - c.p.x, zz - c.p.z) < 60) || (x > 30 && x < 160 && zz > -660)) continue;
    box(x - 15, x + 15, LOW, HY, zz - 15, zz + 15, 0.9 + rnd() * 0.15);
    const lx = x + 70, lz = zz - 70; lampGlow.push(V(lx, HY - 4, lz));
    if (((x + 630) / 140 + (zz + 400) / 140) % 2 === 0) LAMPS.push({ p: V(lx, HY - 30, lz), r: 70, c: V(1, 0.9, 0.78).multiplyScalar(1.5) });
  }
  portalWall(ZN.hyp, HX, HY);

  // ===== 2. красная труба (реф 1): водовод Ø72 м, кольца рёбер, красный свет =====
  pipe(ZN.hyp - 12, ZN.asia + ZN.asiaR, 36, 18);
  const redGlow = [];
  for (let zz = ZN.hyp - 40; zz > ZN.asia + ZN.asiaR; zz -= 48) { LAMPS.push({ p: V(0, LOW + 62, zz), r: 34, c: V(1, 0.05, 0.035).multiplyScalar(2.2) }); redGlow.push(V(0, LOW + 70, zz)); }

  // ===== 3. Азия: цилиндр Ø520 м, свет из проёма сверху, кабели, кольца галерей, гигантская сакура =====
  const C = V(0, 0, ZN.asia), R = ZN.asiaR, HA = 1000, g0 = Math.asin(40 / R);
  const cyl = (th0, thL, y0, y1) => inst(new THREE.CylinderGeometry(R, R, y1 - y0, 64, 1, true, th0, thL), concrete, [{ m: M(V(C.x, (y0 + y1) / 2, C.z)) }]);
  cyl(g0, Math.PI - 2 * g0, LOW, LOW + HA); cyl(Math.PI + g0, Math.PI - 2 * g0, LOW, LOW + HA);
  cyl(-g0, 2 * g0, LOW + 76, LOW + HA); cyl(Math.PI - g0, 2 * g0, LOW + 76, LOW + HA);
  inst(new THREE.RingGeometry(140, R + 2, 96), concrete, [{ m: M(V(C.x, LOW + HA, C.z), [Math.PI / 2, 0, 0]) }]);
  [230, 470, 720].forEach(y => { inst(new THREE.RingGeometry(R - 16, R, 96), concrete, [{ m: M(V(C.x, LOW + y, C.z), [-Math.PI / 2, 0, 0]) }]); inst(new THREE.TorusGeometry(R - 16, 0.7, 6, 128), flatMat, [{ m: M(V(C.x, LOW + y + 3.5, C.z), [Math.PI / 2, 0, 0]), c: new THREE.Color(0.06, 0.06, 0.07) }]); });
  SHAFTS.push({ x: C.x, z: C.z, r: 135, k: 1.5, floor: LOW, top: LOW + HA });
  const cables = [];
  for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, d = 150 + rnd() * 100, top = V(C.x + Math.cos(a) * d, LOW + HA, C.z + Math.sin(a) * d), len = 250 + rnd() * 600; cables.push({ m: beam(top, top.clone().add(V(0, -len, 0)), 0.8 + rnd() * 1.6), c: new THREE.Color(0.02, 0.02, 0.025) }); }
  inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), flatMat, cables);
  buildSakura(V(C.x, LOW, C.z));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; LAMPS.push({ p: V(C.x + Math.cos(a) * 200, LOW + 40, C.z + Math.sin(a) * 200), r: 80, c: V(1, 0.55, 0.7).multiplyScalar(0.9) }); }

  // ===== 4. ритейл: бесконечный продуктовый — стеллажи 420 м, товары, люминесцентные полосы =====
  pipe(ZN.asia - R, ZN.ret0, 36, 0);
  const RX = 420, RY = LOW + 520;
  portalWall(ZN.ret0, RX, RY, 36, -1);
  box(-RX, RX, RY, RY + 20, ZN.ret1, ZN.ret0, 0.8); box(-RX - 20, -RX, LOW, RY, ZN.ret1, ZN.ret0); box(RX, RX + 20, LOW, RY, ZN.ret1, ZN.ret0);
  box(-RX, -60, LOW, RY, ZN.ret1 - 12, ZN.ret1); box(60, RX, LOW, RY, ZN.ret1 - 12, ZN.ret1); box(-60, 60, LOW + 140, RY, ZN.ret1 - 12, ZN.ret1);
  buildShelves(RX, RY);
  // переход в зал ИИ — бетонный коридор
  box(-62, -60, LOW, LOW + 140, ZN.ai0, ZN.ret1); box(60, 62, LOW, LOW + 140, ZN.ai0, ZN.ret1); box(-62, 62, LOW + 140, LOW + 144, ZN.ai0, ZN.ret1);

  // ===== 5. ИИ: зал 1,4 км, сфера Ø460 м в стальном каркасе =====
  const AX = 700, AY = LOW + 1100;
  box(-AX, AX, AY, AY + 30, ZN.ai1, ZN.ai0, 0.7); box(-AX - 20, -AX, LOW, AY, ZN.ai1, ZN.ai0); box(AX, AX + 20, LOW, AY, ZN.ai1, ZN.ai0);
  box(-AX, -60, LOW, AY, ZN.ai0 - 12, ZN.ai0); box(60, AX, LOW, AY, ZN.ai0 - 12, ZN.ai0); box(-60, 60, LOW + 140, AY, ZN.ai0 - 12, ZN.ai0);
  box(-AX, -80, LOW, AY, ZN.ai1 - 12, ZN.ai1); box(80, AX, LOW, AY, ZN.ai1 - 12, ZN.ai1); box(-80, 80, LOW + 200, AY, ZN.ai1 - 12, ZN.ai1);
  buildSphere(V(0, LOW + 430, -3930), 230);
  SHAFTS.push({ x: 0, z: -3930, r: 170, k: 0.9, floor: LOW, top: AY });
  [[-560, -3600], [560, -3600], [-560, -4250], [560, -4250]].forEach(([x, zz]) => LAMPS.push({ p: V(x, LOW + 120, zz), r: 160, c: V(0.55, 0.75, 1).multiplyScalar(1.3) }));

  // ===== 6. колодец лестниц (рефы 11, 17): пролёты зигзагом по стенам до самого верха, мосты =====
  const SX = 320, SY = LOW + 1000;
  box(-SX, SX, SY, SY + 20, ZN.st1, ZN.ai1 - 12, 0.7); box(-SX - 20, -SX, LOW, SY, ZN.st1, ZN.ai1 - 12); box(SX, SX + 20, LOW, SY, ZN.st1, ZN.ai1 - 12);
  box(-SX, -72, LOW, SY, ZN.st1 - 12, ZN.st1); box(72, SX, LOW, SY, ZN.st1 - 12, ZN.st1); box(-72, 72, LOW + 144, SY, ZN.st1 - 12, ZN.st1);
  const zA = ZN.ai1 - 60, zB = ZN.st1 + 50, fl = zB - zA, ang = Math.atan2(90, -fl);
  for (let k = 0; k < 10; k++) [-1, 1].forEach(sd => {
    const y = LOW + k * 90, dirk = (k + (sd > 0 ? 1 : 0)) % 2 ? 1 : -1, x = sd * (SX - 16);
    boxR(V(x, y + 45, (zA + zB) / 2), V(26, 3, Math.hypot(fl, 90)), [dirk * ang, 0, 0], 0.9);
    box(x - 13, x + 13, y + 87, y + 90, dirk > 0 ? zA - 30 : zB, dirk > 0 ? zA : zB + 30, 0.9);   // площадка
    box(sd > 0 ? x - 13 : x + 12, sd > 0 ? x - 12 : x + 13, y + 3, y + 93, zB, zA, 0.6);       // перила-экран
  });
  [LOW + 380, LOW + 650].forEach((y, i) => box(-SX, SX, y, y + 6, -4640 - i * 260, -4630 - i * 260, 0.85));
  SHAFTS.push({ x: 0, z: -4800, r: 120, k: 0.8, floor: LOW, top: SY });
  const stG = [];
  for (let k = 0; k < 10; k++) [-1, 1].forEach(sd => { const pz = (k + (sd > 0 ? 1 : 0)) % 2 ? zA - 20 : zB + 20, pp = V(sd * (SX - 30), LOW + k * 90 + 70, pz); LAMPS.push({ p: pp, r: 90, c: V(1, 0.88, 0.7).multiplyScalar(1.4) }); stG.push(pp); });
  FX.stairGlow = stG;

  // ===== 7. вентиляционная шахта: 1,26 км квадратного сечения, рёбра-рамы, в конце — вентилятор-Искра =====
  const VX = 70, VY = LOW + 140;
  box(-VX - 12, -VX, LOW, VY, ZN.fan - 60, ZN.st1); box(VX, VX + 12, LOW, VY, ZN.fan - 60, ZN.st1); box(-VX - 12, VX + 12, VY, VY + 12, ZN.fan - 60, ZN.st1);
  box(-VX, VX, LOW, VY, ZN.fan - 72, ZN.fan - 60);
  for (let zz = ZN.st1 - 30; zz > ZN.fan + 30; zz -= 26) { box(-VX, -VX + 5, LOW, VY, zz - 2, zz + 2, 0.85); box(VX - 5, VX, LOW, VY, zz - 2, zz + 2, 0.85); box(-VX, VX, VY - 5, VY, zz - 2, zz + 2, 0.85); }
  LAMPS.push({ p: V(0, LOW + 70, ZN.fan - 20), r: 300, c: V(1, 0.6, 0.32).multiplyScalar(2.4) });

  SHAFTS.forEach((sh, i) => { U.uS.value[i].set(sh.x, sh.z, sh.r, sh.k); U.uSY.value[i].set(sh.floor, sh.top); });
  const im = flushBoxes();
  FX.lampGlow = lampGlow; FX.redGlow = redGlow;
  return im;
}

// сакура: рекурсивные ветви и облака цветов — Ø300 м кроны
function buildSakura(base) {
  const bark = [], bloom = [], r = mulberry(88);
  const pink = () => new THREE.Color().setRGB(0.7 + r() * 0.25, 0.16 + r() * 0.2, 0.26 + r() * 0.2);
  const grow = (a, dir, len, th, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    bark.push({ m: beam(a, b, th), c: new THREE.Color(0.05, 0.035, 0.032) });
    if (depth === 0) { for (let i = 0; i < 26; i++) { const s = 2.4 + r() * 4.8, o = V(r() - 0.5, r() - 0.35, r() - 0.5).normalize().multiplyScalar(Math.cbrt(r()) * 30); bloom.push({ m: M(b.clone().add(o), [r() * 3, r() * 3, 0], V(s, s * 0.8, s)), c: pink() }); } return; }
    const n = depth > 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = dir.clone().applyAxisAngle(V(1, 0, 0).applyAxisAngle(V(0, 1, 0), (i / n) * Math.PI * 2 + r() * 1.5), 0.55 + r() * 0.45);
      d.y = Math.max(d.y, 0.08); d.normalize();
      grow(b, d, len * (0.68 + r() * 0.12), th * 0.62, depth - 1);
    }
  };
  grow(base, V(0.08, 1, 0).normalize(), 110, 34, 6);
  inst(new THREE.CylinderGeometry(0.42, 0.5, 1, 8), flatMat, bark);
  inst(new THREE.IcosahedronGeometry(1, 0), litMat({ flat: true, glow: 0.12 }), bloom);
  // лепестки падают сквозь луч
  const n = 3500, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 230; pos.set([base.x + Math.cos(a) * d, r() * 600, base.z + Math.sin(a) * d], i * 3); ph[i] = r() * 6.28; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  FX.petals = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uT; attribute float aPh; varying float vA; void main(){ vec3 p = position; p.y = ${LOW}.0 + mod(p.y - uT * (5.0 + 3.0 * sin(aPh)), 600.0); p.x += sin(uT * 0.6 + aPh) * 6.0; p.z += cos(uT * 0.5 + aPh * 1.3) * 6.0; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = clamp(260.0 / -mv.z, 1.0, 4.0); vA = 1.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform float uO; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vec3(0.9, 0.3, 0.45) * 0.7, uO); }',
  }));
  FX.petals.frustumCulled = false; scene.add(FX.petals);
}

// стеллажи: стойки, полки, товары (простые коробки и банки — силуэты, а не бренды)
function buildShelves(RX, RY) {
  const r = mulberry(31), goods = [], cans = [];
  const pal = [[0.72, 0.7, 0.66], [0.62, 0.06, 0.05], [0.72, 0.52, 0.07], [0.08, 0.17, 0.5], [0.1, 0.36, 0.13], [0.75, 0.28, 0.05], [0.35, 0.22, 0.13], [0.55, 0.56, 0.58], [0.85, 0.82, 0.74]];
  const segs = [[ZN.ret0 - 60, -2720], [-2760, -2980], [-3020, ZN.ret1 + 60]];
  [-70, 70, -210, 210, -350, 350].forEach(cx => segs.forEach(([za, zb]) => {
    box(cx - 0.5, cx + 0.5, LOW, LOW + 424, zb, za, 0.75);                                       // задняя стенка
    for (let zz = za; zz >= zb - 1; zz -= 60) box(cx - 13, cx + 13, LOW, LOW + 424, zz - 1.5, zz + 1.5, 0.8);   // стойки
    for (let k = 0; k <= 6; k++) box(cx - 13, cx + 13, LOW + 3 + k * 70, LOW + 5 + k * 70, zb, za, 0.85);      // полки
    for (let k = 0; k < 6; k++) [-1, 1].forEach(face => {
      let zz = za - 2, col = pal[Math.floor(r() * pal.length)];
      while (zz > zb + 4) {
        if (r() < 0.18) col = pal[Math.floor(r() * pal.length)];
        const w = 4 + r() * 9, h = 12 + r() * 44, d = 9 + r() * 3, y0 = LOW + 5 + k * 70, x = cx + face * (13 - d / 2 - 0.5), c = new THREE.Color(...col).lerp(new THREE.Color(0.42, 0.42, 0.4), 0.45).multiplyScalar(0.75 + r() * 0.3);
        if (r() < 0.22) cans.push({ m: M(V(x, y0 + h * 0.35, zz - w / 2), [0, 0, 0], V(w * 0.45, h * 0.7, w * 0.45)), c });
        else goods.push({ m: M(V(x, y0 + h / 2, zz - w / 2), [0, 0, 0], V(d, h, w)), c });
        zz -= w + 0.6;
      }
    });
  }));
  inst(new THREE.BoxGeometry(1, 1, 1), flatMat, goods);
  inst(new THREE.CylinderGeometry(1, 1, 1, 12), flatMat, cans);
  // люминесцентные полосы над проходами — главный свет «лиминального» магазина
  const strips = [];
  [0, -140, 140, -280, 280].forEach(x => { for (let zz = ZN.ret0 - 40; zz > ZN.ret1 + 30; zz -= 46) strips.push({ m: M(V(x, RY - 6, zz - 15), [0, 0, 0], V(2.4, 1.2, 30)) }); });
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 1, 0.92).multiplyScalar(2.2), toneMapped: false }), strips);
  for (let zz = ZN.ret0 - 80; zz > ZN.ret1; zz -= 120) [0, -280, 280].forEach(x => LAMPS.push({ p: V(x, RY - 40, zz), r: 150, c: V(0.85, 1, 0.9).multiplyScalar(1.1) }));
}

// ИИ: сфера, каркас-икосаэдр из стальных балок, большие кольца, опоры
function buildSphere(c, rad) {
  const ico = new THREE.IcosahedronGeometry(rad + 70, 1), pos = ico.attributes.position, edges = new Map(), steel = [];
  const key = v => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
  for (let i = 0; i < pos.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = V().fromBufferAttribute(pos, i + j), b = V().fromBufferAttribute(pos, i + (j + 1) % 3), k = [key(a), key(b)].sort().join('|');
    if (!edges.has(k)) edges.set(k, [a.add(c), b.add(c)]);
  }
  edges.forEach(([a, b]) => { steel.push({ m: beam(a, b, 3.2), c: new THREE.Color(0.16, 0.17, 0.19) }); steel.push({ m: beam(a.clone().multiplyScalar(1).sub(c).multiplyScalar(0.94).add(c), b.clone().sub(c).multiplyScalar(0.94).add(c), 1.6), c: new THREE.Color(0.12, 0.13, 0.15) }); });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, foot = V(c.x + Math.cos(a) * 420, LOW, c.z + Math.sin(a) * 420), top = c.clone().add(V(Math.cos(a) * 190, -150, Math.sin(a) * 190)); steel.push({ m: beam(foot, top, 9), c: new THREE.Color(0.14, 0.15, 0.17) }); }
  inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), flatMat, steel);
  inst(new THREE.TorusGeometry(rad + 95, 4, 8, 128), flatMat, [[Math.PI / 2, 0, 0], [0.3, 0, 0.9], [-0.4, 0.7, 0]].map(rr => ({ m: M(c, rr), c: new THREE.Color(0.15, 0.16, 0.18) })));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(rad, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uHaze: U.uHaze, uHazeK: U.uHazeK },
    vertexShader: 'varying vec3 vW; varying vec3 vN; varying vec3 vO; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vO = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; ${HAZE} varying vec3 vW; varying vec3 vN; varying vec3 vO;
      void main(){
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float lat = asin(clamp(normalize(vO).y, -1.0, 1.0)) * 18.0, lon = atan(vO.z, vO.x) * 24.0;
        float grid = smoothstep(0.93, 1.0, abs(sin(lat))) * 0.5 + smoothstep(0.985, 1.0, abs(sin(lon))) * 0.25;
        float scan = smoothstep(0.0, 0.08, fract(normalize(vO).y * 0.5 + 0.5 - uT * 0.05)) * (1.0 - smoothstep(0.08, 0.2, fract(normalize(vO).y * 0.5 + 0.5 - uT * 0.05)));
        vec3 c = vec3(0.012, 0.014, 0.02) * (0.6 + 0.4 * n.y) + vec3(0.55, 0.72, 1.0) * (fr * 0.9 + grid * 0.35 + scan * 0.6);
        gl_FragColor = vec4(haze(c, vW), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sphere.position.copy(c); scene.add(sphere); FX.sphere = sphere;
}

// ---------- свет, который видно: лучи, проёмы, светильники, кубы, вентилятор ----------
const beamMat = (col = 0xc4d0ff) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(col) } },
  vertexShader: 'varying float vY; varying float vF; void main(){ vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.); vec3 n = normalize(mat3(modelMatrix) * normal); vF = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: 'uniform float uK; uniform vec3 uC; varying float vY; varying float vF; void main(){ float a = uK * pow(vF, 2.2) * mix(.35, 1., vY); gl_FragColor = vec4(uC, a); }',
});
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const softDot = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const basic = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
const glowPoints = (pts, col, size) => { const g = new THREE.BufferGeometry().setFromPoints(pts); const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot, color: col, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); p.frustumCulled = false; scene.add(p); FX.glows.push(p); return p; };
function buildLight() {
  SHAFTS.forEach(sh => {
    const len = sh.top - sh.floor, b = new THREE.Mesh(new THREE.CylinderGeometry(sh.r * 0.85, sh.r * 1.05, len, 32, 1, true), beamMat());
    b.position.set(sh.x, sh.floor + len / 2, sh.z); scene.add(b); FX.beams.push({ b, k: sh.k * 0.6 });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(sh.r * 0.95, 48), basic(0xdfe6ff, 2.2)); hole.rotation.x = Math.PI / 2; hole.position.set(sh.x, sh.top - 1, sh.z); scene.add(hole); FX.glows.push(hole);
  });
  // светильники гипостильного зала и красной трубы
  glowPoints(FX.lampGlow, new THREE.Color(1, 0.9, 0.75).multiplyScalar(2.5), 26);
  glowPoints(FX.redGlow, new THREE.Color(1, 0.08, 0.05).multiplyScalar(3), 30);
  glowPoints(FX.stairGlow, new THREE.Color(1, 0.88, 0.7).multiplyScalar(2.5), 22);
  // кубы-заглушки кейсов
  CUBES.forEach(c => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), basic(CREAM, 1.5)); m.position.set(c.p.x, c.p.y + c.s / 2, c.p.z); scene.add(m);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(c.s * 1.6, c.s * 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#E1D9CF'; g.font = '520 64px TT, sans-serif'; g.textAlign = 'center'; g.fillText(c.t, w / 2, 84); }), transparent: true, depthWrite: false, toneMapped: false }));
    lab.position.copy(m.position).add(V(0, c.s * 0.8, 0)); scene.add(lab); FX.cubes.push({ m, c, lab });
    LAMPS.push({ p: m.position.clone(), r: c.s * 1.6, c: CREAM_V.clone().multiplyScalar(0.9) });
  });
  // крошечные люди
  const people = [V(30, 0, -290), V(36, 0, -292), V(-150, 0, -40), V(80, LOW, -660), V(-60, LOW, -1300), V(-40, LOW, -1700), V(-200, LOW, -2160), V(10, LOW, -3000), V(-40, LOW, -3800), V(30, LOW, -4400), V(-6, LOW, -6300)];
  const pg = new THREE.CapsuleGeometry(0.32, 1.1, 3, 8); pg.translate(0, 0.87, 0);
  inst(pg, new THREE.MeshBasicMaterial({ color: 0x050505 }), people.map(p => ({ m: M(p) })));
  buildFan();
}

// финал: вентилятор в форме Искры, контровой свет за ним, поток пыли
function buildFan() {
  const z = ZN.fan, cy = LOW + 70;
  inst(new THREE.TorusGeometry(68, 6, 12, 96), flatMat, [{ m: M(V(0, cy, z)), c: new THREE.Color(0.06, 0.06, 0.065) }]);
  inst(new THREE.CylinderGeometry(9, 9, 10, 32), flatMat, [{ m: M(V(0, cy, z - 2), [Math.PI / 2, 0, 0]), c: new THREE.Color(0.05, 0.05, 0.055) }]);
  inst(new THREE.BoxGeometry(1, 1, 1), flatMat, [[0, 0], [Math.PI / 2, 0]].map(([r]) => ({ m: M(V(0, cy, z - 8), [0, 0, r], V(136, 2.5, 2.5)), c: new THREE.Color(0.05, 0.05, 0.055) })));
  const g = iskra.geometry.clone(); g.computeBoundingBox(); const bb = g.boundingBox, k = 128 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  const bi = new THREE.InstancedMesh(g, litMat({ flat: true }), 1); bi.setMatrixAt(0, M(V(0, cy, z), [0, 0, 0], V(k, k, k * 0.35))); bi.setColorAt(0, new THREE.Color(0.035, 0.03, 0.03)); bi.frustumCulled = false; scene.add(bi);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(66, 64), basic(0xffb070, 2.2)); disc.position.set(0, cy, z - 40); scene.add(disc); FX.glows.push(disc);
  const rays = new THREE.Mesh(new THREE.CylinderGeometry(64, 70, 700, 48, 1, true), beamMat(0xffa860)); rays.rotation.x = -Math.PI / 2; rays.position.set(0, cy, z + 350); scene.add(rays); FX.beams.push({ b: rays, k: 0.5 });
  const n = 2500, pos = new Float32Array(n * 3), r = mulberry(5);
  for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 130, LOW + 4 + r() * 130, z + r() * 1200], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  FX.vdust = new THREE.Points(dg, new THREE.PointsMaterial({ map: softDot, size: 1.4, color: new THREE.Color(1, 0.75, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  FX.vdust.frustumCulled = false; scene.add(FX.vdust);
  FX.fan = { bi, k, cy, z, rot: 0, speed: 0 };
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
const P_LINE = 0.19, P_END = 0.962;
let CAMK = [], ISK = [], SMAP = [];
function buildTimeline() {
  const s = slot, L0 = LOGO, rc = REEL.c, sl = iskra.userData.S;
  const sAt = pt => { let best = 0, bd = 1e9; for (let x = 0; x <= S_TOTAL; x += 1) { const d = headAt(x).distanceTo(pt); if (d < bd) { bd = d; best = x; } } return best; };
  const sv = PATH.map(p => sAt(p[0]));
  const at = (x, z) => sAt(V(x, LOW + 0.25, z));
  // p ↔ длина ленты: стена неторопливо, дальше — по локациям, на каждой своё время
  SMAP = [[P_LINE, 0], [0.25, sv[1]], [0.36, sv[4]], [0.42, sv[6]], [0.53, sv[7]], [0.58, sv[8]], [0.62, sv[9]],
    [0.675, at(0, -1380)], [0.705, at(0, -1840)], [0.775, at(0, -2440)], [0.825, at(0, -3420)], [0.885, at(0, -4440)], [0.91, at(0, -5160)], [P_END, S_TOTAL]];
  const pOf = x => { for (let i = 0; i < SMAP.length - 1; i++) if (x <= SMAP[i + 1][1]) return SMAP[i][0] + (SMAP[i + 1][0] - SMAP[i][0]) * (x - SMAP[i][1]) / (SMAP[i + 1][1] - SMAP[i][1] || 1); return P_END; };
  const narrow = innerWidth < 760, Y = y => LOW + y;
  const K = (x, z, pos, look) => ({ p: pOf(at(x, z)), pos, look });
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
    { p: pOf(sv[7] - 30), pos: V(62, 12, 50), look: V(62, 9.5, 0) },
    { p: pOf(sv[7]), pos: V(88, 13, 48), look: V(90, 10, -120) },
    { p: pOf(sv[7] + 160), pos: V(96, 26, -60), look: V(90, -30, -800) },
    { p: pOf(sv[8]), pos: V(104, 34, -236), look: V(90, -120, -900) },
    { p: pOf((sv[8] + sv[9]) / 2), pos: V(112, -50, -430), look: V(80, -150, -1000) },
    { p: pOf(sv[9]), pos: V(110, -116, -575), look: V(70, -140, -1000) },
    // 1. гипостиль: камера ведёт за лентой и смотрит то влево, то вправо — в лес колонн и ламп
    K(90, -700, V(150, Y(42), -600), V(-160, Y(150), -1100)),
    K(-90, -880, V(-20, Y(32), -770), V(-320, Y(230), -1080)),
    K(90, -1220, V(30, Y(36), -1100), V(340, Y(170), -1420)),
    // 2. симметричный кадр в красную трубу (реф 1), затем внутрь
    K(0, -1380, V(0, Y(34), -1250), V(0, Y(34), -1700)),
    K(0, -1700, V(0, Y(30), -1580), V(0, Y(38), -1950)),
    // 3. Азия: выход из трубы под сакуру — снизу вверх, потом обход вокруг ствола
    K(0, -1950, V(18, Y(16), -1872), V(0, Y(250), -2100)),
    K(-150, -2100, V(-175, Y(28), -1975), V(80, Y(210), -2160)),
    K(0, -2250, V(-110, Y(40), -2262), V(150, Y(320), -2060)),
    // 4. ритейл: проход по центральному ряду, взгляд то в одни стеллажи, то в другие
    K(0, -2460, V(0, Y(40), -2390), V(0, Y(70), -2760)),
    K(0, -2880, V(0, Y(58), -2770), V(-330, Y(260), -3000)),
    K(0, -3250, V(0, Y(42), -3140), V(280, Y(230), -3360)),
    // 5. ИИ: сфера впереди и над головой
    K(0, -3500, V(0, Y(30), -3400), V(0, Y(460), -3930)),
    K(160, -3930, V(110, Y(24), -3760), V(-80, Y(520), -3960)),
    K(0, -4150, V(110, Y(44), -4110), V(-240, Y(330), -4460)),
    // 6. колодец лестниц: взгляд вверх, потом налево по пролётам
    K(0, -4600, V(0, Y(40), -4500), V(0, Y(760), -4820)),
    K(0, -4950, V(0, Y(36), -4830), V(-290, Y(420), -5000)),
    // 7. вентшахта: строгая центральная перспектива на вентилятор
    K(0, -5160, V(0, Y(48), -5060), V(0, Y(62), -5400)),
    K(0, -5800, V(0, Y(62), -5690), V(0, Y(70), -6420)),
    { p: P_END, pos: V(0, Y(68), -6200), look: V(0, Y(70), -6420) },
    { p: 1, pos: V(0, Y(68), -6235), look: V(0, Y(72), -6420) },
  ];
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
const zoneAt = z => { let i = 0; while (i < ZONES.length - 2 && z < ZONES[i + 1].z) i++; const a = ZONES[i], b = ZONES[i + 1], t = smooth(clamp01((a.z - z) / (a.z - b.z))); const mix = (u, v) => u.map((x, k) => x + (v[k] - x) * t); return { haze: mix(a.haze, b.haze), k: a.k + (b.k - a.k) * t, amb: mix(a.amb, b.amb) }; };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? clamp01(scrollY / max) : 0;
  pSm += (p - pSm) * (1 - Math.exp(-dt * 2.6));
  U.uT.value = time;
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
  logo.key.position.copy(iskra.position).add(V(0, 0, -3)); logo.key.intensity = 260 * (1 - landed) * flick;
  logo.mat.emissiveIntensity = 1.3 * landed; logo.mat.color.set(0x241514).lerp(RED_C, landed); logo.fill.intensity = 120 * landed;
  iskra.material.emissiveIntensity = 1.0 * (1 - landed) + 1.3 * landed;
  // лента
  const s = sOfP(pSm); neon.material.uniforms.uDraw.value = pSm < P_LINE ? -1 : s; neon.material.uniforms.uT.value = time;
  headAt(s, head);
  // свет для бетона: Искра, лого, голова ленты и хвост, 8 ближайших ламп локаций
  const P = U.uP.value, C = U.uC.value, Lh = clamp01((pSm - 0.17) / 0.06); U.uL.value = Lh;
  P[0].set(iskra.position.x, iskra.position.y, iskra.position.z + 4, 26); C[0].set(1, 0.55, 0.42).multiplyScalar(3.2 * (1 - landed) * flick);
  P[1].set(LOGO.x, LOGO.y - 6, LOGO.z + 12, 40); C[1].set(1, 0.08, 0.06).multiplyScalar(1.6 * landed);
  const lineOn = pSm >= P_LINE ? 1 : 0;
  P[2].set(head.x, head.y + 1.5, head.z + 1.5, 10); C[2].copy(RED_V).multiplyScalar(1.7 * lineOn);
  headAt(s - 30, tmp); P[3].set(tmp.x, tmp.y + 1.5, tmp.z + 1.5, 22); C[3].copy(RED_V).multiplyScalar(0.5 * lineOn * clamp01(s / 30));
  const cp = camera.position, near = LAMPS.map(l => [l, l.p.distanceToSquared(cp)]).sort((x, y) => x[1] - y[1]);
  for (let n = 0; n < 8; n++) { const l = near[n][0]; P[4 + n].set(l.p.x, l.p.y, l.p.z, l.r); C[4 + n].copy(l.c).multiplyScalar(Lh); }
  // воздух локации
  const zn = zoneAt(cp.z); U.uHaze.value.fromArray(zn.haze); U.uHazeK.value = zn.k * Lh; U.uAmb.value.fromArray(zn.amb);
  FX.beams.forEach(o => { o.b.material.uniforms.uK.value = 0.03 * o.k * Lh; });
  FX.glows.forEach(g => { g.visible = Lh > 0.01; });
  FX.cubes.forEach(c => { c.m.visible = c.lab.visible = Lh > 0.01; });
  FX.petals.material.uniforms.uO.value = 0.85 * clamp01((-cp.z - 1700) / 150) * clamp01((2600 + cp.z) / 150);
  // вентилятор: на подходе к шахте раскручивается, гонит пыль на зрителя
  const F = FX.fan, spin = smooth(clamp01((pSm - 0.93) / 0.05));
  F.speed += (spin * 7 - F.speed) * Math.min(1, dt * 1.5); F.rot += F.speed * dt;
  F.bi.setMatrixAt(0, M(V(0, F.cy, F.z), [0, 0, F.rot], V(F.k, F.k, F.k * 0.35))); F.bi.instanceMatrix.needsUpdate = true;
  const dp = FX.vdust.geometry.attributes.position;
  for (let n = 0; n < dp.count; n++) { let zz = dp.getZ(n) + dt * (6 + F.speed * 55); if (zz > F.z + 1200) zz = F.z + 10; dp.setZ(n, zz); }
  dp.needsUpdate = true; FX.vdust.material.opacity = 0.25 + 0.5 * spin;
  // ролик
  if (!promo.on && pSm > 0.2) { promo.on = true; promo.v.play().then(() => promo.m.material.color.set(0xffffff)).catch(() => addEventListener('pointerdown', () => promo.v.play().then(() => promo.m.material.color.set(0xffffff)), { once: true })); }
  ovs.forEach(o => o.el.classList.toggle('on', pSm >= o.a && pSm <= o.b));
  pctEl.textContent = `${String(Math.round(pSm * 100)).padStart(3, '0')}% · 20_26`;
  composer.render();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// мокрый пол: настоящее отражение (Reflector, половинное разрешение) там, где на бетоне лужи
function buildWetFloor() {
  const shader = {
    uniforms: { color: { value: new THREE.Color(1, 1, 1) }, tDiffuse: { value: null }, textureMatrix: { value: null }, tStain: U.tStain, uHaze: U.uHaze, uHazeK: U.uHazeK },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D tDiffuse, tStain; uniform vec3 color; ${HAZE} varying vec4 vUv; varying vec3 vW;
      void main(){
        float pud = texture2D(tStain, vW.xz / 300.0).g, wet = 0.16 + 0.8 * smoothstep(0.35, 0.7, pud);
        vec2 uv = vUv.xy / vUv.w; vec2 o = vec2(0.0025, 0.0);
        vec3 r = (texture2D(tDiffuse, uv).rgb * 2.0 + texture2D(tDiffuse, uv + o).rgb + texture2D(tDiffuse, uv - o).rgb + texture2D(tDiffuse, uv + o.yx * 1.6).rgb + texture2D(tDiffuse, uv - o.yx * 1.6).rgb) / 6.0;
        float f = 1.0 - exp(-length(vW - cameraPosition) * uHazeK);
        gl_FragColor = vec4(r * wet * 0.8 * (1.0 - f), 1.0);
      }`,
  };
  const w = new Reflector(new THREE.PlaneGeometry(1440, -(ZN.fan - 120) - 300), { shader, textureWidth: innerWidth * 0.5, textureHeight: innerHeight * 0.5, clipBias: 0.003 });
  w.rotation.x = -Math.PI / 2; w.position.set(0, LOW + 0.05, (ZN.fan - 120 - 300) / 2);
  w.material.transparent = true; w.material.blending = THREE.AdditiveBlending; w.material.depthWrite = false;
  scene.add(w);
}

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
await document.fonts.load('520 64px TT').catch(() => {});
await buildLogo();
buildWorld(slot); buildLight(); buildNeon(); buildReel(); buildWetFloor(); buildTimeline();
renderer.compile(scene, camera);
window.__mega = { cam: camera, composer, bloom, go: p => { scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)); pSm = p; }, renderer, scene };
const AT = new URLSearchParams(location.search).get('p'); if (AT) window.__mega.go(+AT);
frame();
await new Promise(res => { const t0 = performance.now(); let calm = 0; const tick = () => { calm = LOAD.total === LOAD.loaded ? calm + 1 : 0; if (calm > 3 || performance.now() - t0 > 30000) return res(); setTimeout(tick, 150); }; tick(); });
document.getElementById('loader').classList.add('done'); document.documentElement.classList.remove('lock');
