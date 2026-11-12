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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CASES } from './cases.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010101);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 9000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.4, 0.9);
// лучи: радиальное размытие ярких пикселей от экранной позиции контрового источника (god rays)
const rays = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uK: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uK; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uK <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (vUv - uLight) * 0.0085, uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 64; i++) { uv -= d; vec3 s = texture2D(tDiffuse, uv).rgb; float l = max(max(s.r, s.g), s.b); acc += s * smoothstep(2.0, 4.0, l) * w; w *= 0.945; }
      gl_FragColor = vec4(base.rgb + acc * uK * 0.008, base.a);
    }`,
});
composer.addPass(rays);
composer.addPass(bloom); composer.addPass(new OutputPass());
// плёнка: зерно и виньетка, как на раскадровке
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c *= mix(0.35, 1.0, v);
      c += (h(vUv * 1600.0 + fract(uT) * 91.0) - 0.5) * 0.06;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
// финал: вентилятор гонит воздух — радиальный поток, марево, расслоение цвета и красная ударная волна из Искры
const finale = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uK: { value: 0 }, uT: { value: 0 }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uW: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uK, uT, uW; uniform vec2 uC; varying vec2 vUv;
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5), c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    void main(){
      if (uK <= 0.001) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 d = vUv - uC; float r = length(d * vec2(1.6, 1.0));
      float ang = atan(d.y, d.x);
      vec2 heat = vec2(n2(vec2(ang * 3.0, r * 18.0 - uT * 6.0)), n2(vec2(ang * 3.0 + 9.0, r * 18.0 - uT * 6.0))) - 0.5;
      vec2 uv = vUv + heat * 0.012 * uK * smoothstep(0.05, 0.6, r);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 10; i++) { float t = float(i) / 9.0; vec2 u = uv - d * t * 0.09 * uK;
        acc.r += texture2D(tDiffuse, u + d * 0.012 * uK).r; acc.g += texture2D(tDiffuse, u).g; acc.b += texture2D(tDiffuse, u - d * 0.012 * uK).b; }
      vec3 c = acc / 10.0;
      float streak = pow(n2(vec2(ang * 40.0, uT * 0.5)), 6.0) * smoothstep(0.1, 0.9, r) * uK;           // струи воздуха
      c += vec3(1.0, 0.55, 0.3) * streak * 0.35;
      float wave = smoothstep(0.06, 0.0, abs(r - uW)) * (1.0 - uW) * step(0.001, uW);                    // ударная волна
      c += vec3(1.0, 0.05, 0.04) * wave * 1.4;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finale);
composer.addPass(grain);

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
  uHaze: { value: new THREE.Vector3(0, 0, 0) }, uHazeK: { value: 0 }, uT: { value: 0 }, uBake: { value: 1 },
  // три ближайших проектора: позиция и сила, центр картинки и ширина, нормаль стены и высота, масштаб «cover», сама картинка
  uJp: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uJc: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, -1, 1)) },
  uJn: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 1, 1)) }, uJs: { value: [0, 1, 2].map(() => new THREE.Vector2(1, 1)) },
  tJ0: { value: null }, tJ1: { value: null }, tJ2: { value: null },
};
{ const blk = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blk.needsUpdate = true; U.tJ0.value = U.tJ1.value = U.tJ2.value = blk; }
// проекция: луч от проектора через точку поверхности попадает в плоскость картинки — так картинка ложится без трапеции
// и на стену, и на изогнутый бетон, и на всё, что стоит в луче; за плоскостью стены и позади проектора света нет
const PROJ = /* glsl */`uniform vec4 uJp[3]; uniform vec4 uJc[3]; uniform vec4 uJn[3]; uniform vec2 uJs[3]; uniform sampler2D tJ0, tJ1, tJ2;
  vec3 projOne(sampler2D tI, vec4 P, vec4 C, vec4 Nn, vec2 sc, vec3 N, vec3 w) {
    if (P.w <= 0.0) return vec3(0.0);
    vec3 n = Nn.xyz, d = w - P.xyz; float dn = dot(d, n); if (dn >= -1e-3) return vec3(0.0);
    float t = dot(C.xyz - P.xyz, n) / dn; if (t < 0.985) return vec3(0.0);
    vec3 h = P.xyz + d * t - C.xyz, T = normalize(cross(-n, vec3(0.0, 1.0, 0.0))), B = cross(T, -n);
    vec2 uv = vec2(dot(h, T) / C.w, dot(h, B) / Nn.w) + 0.5;
    vec2 e = smoothstep(0.0, 0.004, uv) * smoothstep(0.0, 0.004, 1.0 - uv); float m = e.x * e.y; if (m <= 0.0) return vec3(0.0);
    vec3 img = texture2D(tI, (uv - 0.5) * sc + 0.5).rgb + 0.035;   // у проектора нет чистого чёрного — рамка кадра видна и на тёмном ролике
    float lam = max(dot(N, -normalize(d)), 0.0), vig = 1.0 - 0.45 * dot(uv - 0.5, uv - 0.5) * 2.0, scan = 0.94 + 0.06 * sin(uv.y * Nn.w * 1.3);
    return img * m * P.w * (0.2 + 0.8 * lam) * vig * scan;
  }
  vec3 projAll(vec3 N, vec3 w) { return projOne(tJ0, uJp[0], uJc[0], uJn[0], uJs[0], N, w) + projOne(tJ1, uJp[1], uJc[1], uJn[1], uJs[1], N, w) + projOne(tJ2, uJp[2], uJc[2], uJn[2], uJs[2], N, w); }`;
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
  }
  vec3 lightDyn(vec3 N, vec3 w) {   // только живые источники: Искра, лого, голова ленты и хвост
    vec3 L = vec3(0.0);
    for (int i = 0; i < 4; i++) { vec3 dl = uP[i].xyz - w; float d2 = dot(dl, dl), r2 = uP[i].w * uP[i].w; L += uC[i] * max(dot(N, dl * inversesqrt(d2 + 1e-4)), 0.0) * r2 / (r2 + d2); }
    return L;
  }`;
// один шейдер на всё: бетон (текстура + сырость) или FLAT — цвет из инстанса (товары, сакура, сталь, кабели)
function litMat({ flat = false, glow = 0, side = THREE.DoubleSide, baked = null, ck = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: baked ? Object.assign({}, U, { tLM: { value: baked }, uCK: { value: ck } }) : U, side, defines: Object.assign({}, flat ? { FLAT: 1 } : {}, glow ? { GLOW: glow.toFixed(3) } : {}, baked ? { BAKED: 1 } : {}),
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      #ifdef BAKED
        attribute vec2 aLM; attribute vec4 aCol; varying vec2 vLM; varying float vA;
      #endif
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
        #ifdef BAKED
          vC = aCol.rgb; vA = aCol.a; vLM = aLM;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tAlb, tNrm, tStain; uniform float uBake;
      // без повтора: текстура берётся с двумя сдвигами, выбор плавно меняется по поверхности (приём И. Кильеса)
      vec4 noTile(sampler2D t, vec2 uv, out float sel) {
        float l = texture2D(tStain, uv * 0.031).g * 9.0, f = fract(l), ia = floor(l), ib = ia + 1.0;
        vec2 oa = sin(vec2(3.0, 7.0) * ia), ob = sin(vec2(3.0, 7.0) * ib), dx = dFdx(uv), dy = dFdy(uv);
        vec4 a = textureGrad(t, uv + oa, dx, dy), b = textureGrad(t, uv + ob, dx, dy);
        sel = smoothstep(0.2, 0.8, f - 0.1 * dot(a.rgb - b.rgb, vec3(1.0)));
        return mix(a, b, sel);
      }
      vec4 noTileN(sampler2D t, vec2 uv, float sel) {
        float l = texture2D(tStain, uv * 0.031).g * 9.0, ia = floor(l), ib = ia + 1.0;
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        return mix(textureGrad(t, uv + sin(vec2(3.0, 7.0) * ia), dx, dy), textureGrad(t, uv + sin(vec2(3.0, 7.0) * ib), dx, dy), sel);
      }
      #ifdef BAKED
        uniform sampler2D tLM; uniform float uCK; varying vec2 vLM; varying float vA;
      #endif
      ${LIGHT}
      ${PROJ}
      ${HAZE}
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      void main() {
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 N = n, alb;
        float isFlat = 0.0, tint = vC.r;
        #ifdef FLAT
          isFlat = 1.0;
        #endif
        #ifdef BAKED
          isFlat = vA < 0.5 ? 1.0 : 0.0; tint = vC.r / 0.45;
        #endif
        if (isFlat > 0.5) alb = vC; else {
          vec3 a = abs(n); vec2 uv; vec3 t1, t2;
          if (a.y > a.x && a.y > a.z) { uv = vW.xz; t1 = vec3(1., 0., 0.); t2 = vec3(0., 0., 1.); }
          else if (a.x > a.z) { uv = vW.zy; t1 = vec3(0., 0., 1.); t2 = vec3(0., 1., 0.); }
          else { uv = vW.xy; t1 = vec3(1., 0., 0.); t2 = vec3(0., 1., 0.); }
          float sel; alb = pow(noTile(tAlb, uv / 16.0, sel).rgb, vec3(2.2)) * tint;
          vec3 tn = noTileN(tNrm, uv / 16.0, sel).xyz * 2.0 - 1.0;
          N = normalize(n * max(tn.z, 0.2) + (t1 * tn.x + t2 * tn.y) * 0.7);
          float wall = 1.0 - smoothstep(0.6, 0.9, a.y);
          float streak = texture2D(tStain, vec2(uv.x / 97.0, uv.y / 900.0)).r;                 // потёки по вертикали
          alb *= mix(1.0, 1.0 - 0.32 * streak, wall);
          float up = min(abs(vW.y + 160.0), abs(vW.y));                                         // высота над ближайшим полом
          alb *= mix(1.0, mix(0.42, 1.0, smoothstep(0.0, 11.0, up)), wall);                     // тёмная мокрая кайма у пола
          float pud = texture2D(tStain, vW.xz / 300.0).g;
          alb *= mix(1.0, 1.0 - 0.6 * smoothstep(0.35, 0.7, pud), step(0.9, n.y));            // сырые пятна на полу
          alb *= 0.9 + 0.2 * texture2D(tStain, vW.xz / 1900.0 + vW.y / 2300.0).g;              // крупный тон, километрами
        }
        #ifdef BAKED
          vec3 lm = texture2D(tLM, vLM).rgb, L = lm * lm * uCK * uL * uBake * (0.82 + 0.18 * max(dot(N, n), 0.0) * 1.2) + lightDyn(N, vW) + uAmb * 0.3;
        #else
          vec3 L = light(N, vW);
        #endif
        #ifdef GLOW
          L += vec3(GLOW);
        #endif
        L += projAll(N, vW) * uL;
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
const VENT = { x: 110, h: 220, cy: -160 + 110, r: 100 };
const ZN = { hyp: -1500, asia: -2100, asiaR: 260, ret0: -2420, ret1: -3320, ai0: -3420, ai1: -4440, st1: -5160, fan: -6420 };
// кейсы по локациям: n — нормаль к пути (куда смотрит кадр), w — ширина кадра, img — обложка из портфолио
const KX = (id, img, x, y, z, n, w = 80, loc = '') => ({ id, img, p: V(x, LOW + y, z), n: n.normalize(), w, loc });
const OLDPOS = [   // прежние места билбордов — только для разметки скорости финала (чтобы финал остался прежним)
  // гипостиль — ивенты
  KX('baltikaPlant', 'cases/baltika-plant-1', -195, 34, -790, V(1, 0, 0), 80, 'ивенты'),
  KX('megafon', 'cases/megafon-1', -195, 34, -985, V(1, 0, 0), 80, 'ивенты'),
  KX('mice', 'cases/mice-1', 195, 34, -1150, V(-1, 0, 0), 80, 'ивенты'),
  KX('megafonTravel', 'cases/megafon-travel-1', 195, 34, -1320, V(-1, 0, 0), 80, 'ивенты'),
  // колодец — города
  KX('derbent', 'cases/derbent-1', -78, 26, -1610, V(1, 0, 0), 76, 'города'),
  KX('tevredens', 'cases/tevredens-1', 78, 26, -1745, V(-1, 0, 0), 76, 'города'),
  // сакура — азия
  KX('izhora', 'cases/izhora-48-1', 112, 40, -1965, V(-1, 0, 0), 56, 'азия'),
  KX('fandom', 'cases/ozon-fandom-kv-1', -232, 34, -2030, V(1, 0, 0), 80, 'азия'),
  KX('tbank', 'cases/tbank-zone-1', -232, 34, -2185, V(1, 0, 0), 80, 'азия'),
  KX('treschnutye', 'cases/treschnutye-1', 112, 40, -2255, V(-1, 0, 0), 56, 'азия'),
  // продуктовый — ритейл и мерч: таблички над проходом, как в супермаркете
  KX('selekt', 'cases/ozon-select-1', 0, 92, -2560, V(0, 0, 1), 92, 'ритейл'),
  KX('zaklinateli', 'cases/zaklinateli-kv-1', 0, 92, -2700, V(0, 0, 1), 92, 'ритейл'),
  KX('dino', 'cases/dino-1', 0, 92, -2840, V(0, 0, 1), 92, 'ритейл'),
  KX('gdriveMerch', 'cases/gdrive-capsule-1', 0, 92, -2980, V(0, 0, 1), 92, 'мерч'),
  KX('oxygenSet', 'cases/oxygen-set-1', 0, 92, -3110, V(0, 0, 1), 92, 'мерч'),
  KX('lionMerch', 'dp/lion-cover', 0, 92, -3240, V(0, 0, 1), 92, 'мерч'),
  // сфера — ai-продакшн
  KX('aiFonbet', 'cases/ai-fonbet', -92, 34, -3575, V(1, 0, 0), 80, 'ai-продакшн'),
  KX('aiMango', 'cases/ai-mango', 262, 34, -3820, V(-1, 0, 0), 80, 'ai-продакшн'),
  KX('aiLavka', 'cases/ai-lavka', 262, 34, -4030, V(-1, 0, 0), 80, 'ai-продакшн'),
  KX('aiAlfa', 'cases/ai-alfa', -92, 34, -4290, V(1, 0, 0), 80, 'ai-продакшн'),
  // фермы — спорт
  KX('lion', 'dp/lion-2', -112, 34, -4575, V(1, 0, 0), 80, 'спорт'),
  KX('ironstar', 'cases/gdrive-ironstar-1', 112, 34, -4660, V(-1, 0, 0), 80, 'спорт'),
  KX('gdrive', 'cases/gdrive-silk-1', -112, 34, -4790, V(1, 0, 0), 80, 'спорт'),
  KX('baltika7', 'cases/baltika7-1', 112, 34, -4920, V(-1, 0, 0), 80, 'спорт'),
  KX('avangard', 'cases/avangard-1', -112, 34, -5050, V(1, 0, 0), 80, 'спорт'),
];
// ===== кейсы = проекции: проектор бросает огромное превью кейса прямо на стену локации =====
// C — центр картинки на стене, n — нормаль стены в зал, W — ширина картинки (кадр 16:9, обложка вписывается «cover»)
const ZP = {   // высота камеры над полом; потолок для подвеса проектора; расстояние от стены до проектора и его высота
  hyp: { yc: 52, ceil: LOW + 420, pd: 380, py: LOW + 330 },
  shaft: { yc: 26, ceil: null, pd: 270, py: LOW + 70 },
  asia: { yc: 46, ceil: null, pd: 505, py: LOW + 236, a: 58 },
  ret: { yc: 60, ceil: null, pd: 340, py: LOW + 432 },
  ai: { yc: 70, ceil: LOW + 1100, pd: 400, py: LOW + 400 },
  sport: { yc: 60, ceil: LOW + 1000, pd: 560, py: LOW + 400 },
};
const SHC = V(0, 0, (ZN.hyp - 12 + ZN.asia + ZN.asiaR) / 2);
const wallPt = (x, y, z, nx) => ({ C: V(x, LOW + y, z), n: V(nx, 0, 0) });
const cylPt = (c, R, deg, y) => { const a = THREE.MathUtils.degToRad(deg), si = Math.sin(a), co = Math.cos(a); return { C: V(c.x + R * si, LOW + y, c.z + R * co), n: V(-si, 0, -co) }; };
const VIDS = { aiFonbet: 'ai-fonbet', aiMango: 'ai-mango', aiLavka: 'ai-lavka', aiAlfa: 'ai-alfa', tevredens: 'tevredens', zaklinateli: 'zaklinateli' };   // где есть ролик — проектор крутит ролик
const PJ = (id, img, loc, zone, w, W) => ({ id, img, loc, zone, C: w.C, n: w.n, W, H: W * 9 / 16, sc: new THREE.Vector2(1, 1), vid: VIDS[id] });
const SHOTS = [
  PJ('baltikaPlant', 'cases/baltika-plant-1', 'ивенты', 'hyp', wallPt(-699.5, 150, -780, 1), 240),
  PJ('megafon', 'cases/megafon-1', 'ивенты', 'hyp', wallPt(-699.5, 150, -1060, 1), 240),
  PJ('mice', 'cases/mice-1', 'ивенты', 'hyp', wallPt(699.5, 150, -1150, -1), 240),
  PJ('megafonTravel', 'cases/megafon-travel-1', 'ивенты', 'hyp', wallPt(699.5, 150, -1380, -1), 220),
  PJ('derbent', 'cases/derbent-1', 'города', 'shaft', cylPt(SHC, 149.5, -105, -20), 130),
  PJ('tevredens', 'cases/tevredens-1', 'города', 'shaft', cylPt(SHC, 149.5, 115, -20), 130),
  PJ('izhora', 'cases/izhora-48-1', 'азия', 'asia', cylPt(V(0, 0, ZN.asia), 259.5, -60, 80), 170),
  PJ('fandom', 'cases/ozon-fandom-kv-1', 'азия', 'asia', cylPt(V(0, 0, ZN.asia), 259.5, -120, 80), 170),
  PJ('tbank', 'cases/tbank-zone-1', 'азия', 'asia', cylPt(V(0, 0, ZN.asia), 259.5, 105, 80), 170),
  PJ('treschnutye', 'cases/treschnutye-1', 'азия', 'asia', cylPt(V(0, 0, ZN.asia), 259.5, 145, 80), 170),
  PJ('selekt', 'cases/ozon-select-1', 'ритейл', 'ret', wallPt(-169.4, 170, -2600, 1), 200),
  PJ('zaklinateli', 'cases/zaklinateli-kv-1', 'ритейл', 'ret', wallPt(169.4, 170, -2600, -1), 200),
  PJ('dino', 'cases/dino-1', 'ритейл', 'ret', wallPt(-169.4, 170, -2870, 1), 200),
  PJ('gdriveMerch', 'cases/gdrive-capsule-1', 'мерч', 'ret', wallPt(169.4, 170, -2870, -1), 200),
  PJ('oxygenSet', 'cases/oxygen-set-1', 'мерч', 'ret', wallPt(-169.4, 170, -3140, 1), 200),
  PJ('lionMerch', 'dp/lion-cover', 'мерч', 'ret', wallPt(169.4, 170, -3140, -1), 200),
  PJ('aiFonbet', 'cases/ai-fonbet', 'ai-продакшн', 'ai', wallPt(-699.5, 200, -3600, 1), 300),
  PJ('aiMango', 'cases/ai-mango', 'ai-продакшн', 'ai', wallPt(699.5, 200, -3760, -1), 300),
  PJ('aiLavka', 'cases/ai-lavka', 'ai-продакшн', 'ai', wallPt(-699.5, 200, -4100, 1), 300),
  PJ('aiAlfa', 'cases/ai-alfa', 'ai-продакшн', 'ai', wallPt(699.5, 200, -4280, -1), 300),
  PJ('lion', 'dp/lion-2', 'спорт', 'sport', wallPt(-319.5, 170, -4570, 1), 200),
  PJ('ironstar', 'cases/gdrive-ironstar-1', 'спорт', 'sport', wallPt(319.5, 170, -4700, -1), 200),
  PJ('gdrive', 'cases/gdrive-silk-1', 'спорт', 'sport', wallPt(-319.5, 170, -4840, 1), 200),
  PJ('baltika7', 'cases/baltika7-1', 'спорт', 'sport', wallPt(319.5, 170, -4970, -1), 200),
  PJ('avangard', 'cases/avangard-1', 'спорт', 'sport', wallPt(-319.5, 170, -5065, 1), 160),
];
SHOTS.forEach(c => { const z = ZP[c.zone]; c.P = c.C.clone().addScaledVector(c.n, z.pd); c.P.y = z.py; });
// кадр кейса: камера смотрит на стену под углом 30° вперёд по ходу; картинка занимает половину экрана —
// слева, если стена слева от хода, и справа, если справа; на другой половине — подпись и кнопка
const SOLVE_A = THREE.MathUtils.degToRad(30);
function solveShot(sh, aspect) {
  const up = V(0, 1, 0), T0 = sh.n.clone().negate().cross(up).normalize(), f = T0.z < 0 ? T0.clone() : T0.clone().negate(), s = -Math.sign(f.dot(T0));
  const wide = aspect >= 1, tx = wide ? s * 0.47 : 0, ty = wide ? 0.03 : 0.34, tw = wide ? 0.9 : 1.84, th = wide ? 1.5 : 0.62;
  const cam = new THREE.PerspectiveCamera(50, aspect, 1, 9000);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => sh.C.clone().addScaledVector(T0, a * sh.W / 2).addScaledVector(up, b * sh.H / 2));
  const yaw = ZP[sh.zone].a ? THREE.MathUtils.degToRad(ZP[sh.zone].a) : SOLVE_A, dh = sh.n.clone().negate().multiplyScalar(Math.cos(yaw)).addScaledVector(f, Math.sin(yaw)).normalize(), right = dh.clone().cross(up).normalize();
  let D = sh.W * 1.3, lat = -tx * D * 0.6, pitch = 0; const yc = LOW + ZP[sh.zone].yc;
  for (let it = 0; it < 80; it++) {
    const pos = sh.C.clone().addScaledVector(dh, -D).addScaledVector(right, lat); pos.y = yc;
    const dir = dh.clone(); dir.y = Math.tan(pitch); dir.normalize();
    cam.position.copy(pos); cam.lookAt(pos.clone().add(dir)); cam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    corners.forEach(c => { const q = c.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    sh.cam = { pos, dir, s, f, D };
    D *= Math.pow(Math.max((x1 - x0) / tw, (y1 - y0) / th), 0.6);
    lat += ((x0 + x1) / 2 - tx) * D * 0.3; pitch += ((y0 + y1) / 2 - ty) * 0.2;
  }
}
SHOTS.forEach(c => solveShot(c, innerWidth / innerHeight));
// проходы между локациями: камера идёт через проёмы по оси
const DOORS = { 'hyp>shaft': [V(0, LOW + 42, -1440), V(0, LOW + 40, -1570)], 'shaft>asia': [V(0, LOW + 40, -1790), V(0, LOW + 42, -1890)], 'asia>ret': [V(0, LOW + 36, -2330), V(0, LOW + 36, -2460)],
  'ret>ai': [V(0, LOW + 56, -3290), V(0, LOW + 60, -3460)], 'ai>sport': [V(0, LOW + 64, -4400), V(0, LOW + 64, -4490)] };
const ZR = { hyp: [-330, -1480], shaft: [-1590, -1810], asia: [-1905, -2330], ret: [-2485, -3290], ai: [-3485, -4420], sport: [-4505, -5130] };   // куда камере можно в каждой локации (по z)
// взгляд, прикованный к кадру: направление на центр картинки, повёрнутое так, чтобы картинка стояла на своей половине экрана
function lockDir(c, pos, aspect = innerWidth / innerHeight) {
  const wide = aspect >= 1, tanH = Math.tan(THREE.MathUtils.degToRad(25)) * aspect, d = c.C.clone().sub(pos), hz = Math.hypot(d.x, d.z);
  const yaw = wide ? c.cam.s * Math.atan(0.42 * tanH) : 0, pitch = Math.atan2(c.C.y - pos.y, hz) - Math.atan((wide ? 0.03 : 0.34) * Math.tan(THREE.MathUtils.degToRad(25)));
  const h = V(d.x / hz, 0, d.z / hz).applyAxisAngle(V(0, 1, 0), yaw);
  return h.multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch)).normalize();
}
const CAM0 = { pos: V(104, 34, -236), look: V(90, -120, -900) };   // кадр на парапете — отсюда начинается путь по кейсам
function camKeys(endKeys) {
  const K = [{ pos: CAM0.pos.clone(), dir: CAM0.look.clone().sub(CAM0.pos).normalize() }, { pos: V(40, 6, -400) }];
  SHOTS.forEach((c, i) => {
    // проход мимо кадра: камера едет вдоль стены (по ходу), взгляд всё это время прикован к картинке
    const zr = ZR[c.zone], L = c.cam.D * (c.zone === 'sport' ? 0.3 : 0.5), cz = z => Math.min(zr[0], Math.max(zr[1], z));
    const A = c.cam.pos.clone().addScaledVector(c.cam.f, -L / 2), B = c.cam.pos.clone().addScaledVector(c.cam.f, L / 2); A.z = cz(A.z); B.z = cz(B.z);
    const pr = SHOTS[i - 1]; if (pr && pr.zone !== c.zone) DOORS[`${pr.zone}>${c.zone}`].forEach(p => { if (p.z > A.z + 5) K.push({ pos: p.clone() }); });
    K.push({ pos: A, dir: lockDir(c, A), shot: c, hold: 'A' }, { pos: B, dir: lockDir(c, B), shot: c, hold: 'B' });
  });
  K.push({ pos: V(0, LOW + 60, -5080) }, { pos: V(0, LOW + 58, -5150) });   // к проёму в вентшахту — по оси
  return K.concat(endKeys);
}
function camPath(K) {
  const curve = new THREE.CatmullRomCurve3(K.map(k => k.pos), false, 'centripetal'), per = 160, n = (K.length - 1) * per, pos = [], arc = [0];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
    const dx = p.x, dz = p.z - ZN.asia, r = Math.hypot(dx, dz); if (r < 95 && p.y < LOW + 150) { p.x = dx / (r || 1) * 95; p.z = ZN.asia + dz / (r || 1) * 95; }   // в обход ствола сакуры
    if (p.z < -2470 && p.z > -3300) p.x = Math.max(-136, Math.min(136, p.x));                                                                  // в продуктовом — только по проходу
    pos.push(p); if (i) arc.push(arc[i - 1] + pos[i].distanceTo(pos[i - 1]));
  }
  K.forEach((k, i) => { k.j = i * per; k.arc = arc[k.j]; });
  return { pos, arc, n };
}
// зона, которую нельзя застраивать: путь камеры и взгляд на каждую картинку — колонны, балки и товары здесь не ставим
const KEEP = [];
{ const pp = camPath(camKeys([{ pos: V(0, LOW + 42, -5200) }])).pos;
  for (let i = 0; i < pp.length - 6; i += 6) KEEP.push({ a: pp[i], b: pp[i + 6], r: 24 });
  SHOTS.forEach(c => { const T0 = c.n.clone().negate().cross(V(0, 1, 0)).normalize();
    for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) { const g = c.C.clone().addScaledVector(T0, a * c.W / 4.4).add(V(0, b * c.H / 2.2, 0)); KEEP.push({ a: c.cam.pos, b: g, r: 5 }, { a: c.P, b: g, r: 5 }); } });
  KEEP.forEach(k => { k.a2 = k.a.clone().setY(0); k.b2 = k.b.clone().setY(0); }); }
function segD(px, py, pz, a, b) { const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z; let t = ((px - a.x) * bx + (py - a.y) * by + (pz - a.z) * bz) / ((bx * bx + by * by + bz * bz) || 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + bx * t - px, dy = a.y + by * t - py, dz = a.z + bz * t - pz; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
// весь луч проектора (в плане) — тоже без колонн, иначе картинка ложится на колонну перед стеной
const inBeam2 = (x, z, r) => SHOTS.some(c => { const T0 = c.n.clone().negate().cross(V(0, 1, 0)).normalize(), A = c.P, B = c.C.clone().addScaledVector(T0, -c.W / 2), C2 = c.C.clone().addScaledVector(T0, c.W / 2);
  const sd = (p, q) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x), d1 = sd(A, B), d2 = sd(B, C2), d3 = sd(C2, A);
  return (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) || segD(x, 0, z, A.clone().setY(0), B.clone().setY(0)) < r || segD(x, 0, z, A.clone().setY(0), C2.clone().setY(0)) < r; });
const kept2 = (x, z, r) => KEEP.some(k => segD(x, 0, z, k.a2, k.b2) < r + k.r) || inBeam2(x, z, r);
const kept3 = (p, r) => KEEP.some(k => segD(p.x, p.y, p.z, k.a, k.b) < r + k.r);
const SHAFTS = [];   // { x, z, r, k, floor, top }
const LAMPS = [];    // точечные источники локаций: { p, r, c } — к камере подсаживаются ближайшие 8
const ZONES = [      // дымка и общий свет по локациям (по z камеры)
  { z: 200, haze: [0, 0, 0], k: 0, amb: [0.026, 0.028, 0.036] },
  { z: -700, haze: [0.0060, 0.0080, 0.0120], k: 0.0009, amb: [0.0105, 0.0114, 0.0144] },
  { z: -1400, haze: [0.0060, 0.0080, 0.0120], k: 0.0009, amb: [0.0105, 0.0114, 0.0144] },
  { z: -1530, haze: [0.0060, 0.0075, 0.0110], k: 0.0006, amb: [0.0036, 0.0039, 0.0051] },
  { z: -1860, haze: [0.0150, 0.0170, 0.0225], k: 0.0008, amb: [0.0090, 0.0099, 0.0120] },
  { z: -2440, haze: [0.0150, 0.0170, 0.0170], k: 0.0008, amb: [0.0075, 0.0081, 0.0078] },
  { z: -3440, haze: [0.0060, 0.0100, 0.0180], k: 0.0007, amb: [0.0060, 0.0078, 0.0120] },
  { z: -4460, haze: [0.0110, 0.0120, 0.0150], k: 0.0006, amb: [0.0120, 0.0126, 0.0144] },
  { z: -5120, haze: [0.0110, 0.0120, 0.0150], k: 0.0006, amb: [0.0120, 0.0126, 0.0144] },
  { z: -5240, haze: [0.05, 0.022, 0.008], k: 0.0011, amb: [0.0018, 0.0015, 0.0012] },
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

  LAMPS.push({ p: V(500, LOW + 200, -330), r: 380, c: V(0.8, 0.88, 1).multiplyScalar(0.9) });
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
  box(-720, 720, LOW - 20, LOW, -1512, -300); box(-720, 720, LOW - 20, LOW, ZN.fan - 120, ZN.asia + ZN.asiaR);

  // ===== 1. гипостильный зал (реф: G-Cans) — колонны 30×30 м, лампы под потолком, мокрый пол =====
  const HX = 700, HY = LOW + 420;
  box(-HX, HX, HY, HY + 30, ZN.hyp, -300, 0.7);
  box(-HX - 20, -HX, LOW, HY, ZN.hyp, -300); box(HX, HX + 20, LOW, HY, ZN.hyp, -300);
  box(-HX, -320, LOW, HY, -310, -300); box(320, HX, LOW, HY, -310, -300);
  const lampGlow = [];
  for (let x = -630; x <= 630; x += 140) for (let zz = -400; zz >= -1440; zz -= 140) {
    if (nearPath(x, zz, 50) || kept2(x, zz, 22) || (x > 30 && x < 160 && zz > -660)) continue;
    box(x - 15, x + 15, LOW, HY, zz - 15, zz + 15, 0.9 + rnd() * 0.15);
    const lx = x + 70, lz = zz - 70; lampGlow.push(V(lx, HY - 4, lz));
    if (((x + 630) / 140 + (zz + 400) / 140) % 2 === 0) LAMPS.push({ p: V(lx, HY - 30, lz), r: 60, c: V(1, 0.9, 0.78).multiplyScalar(0.55) });
  }
  portalWall(ZN.hyp, HX, HY);
  // кадры 2–3: в торце зала — высокие светящиеся проёмы; колонны и лестница читаются силуэтами против них
  FX.slitsHyp = [-600, -470, -330, -190, 190, 330, 470, 600].map(x => ({ x, w: 26 + (Math.abs(x) % 3) * 8 }));
  FX.slitsHyp.forEach(o => LAMPS.push({ p: V(o.x, LOW + 160, ZN.hyp + 30), r: 260, c: V(0.8, 0.88, 1).multiplyScalar(0.9) }));

  // ===== 2. колодец (кадр 4): шахта Ø300 м и глубиной 2,6 км, мост над ней, свет снизу =====
  const SC = V(0, 0, (ZN.hyp - 12 + ZN.asia + ZN.asiaR) / 2), SR = 150, gb = Math.asin(24 / SR);
  const scyl = (th0, thL, y0, y1) => inst(new THREE.CylinderGeometry(SR, SR, y1 - y0, 72, 1, true, th0, thL), concrete, [{ m: M(V(SC.x, (y0 + y1) / 2, SC.z)) }]);
  scyl(gb, Math.PI - 2 * gb, LOW - 2600, LOW + 420); scyl(Math.PI + gb, Math.PI - 2 * gb, LOW - 2600, LOW + 420);
  [0, Math.PI].forEach(t => { scyl(t - gb, 2 * gb, LOW - 2600, LOW - 8); scyl(t - gb, 2 * gb, LOW + 76, LOW + 420); });
  const ledge = []; for (let y = LOW - 70; y > LOW - 2500; y -= 64) ledge.push({ m: M(V(SC.x, y, SC.z), [-Math.PI / 2, 0, 0]) });
  inst(new THREE.RingGeometry(SR - 12, SR, 96), concrete, ledge);
  box(-8, 8, LOW - 7, LOW, SC.z - SR - 8, SC.z + SR + 8, 0.85);                                    // мост
  box(-8, -7.6, LOW, LOW + 1.4, SC.z - SR - 8, SC.z + SR + 8, 0.5); box(7.6, 8, LOW, LOW + 1.4, SC.z - SR - 8, SC.z + SR + 8, 0.5);
  LAMPS.push({ p: V(0, LOW - 1400, SC.z), r: 900, c: V(0.75, 0.85, 1).multiplyScalar(0.9) });
  FX.shaftC = SC; FX.shaftR = SR;
  const redGlow = [];

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
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; LAMPS.push({ p: V(C.x + Math.cos(a) * 200, LOW + 40, C.z + Math.sin(a) * 200), r: 70, c: V(1, 0.55, 0.7).multiplyScalar(0.35) }); }
  LAMPS.push({ p: V(C.x, LOW + 700, C.z), r: 600, c: V(0.9, 0.92, 1).multiplyScalar(1.2) });

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
  [[-560, -3600], [560, -3600], [-560, -4250], [560, -4250]].forEach(([x, zz]) => LAMPS.push({ p: V(x, LOW + 120, zz), r: 140, c: V(0.55, 0.75, 1).multiplyScalar(0.4) }));
  LAMPS.push({ p: V(0, LOW + 430, -4260), r: 520, c: V(0.8, 0.9, 1).multiplyScalar(1.0) });

  // ===== 6. колодец лестниц (рефы 11, 17): пролёты зигзагом по стенам до самого верха, мосты =====
  const SX = 320, SY = LOW + 1000;
  box(-SX, SX, SY, SY + 20, ZN.st1, ZN.ai1 - 12, 0.7); box(-SX - 20, -SX, LOW, SY, ZN.st1, ZN.ai1 - 12); box(SX, SX + 20, LOW, SY, ZN.st1, ZN.ai1 - 12);
  box(-SX, -72, LOW, SY, ZN.st1 - 12, ZN.st1); box(72, SX, LOW, SY, ZN.st1 - 12, ZN.st1); box(-72, 72, LOW + 144, SY, ZN.st1 - 12, ZN.st1);
  // кадр 8: пространственная ферма — бетонные балки без человеческой логики, свет пробивается сзади
  const rf = mulberry(77);
  for (let i = 0, n = 0; n < 64 && i < 600; i++) {
    const c = V((rf() - 0.5) * 600, LOW + 60 + rf() * 900, ZN.ai1 - 30 - rf() * (ZN.ai1 - ZN.st1 - 60)), L = 260 + rf() * 620, t = 14 + rf() * 26;
    const e = new THREE.Euler(rf() * Math.PI, rf() * Math.PI, rf() * Math.PI), dir = V(0, 1, 0).applyEuler(e);
    let bad = false; for (let k = -1; k <= 1.001; k += 0.1) { const pnt = c.clone().addScaledVector(dir, k * L / 2); if ((Math.abs(pnt.x) < 40 + t && pnt.y < LOW + 110 + t && pnt.z < ZN.ai1 + 20 && pnt.z > ZN.st1 - 20) || kept3(pnt, t + 4)) { bad = true; break; } }
    if (bad) continue;
    boxR(c, V(t, L, t * (0.8 + rf() * 0.6)), [e.x, e.y, e.z], 0.8 + rf() * 0.3); n++;
  }
  FX.slitsSt = [-240, -120, 0, 120, 240].map(x => ({ x, w: 18 + Math.abs(x) % 20 }));
  LAMPS.push({ p: V(0, LOW + 520, ZN.st1 + 30), r: 420, c: V(0.8, 0.88, 1).multiplyScalar(0.7) });

  // ===== 7. вентиляционная шахта (кадры 10–11): 220×220 м, ступенчатые рамы, трубы по стенам, в торце — вентилятор-Искра =====
  const VX = VENT.x, VY = LOW + VENT.h, z0 = ZN.st1, z1 = ZN.fan;
  box(-VX - 14, -VX, LOW, VY, z1 - 80, z0); box(VX, VX + 14, LOW, VY, z1 - 80, z0); box(-VX - 14, VX + 14, VY, VY + 14, z1 - 80, z0);
  for (let zz = z0 - 40, n = 0; zz > z1 + 20; zz -= 48, n++) {                      // рамы: глубина 16 м, внутрь на 16 м
    const t = 16, d = 8;
    box(-VX, -VX + t, LOW, VY, zz - d, zz + d, 0.85); box(VX - t, VX, LOW, VY, zz - d, zz + d, 0.85); box(-VX, VX, VY - t, VY, zz - d, zz + d, 0.85);
    box(-VX + t, -VX + t + 3, LOW, VY - t, zz - d - 3, zz - d, 0.7); box(VX - t - 3, VX - t, LOW, VY - t, zz - d - 3, zz - d, 0.7);   // фаска-ступень
  }
  const pipes = [];
  [[-VX + 22, LOW + 14, 5], [-VX + 22, LOW + 30, 3.4], [VX - 22, LOW + 14, 5], [VX - 22, LOW + 30, 3.4], [-VX + 24, VY - 30, 4], [VX - 24, VY - 30, 4]].forEach(([x, y, r]) => pipes.push({ m: M(V(x, y, (z0 + z1) / 2), [Math.PI / 2, 0, 0], V(r, z0 - z1, r)), c: new THREE.Color(0.09, 0.085, 0.08) }));
  inst(new THREE.CylinderGeometry(1, 1, 1, 16), flatMat, pipes);
  // торцевая стена с круглым проёмом под вентилятор
  const sq = new THREE.Shape([new THREE.Vector2(-VX, 0), new THREE.Vector2(VX, 0), new THREE.Vector2(VX, VENT.h), new THREE.Vector2(-VX, VENT.h)]);
  sq.holes.push(new THREE.Path().absarc(0, VENT.cy - LOW, VENT.r + 4, 0, Math.PI * 2, false));
  inst(new THREE.ShapeGeometry(sq, 64), concrete, [{ m: M(V(0, LOW, z1 + 6)) }, { m: M(V(0, LOW, z1 - 6)) }]);
  // за вентилятором — раскалённая камера: свет, который делает всё контровым
  LAMPS.push({ p: V(0, VENT.cy, z1 + 30), r: 420, c: V(1, 0.6, 0.32).multiplyScalar(1.1) });

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
  inst(new THREE.CylinderGeometry(17, 58, 46, 24, 1, true), flatMat, [{ m: M(base.clone().add(V(0, 23, 0))), c: new THREE.Color(0.05, 0.035, 0.032) }]);   // раздутое основание ствола
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + r() * 0.5, L = 50 + r() * 70; bark.push({ m: beam(base.clone().add(V(Math.cos(a) * 20, 14, Math.sin(a) * 20)), base.clone().add(V(Math.cos(a) * (20 + L), 0, Math.sin(a) * (20 + L))), 9 - r() * 4), c: new THREE.Color(0.045, 0.032, 0.03) }); }   // корни
  
  // лепестки падают сквозь луч
  inst(new THREE.CylinderGeometry(0.42, 0.5, 1, 8), flatMat, bark);
  inst(new THREE.IcosahedronGeometry(1, 0), litMat({ flat: true, glow: 0.22 }), bloom);
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
  [-170, 170, -310, 310].forEach(cx => segs.forEach(([za, zb]) => {
    box(cx - 0.5, cx + 0.5, LOW, LOW + 424, zb, za, 0.75);                                       // задняя стенка
    // там, куда бьёт проектор, стеллаж со стороны прохода разобран: на задней стенке чистый экран
    const scr = SHOTS.find(s => s.zone === 'ret' && Math.abs(s.C.x - cx) < 2 && s.C.z < za && s.C.z > zb), fs = -Math.sign(cx);
    const inScr = (z0, z1, y) => scr && z1 > scr.C.z - scr.W / 2 - 6 && z0 < scr.C.z + scr.W / 2 + 6 && Math.abs(y - scr.C.y) < scr.H / 2 + 26;
    const half = (y0, y1, z0, z1, t) => { if (fs > 0) box(cx + 0.5, cx + 13, y0, y1, z0, z1, t); else box(cx - 13, cx - 0.5, y0, y1, z0, z1, t); };
    const back = (y0, y1, z0, z1, t) => { if (fs > 0) box(cx - 13, cx + 0.5, y0, y1, z0, z1, t); else box(cx - 0.5, cx + 13, y0, y1, z0, z1, t); };
    for (let zz = za; zz >= zb - 1; zz -= 60) { back(LOW, LOW + 424, zz - 1.5, zz + 1.5, 0.8); if (!inScr(zz - 1.5, zz + 1.5, scr ? scr.C.y : 0)) half(LOW, LOW + 424, zz - 1.5, zz + 1.5, 0.8); else { half(LOW, scr.C.y - scr.H / 2 - 26, zz - 1.5, zz + 1.5, 0.8); half(scr.C.y + scr.H / 2 + 26, LOW + 424, zz - 1.5, zz + 1.5, 0.8); } }   // стойки
    for (let k = 0; k <= 6; k++) { const y = LOW + 4 + k * 70; back(y - 1, y + 1, zb, za, 0.85);
      if (inScr(zb, za, y)) { half(y - 1, y + 1, scr.C.z + scr.W / 2 + 6, za, 0.85); half(y - 1, y + 1, zb, scr.C.z - scr.W / 2 - 6, 0.85); } else half(y - 1, y + 1, zb, za, 0.85); }   // полки
    for (let k = 0; k < 6; k++) [-1, 1].forEach(face => {
      let zz = za - 2, col = pal[Math.floor(r() * pal.length)];
      while (zz > zb + 4) {
        if (r() < 0.18) col = pal[Math.floor(r() * pal.length)];
        const w = 4 + r() * 9, h = 12 + r() * 44, d = 9 + r() * 3, y0 = LOW + 5 + k * 70, x = cx + face * (13 - d / 2 - 0.5), c = new THREE.Color(...col).lerp(new THREE.Color(0.42, 0.42, 0.4), 0.45).multiplyScalar(0.75 + r() * 0.3);
        if (face === fs && inScr(zz - w, zz, y0 + h / 2)) { zz -= w + 0.6; continue; }   // под проекцией полки пустые
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
  for (let zz = ZN.ret0 - 80; zz > ZN.ret1; zz -= 120) [0, -280, 280].forEach(x => LAMPS.push({ p: V(x, RY - 40, zz), r: 130, c: V(0.85, 1, 0.9).multiplyScalar(0.45) }));
  LAMPS.push({ p: V(0, LOW + 70, ZN.ret1 - 20), r: 420, c: V(0.85, 0.95, 1).multiplyScalar(1.1) });
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
        float rim = pow(1.0 - max(dot(n, v), 0.0), 7.0);                     // контровой ореол по силуэту
        vec3 c = vec3(0.004, 0.0045, 0.006) + vec3(0.85, 0.92, 1.0) * rim * 3.2 + vec3(0.6, 0.7, 0.9) * fr * 0.05;
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
  const cold = 0xdfe8ff, slab = (w, h, pos, k = 2.6) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic(cold, k)); m.position.copy(pos); scene.add(m); FX.glows.push(m); return m; };
  slab(80, 330, V(470, LOW + 260, -299), 2.4); slab(50, 330, V(590, LOW + 260, -299), 2.4);                                                                    // кадр 1: свет из-за края стены
  FX.slitsHyp.forEach(o => slab(o.w, 340, V(o.x, LOW + 190, ZN.hyp + 0.6)));                                 // кадры 2–3
  const bot = new THREE.Mesh(new THREE.CircleGeometry(FX.shaftR - 10, 64), basic(cold, 3)); bot.rotation.x = -Math.PI / 2; bot.position.set(0, LOW - 2560, FX.shaftC.z); scene.add(bot); FX.glows.push(bot);   // кадр 4
  slab(118, 138, V(0, LOW + 70, ZN.ret1 - 4), 1.9);                                                           // кадр 6: конец прохода
  const back = new THREE.Mesh(new THREE.CircleGeometry(300, 96), basic(cold, 2.8)); back.position.set(0, LOW + 430, -4350); scene.add(back); FX.glows.push(back);   // кадр 7
  FX.slitsSt.forEach(o => slab(o.w, 600, V(o.x, LOW + 560, ZN.st1 + 0.6), 2.4));                             // кадр 8
  for (let zz = ZN.st1 - 64; zz > ZN.st1 - 520; zz -= 48) [-1, 1].forEach(sd => { const m = slab(3, 180, V(sd * (VENT.x - 0.6), LOW + 100, zz), 2.6); m.rotation.y = -sd * Math.PI / 2; });   // кадр 9: щели
  // проекторы: корпус на подвесе (или на галерее / на стеллаже), линза, луч в дымке; картинка — в шейдере бетона
  const bodies = [], rods = [], dark = new THREE.Color(0.045, 0.045, 0.05);
  SHOTS.forEach(c => {
    const z = ZP[c.zone], P = c.P, dir = c.C.clone().sub(P).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir);
    bodies.push({ m: new THREE.Matrix4().compose(P.clone().addScaledVector(dir, -7), q, V(11, 7, 15)), c: dark });
    if (z.ceil) rods.push({ m: beam(P.clone().addScaledVector(dir, -7), V(P.x, z.ceil, P.z).addScaledVector(dir, -7), 0.8), c: dark });
    else bodies.push({ m: M(P.clone().addScaledVector(dir, -7).add(V(0, -6, 0)), [0, 0, 0], V(5, 6, 5)), c: dark });
    const cover = a => { const fa = 16 / 9; c.sc.set(a > fa ? fa / a : 1, a > fa ? 1 : a / fa); };
    if (c.vid) {
      const v = Object.assign(document.createElement('video'), { src: `assets/${c.vid}.mp4`, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
      v.addEventListener('loadedmetadata', () => cover(v.videoWidth / v.videoHeight)); c.video = v; c.tex = new THREE.VideoTexture(v);
    } else c.tex = texL.load(`assets/${c.img}.jpg`, t => cover(t.image.width / t.image.height));
    c.tex.colorSpace = THREE.SRGBColorSpace; c.tex.anisotropy = 8;
    const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: new THREE.Color(1, 0.95, 0.88).multiplyScalar(4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lens.scale.setScalar(16); lens.position.copy(P).addScaledVector(dir, 1); scene.add(lens); FX.glows.push(lens);
    // луч: стороны пирамиды и два сечения внутри; цвет — из картинки (размытой), гуще у линзы
    const T0 = c.n.clone().negate().cross(V(0, 1, 0)).normalize(), cr = (a, b) => c.C.clone().addScaledVector(T0, a * c.W / 2).add(V(0, b * c.H / 2, 0));
    const pts = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1], [-1, 0, 1, 0], [0, -1, 0, 1], [-1, -1, 1, 1], [1, -1, -1, 1]], pos = [];
    pts.forEach(([a, b, e, d]) => { const A = cr(a, b), B = cr(e, d); pos.push(P.x, P.y, P.z, A.x, A.y, A.z, B.x, B.y, B.z); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const bm = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { tI: { value: c.tex }, uP: { value: P }, uC: { value: c.C }, uN: { value: c.n }, uW: { value: new THREE.Vector2(c.W, c.H) }, uSc: { value: c.sc }, uK: { value: 0 }, uT: U.uT },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D tI; uniform vec3 uP, uC, uN; uniform vec2 uW, uSc; uniform float uK, uT; varying vec3 vW;
        void main(){
          vec3 d = vW - uP; float t = dot(uC - uP, uN) / min(dot(d, uN), -1e-3);
          vec3 h = uP + d * t - uC, T = normalize(cross(-uN, vec3(0., 1., 0.))), B = cross(T, -uN);
          vec2 uv = clamp(vec2(dot(h, T) / uW.x, dot(h, B) / uW.y) + 0.5, 0.0, 1.0);
          vec3 img = texture2D(tI, (uv - 0.5) * uSc + 0.5, 5.0).rgb;
          float f = clamp(1.0 / t, 0.0, 1.0), dust = 0.7 + 0.3 * sin(dot(vW, vec3(0.043, 0.09, 0.061)) + uT * 0.5);
          float a = uK * pow(1.0 - f, 1.4) * (1.0 - smoothstep(0.7, 1.0, f)) * smoothstep(10.0, 80.0, length(vW - cameraPosition)) * dust;
          gl_FragColor = vec4((img + 0.06) * a, 1.0);
        }` }));
    bm.frustumCulled = false; scene.add(bm); c.beam = bm;
  });
  inst(new THREE.BoxGeometry(1, 1, 1), flatMat, bodies);
  if (rods.length) inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), flatMat, rods);
  // крошечные люди
  const people = [V(30, 0, -290), V(36, 0, -292), V(-150, 0, -40), V(80, LOW, -660), V(-60, LOW, -1300), V(-40, LOW, -1700), V(-200, LOW, -2160), V(10, LOW, -3000), V(-40, LOW, -3800), V(30, LOW, -4400), V(-4, LOW, -6230)];
  const pg = new THREE.CapsuleGeometry(0.32, 1.1, 3, 8); pg.translate(0, 0.87, 0);
  inst(pg, new THREE.MeshBasicMaterial({ color: 0x050505 }), people.map(p => ({ m: M(p) })));
  buildFan();
}

// финал: вентилятор в форме Искры, контровой свет за ним, поток пыли
function buildFan() {
  const z = ZN.fan, cy = VENT.cy, R = VENT.r, dark = new THREE.Color(0.03, 0.028, 0.026);
  inst(new THREE.TorusGeometry(R + 2, 7, 16, 128), flatMat, [{ m: M(V(0, cy, z + 4)), c: new THREE.Color(0.07, 0.065, 0.06) }]);
  inst(new THREE.CylinderGeometry(14, 14, 24, 48), flatMat, [{ m: M(V(0, cy, z - 4), [Math.PI / 2, 0, 0]), c: dark }]);
  inst(new THREE.BoxGeometry(1, 1, 1), flatMat, [0, 1, 2, 3].map(i => ({ m: M(V(0, cy, z - 16), [0, 0, i * Math.PI / 4], V(2 * R + 10, 3, 3)), c: dark })));   // растяжки за лопастями
  const g = iskra.geometry.clone(); g.computeBoundingBox(); const bb = g.boundingBox, k = 2 * (R - 3) / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  const bi = new THREE.InstancedMesh(g, litMat({ flat: true }), 1); bi.setMatrixAt(0, M(V(0, cy, z), [0, 0, 0], V(k, k, k * 0.3))); bi.setColorAt(0, dark); bi.frustumCulled = false; scene.add(bi);
  // раскалённый свет за вентилятором: диск + ореол
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 6, 96), basic(0xffb27a, 3.6)); disc.position.set(0, cy, z - 60); scene.add(disc); FX.glows.push(disc);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: new THREE.Color(1, 0.55, 0.28).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.scale.setScalar(R * 3.2); halo.position.set(0, cy, z - 30); scene.add(halo); FX.glows.push(halo);
  const n = 4000, pos = new Float32Array(n * 3), r = mulberry(5);
  for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 2 * (VENT.x - 20), LOW + 2 + r() * (VENT.h - 10), z + r() * 1300], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  FX.vdust = new THREE.Points(dg, new THREE.PointsMaterial({ map: softDot, size: 1.8, color: new THREE.Color(1, 0.72, 0.45), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
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
let CAMK = [], ISK = [], SMAP = [], STOPS = [], P_A = 0.58, P_B = 0.93;
const CP = { p: [], pos: [], dir: [], s: [] };   // путь камеры по кейсам: по p — позиция, взгляд, голова ленты
const RIG = { pos: [], look: [], s0: 0, step: 4 };
function buildTimeline() {
  const s = slot, L0 = LOGO, rc = REEL.c, sl = iskra.userData.S;
  const sAt = pt => { let best = 0, bd = 1e9; for (let x = 0; x <= S_TOTAL; x += 1) { const d = headAt(x).distanceTo(pt); if (d < bd) { bd = d; best = x; } } return best; };
  const sv = PATH.map(p => sAt(p[0]));
  const at = (x, z) => sAt(V(x, LOW + 0.25, z));
  // p ↔ длина ленты: стена неторопливо, дальше — по локациям, на каждой своё время
  SMAP = [[P_LINE, 0], [0.25, sv[1]], [0.36, sv[4]], [0.42, sv[6]], [0.53, sv[7]], [0.58, sv[8]], [0.62, sv[9]]];
  // остановки у кейсов: кадр слева, подпись справа; камера на пути ленты
  STOPS = OLDPOS.map(c => {
    const sp = sAt(V(c.p.x, LOW + 0.25, c.p.z).addScaledVector(c.n, Math.abs(c.n.z) > 0.5 ? 0 : 60));
    const near = ['derbent', 'tevredens', 'izhora', 'treschnutye'].includes(c.id);
    return { c, s: sp - (near ? 18 + c.w * 0.25 : 60 + c.w * 0.9) };   // голова ленты здесь — камера на ~60 м позади, кадр впереди по диагонали
  }).sort((a, b) => a.s - b.s);
  // после лестницы: скорость по пути постоянная, у каждого кейса плавно падает (гаусс) и так же плавно растёт
  const s0 = sv[9], s1 = S_TOTAL, NS_ = Math.ceil((s1 - s0) / 2);
  const dens = x => 1 + STOPS.reduce((a, t) => a + 6 * Math.exp(-(((x - t.s) / 30) ** 2)), 0);
  const cum = [0]; for (let i = 1; i <= NS_; i++) cum.push(cum[i - 1] + dens(s0 + (i - 0.5) * (s1 - s0) / NS_));
  for (let i = 1; i <= NS_; i++) SMAP.push([0.62 + (P_END - 0.62) * cum[i] / cum[NS_], s0 + i * (s1 - s0) / NS_]);
  const pOf = x => { for (let i = 0; i < SMAP.length - 1; i++) if (x <= SMAP[i + 1][1]) return SMAP[i][0] + (SMAP[i + 1][0] - SMAP[i][0]) * (x - SMAP[i][1]) / (SMAP[i + 1][1] - SMAP[i][1] || 1); return P_END; };
  STOPS.forEach(t => { t.pS = pOf(t.s); });
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
  ];
  // ===== после лестницы: одна плавная траектория вместо ключей =====
  // позиция — сглаженный путь ленты (углы скруглены), камера на 60 м позади головы и на 42 м выше пола;
  // у кейса — мягкое притяжение к точке съёмки; взгляд — вперёд по пути, в главное событие локации, на кейс у остановки
  const hd = x => headAt(Math.min(Math.max(x, 0), S_TOTAL), V(0, 0, 0));
  const smoothPath = (x, win) => { const a = V(0, 0, 0); for (let k = -6; k <= 6; k++) a.add(hd(x + k * win / 6)); return a.multiplyScalar(1 / 13); };
  const bump = (z, z0, z1, e = 120) => clamp01((z0 - z) / e) * clamp01((z - z1) / e);
  const STEP = 4, n = Math.ceil((s1 - s0) / STEP) + 1, P = [], Lk = [];
  const introEnd = V(110, -116, -575), introLook = V(70, -140, -1000);
  for (let i = 0; i < n; i++) {
    const x = s0 + i * STEP, h = hd(x), pos = smoothPath(x - 60, 90).add(V(0, 42, 0)), ahead = smoothPath(x + 170, 110).add(V(0, 34, 0));
    pos.y = Math.max(pos.y, LOW + 36);
    let look = ahead.clone();
    const z = h.z;
    look.lerp(V(0, LOW - 600, -1690), 0.55 * bump(z, -1500, -1850, 90));            // колодец: вниз в бездну
    look.lerp(V(0, LOW + 230, ZN.asia), 0.6 * bump(z, -1840, -2420, 110));          // сакура
    look.lerp(V(0, LOW + 420, -3930), 0.55 * bump(z, -3420, -4440, 140));           // сфера
    look.lerp(V(0, VENT.cy + 10, ZN.fan), bump(z, -5150, -9000, 160));              // вентилятор
    let wl = 0, cl = null;
    STOPS.forEach(t => { const b = Math.exp(-(((x - t.s) / 52) ** 2)); if (b > wl) { wl = b; cl = t; } });
    if (cl) { const c = cl.c, vd = c.p.clone().sub(pos).normalize(), right = vd.clone().cross(V(0, 1, 0)).normalize(); look.lerp(c.p.clone().addScaledVector(right, c.w * 0.28), Math.min(1, smooth(wl) * 1.15)); }
    const wi = smooth(clamp01((x - s0) / 160)); pos.lerp(introEnd, 1 - wi); look.lerp(introLook, 1 - wi);
    P.push(pos); Lk.push(look);
  }
  const relax = (A, r) => A.map((_, i) => { const a = V(0, 0, 0); let c = 0; for (let k = -r; k <= r; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); a.add(A[j]); c++; } return a.multiplyScalar(1 / c); });
  const Ps = relax(relax(P, 8), 8);
  // взгляд как направление; скорость поворота ≤ 1,6° на 4 м пути — проход вперёд и назад, затем среднее (поворот начинается заранее)
  const dirs = Lk.map((l, i) => l.clone().sub(Ps[i]).normalize()), MAXA = THREE.MathUtils.degToRad(3.2);
  const limit = (arr, from, to, st) => { const out = arr.map(d => d.clone()); for (let i = from + st; i !== to; i += st) { const a = out[i - st], b = out[i], ang = a.angleTo(b); if (ang > MAXA) out[i] = a.clone().lerp(b, MAXA / ang).normalize(); } return out; };
  const fw = limit(dirs, 0, n, 1), bw = limit(dirs, n - 1, -1, -1);
  const D2 = relax(fw.map((d, i) => d.clone().add(bw[i]).normalize()), 3).map(d => d.normalize());
  RIG.pos = Ps; RIG.look = Ps.map((p, i) => p.clone().addScaledVector(D2[i], 220)); RIG.s0 = s0; RIG.step = STEP;
  // финальный кадр 11: камера подходит к вентилятору, пока он раскручивается
  RIG.finPos = V(0, LOW + 30, -6160); RIG.finLook = V(0, LOW + 116, ZN.fan);
  // ===== с парапета до вентшахты: камера от кадра к кадру =====
  // позиция — плавная кривая через точки съёмки кейсов и проёмы между локациями; у каждого кадра камера почти замирает и чуть наезжает,
  // между кадрами разгоняется; взгляд плавно переходит от кадра к движению вперёд и к следующему кадру
  {
  P_A = pOf(sv[8]);
  const sJoin = sAt(V(0, LOW + 0.25, -5262)); P_B = pOf(sJoin);
  const oldAt = x => { const f = (x - s0) / STEP, i0 = Math.max(0, Math.min(n - 2, Math.floor(f))), w = clamp01(f - i0); const p = RIG.pos[i0].clone().lerp(RIG.pos[i0 + 1], w), l = RIG.look[i0].clone().lerp(RIG.look[i0 + 1], w); return { pos: p, dir: l.sub(p).normalize() }; };
  const e1 = oldAt(sJoin - 50), e2 = oldAt(sJoin);
  const KK = camKeys([{ pos: e1.pos }, { pos: e2.pos, dir: e2.dir }]), path = camPath(KK), N = path.n, arc = path.arc, cp = path.pos;
  const sm = t => t * t * t * (t * (t * 6 - 15) + 10);
  const slerpV = (a, b, t) => { const ang = a.angleTo(b); if (ang < 1e-4) return a.clone(); let ax = a.clone().cross(b); if (ax.lengthSq() < 1e-8) ax = V(0, 1, 0); return a.clone().applyAxisAngle(ax.normalize(), ang * t); };
  const tan = cp.map((p, j) => { const d = cp[Math.min(N, j + 6)].clone().sub(cp[Math.max(0, j - 6)]); d.y = Math.max(-0.2, Math.min(0.2, d.y / (Math.hypot(d.x, d.z) || 1))) * Math.hypot(d.x, d.z); return d.normalize(); });
  const tanS = tan.map((_, j) => { const a = V(0, 0, 0); for (let k = -40; k <= 40; k += 4) a.add(tan[Math.min(N, Math.max(0, j + k))]); return a.normalize(); });
  const anc = KK.filter(k => k.dir), RT = 150, dirs = [];
  for (let j = 0, ai = 0; j <= N; j++) {
    while (ai < anc.length - 2 && anc[ai + 1].j <= j) ai++;
    const a = anc[ai], b = anc[ai + 1];
    if (a.shot && a.shot === b.shot) { dirs.push(lockDir(a.shot, cp[j])); continue; }
    const d1 = arc[j] - a.arc, d2 = b.arc - arc[j], L = d1 + d2;
    if (L < 2 * RT) dirs.push(slerpV(a.dir, b.dir, sm(clamp01(d1 / (L || 1)))));
    else dirs.push(slerpV(slerpV(tanS[j], a.dir, sm(clamp01(1 - d1 / RT))), b.dir, sm(clamp01(1 - d2 / RT))));
  }
  // скорость: у кадра — едва движется (наезд 10 м занимает заметный кусок скролла), разгон и торможение плавные
  const holds = KK.filter(k => k.hold === 'A').map(k => [k.arc, KK[KK.indexOf(k) + 1].arc]);
  const vel = x => { let d = 1e9; holds.forEach(([a, b]) => { d = Math.min(d, x < a ? a - x : x > b ? x - b : 0); }); return 0.1 + 0.9 * sm(clamp01(d / 140)); };
  const w0 = arc.map((_, j) => j ? (arc[j] - arc[j - 1]) / vel((arc[j] + arc[j - 1]) / 2) : 0);
  // переходу между кадрами — столько скролла, сколько нужно на разворот без спешки (≤ 11° на 0,0005 p)
  const trs = KK.filter(k => k.hold === 'B').map(k => { const nx = KK.slice(KK.indexOf(k) + 1).find(q => q.hold === 'A') || KK[KK.length - 1]; let ang = 0; for (let j = k.j + 1; j <= nx.j; j++) ang += dirs[j].angleTo(dirs[j - 1]); return [k.j, nx.j, ang * 57.3]; });   // весь поворот на переходе (через «вперёд»)
  for (let it = 0; it < 4; it++) { const U = w0.reduce((a, b) => a + b, 0), ppu = (P_B - P_A) / U;
    trs.forEach(([a, b, ang]) => { let u = 0; for (let j = a + 1; j <= b; j++) u += w0[j]; const need = ang / 9 * 0.0005 / ppu; if (u < need && b > a) { const add = (need - u) / (b - a); for (let j = a + 1; j <= b; j++) w0[j] += add; } }); }
  const cum = [0]; for (let j = 1; j <= N; j++) cum.push(cum[j - 1] + w0[j]);
  // голова ленты: ближайшая к камере точка ленты, только вперёд, с запасом
  let sh = sv[9];
  CP.p = []; CP.pos = cp; CP.dir = dirs; CP.s = [];
  for (let j = 0; j <= N; j++) {
    CP.p.push(P_A + (P_B - P_A) * cum[j] / cum[N]);
    let best = sh, bd = 1e9; for (let x = sh - 100; x <= sh + 900; x += 4) { const d = hd(x).distanceTo(cp[j]); if (d < bd) { bd = d; best = x; } }
    sh = Math.max(sh, best);
    let sv_ = Math.min(sJoin, sh + 40); sv_ = sv[8] + (sv_ - sv[8]) * sm(clamp01(arc[j] / 260)); sv_ += (sJoin - sv_) * sm(clamp01((j - (N - 600)) / 600));
    CP.s.push(j ? Math.max(CP.s[j - 1], sv_) : sv_);
  }
  // предел скорости поворота по скроллу (14° на 0,0005 p): на проходе у кадра взгляд не трогаем — весь разворот идёт между кадрами;
  // вперёд от прошлого кадра и назад от следующего, затем смесь по доле пути перехода — без скачков на стыках
  { const inH = arc.map(x => holds.some(([a, b]) => x >= a && x <= b)), MR = THREE.MathUtils.degToRad(14) / 0.0005;
    const lim = (from, to, st) => { const o = dirs.map(d => d.clone()); for (let j = from + st; j !== to; j += st) { if (inH[j]) continue; const al = MR * Math.abs(CP.p[j] - CP.p[j - st]), ang = o[j - st].angleTo(o[j]); if (ang > al) o[j] = slerpV(o[j - st], o[j], al / ang); } return o; };
    const fw = lim(0, N + 1, 1), bw = lim(N, -1, -1);
    for (let j = 0, a = 0; j <= N; j++) { if (inH[j]) { a = j; continue; } let b = j; while (b < N && !inH[b]) b++; const t = sm(clamp01((CP.p[j] - CP.p[a]) / ((CP.p[b] - CP.p[a]) || 1)));
      dirs[j] = slerpV(fw[j], bw[j], t).normalize(); } }
  const pAtArc = x => { let j = 0; while (j < N && arc[j] < x) j++; return CP.p[j]; };
  KK.filter(k => k.hold === 'A').forEach(k => { const c = k.shot, b = KK[KK.indexOf(k) + 1]; c.p0 = pAtArc(k.arc - 25); c.p1 = pAtArc(b.arc + 5); c.pMid = pAtArc((k.arc + b.arc) / 2); });
  }
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
const cpIdx = p => { let lo = 0, hi = CP.p.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CP.p[m] < p) lo = m; else hi = m; } return [lo, clamp01((p - CP.p[lo]) / ((CP.p[hi] - CP.p[lo]) || 1))]; };
const sOfP = p => { if (p > P_A && p < P_B && CP.p.length) { const [i, w] = cpIdx(p); return CP.s[i] + (CP.s[i + 1] - CP.s[i]) * w; }
  if (p <= SMAP[0][0]) return 0; if (p >= SMAP[SMAP.length - 1][0]) return S_TOTAL;
  let lo = 0, hi = SMAP.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SMAP[m][0] < p) lo = m; else hi = m; }
  return SMAP[lo][1] + (SMAP[hi][1] - SMAP[lo][1]) * (p - SMAP[lo][0]) / (SMAP[hi][0] - SMAP[lo][0] || 1); };

// ---------- цикл ----------
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b }));
const pctEl = document.getElementById('pct');
let pSm = 0; const mouse = new THREE.Vector2(), mouseSm = new THREE.Vector2(), look = V(0, 0, 0), head = V(0, 0, 0), tmp = V(0, 0, 0);
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
const clock = new THREE.Clock();
const RED_C = new THREE.Color(1, 0.06, 0.05), RED_V = V(1, 0.06, 0.05), CREAM_V = V(1, 0.9, 0.78);
const BACKLIGHTS = [   // точка, откуда бьёт контровой свет, — для лучей
  { z0: 200, z1: -640, p: V(520, LOW + 260, -300), k: 0.6 },
  { z0: -300, z1: -1500, p: V(0, LOW + 190, ZN.hyp), k: 0.8 },
  { z0: -1500, z1: -1840, p: V(0, LOW - 2560, -1676), k: 0.9 },
  { z0: -1840, z1: -2420, p: V(0, LOW + 1000, ZN.asia), k: 0.8 },
  { z0: -2420, z1: -3330, p: V(0, LOW + 70, ZN.ret1), k: 0.9 },
  { z0: -3330, z1: -4440, p: V(0, LOW + 430, -4350), k: 1.0 },
  { z0: -4440, z1: -5160, p: V(0, LOW + 560, ZN.st1), k: 0.8 },
  { z0: -5150, z1: -6600, p: V(0, -50, -6480), k: 1.0 },
];
const _sp = new THREE.Vector3();
function updateRays() {
  const cz = camera.position.z; let k = 0;
  for (const b of BACKLIGHTS) if (cz < b.z0 + 60 && cz > b.z1) {
    _sp.copy(b.p).project(camera); if (_sp.z > 1) continue;
    const kk = b.k * clamp01(1.4 - Math.max(Math.abs(_sp.x), Math.abs(_sp.y))) * clamp01((b.z0 + 60 - cz) / 120) * U.uL.value;
    if (kk > k) { k = kk; rays.uniforms.uLight.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5); }
  }
  rays.uniforms.uK.value = k;
}
const zoneAt = z => { let i = 0; while (i < ZONES.length - 2 && z < ZONES[i + 1].z) i++; const a = ZONES[i], b = ZONES[i + 1], t = smooth(clamp01((a.z - z) / (a.z - b.z))); const mix = (u, v) => u.map((x, k) => x + (v[k] - x) * t); return { haze: mix(a.haze, b.haze), k: a.k + (b.k - a.k) * t, amb: mix(a.amb, b.amb) }; };
const camT = V(0, 0, 0), rigPos = V(0, 0, 0), rigQ = new THREE.Quaternion(), _qT = new THREE.Quaternion(), _qS = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _up = V(0, 1, 0);
let snapCam = true;
// цель камеры: интро — по ключам; дальше — по таблице траектории (по длине ленты)
function camTarget(q) {
  if (q > P_A && q < P_B && CP.p.length) {
    const [i, w] = cpIdx(q); camT.lerpVectors(CP.pos[i], CP.pos[i + 1], w); look.copy(CP.dir[i]).lerp(CP.dir[i + 1], w).normalize().multiplyScalar(200).add(camT); return;
  }
  if (q <= P_A) {
    const k = CAMK; let i = 0; while (i < k.length - 2 && q > k[i + 1].p) i++;
    const u = (i + clamp01((q - k[i].p) / (k[i + 1].p - k[i].p))) / (k.length - 1);
    k.pos.getPoint(Math.min(u, 1), camT); k.look.getPoint(Math.min(u, 1), look);
  } else {
    const f = (sOfP(q) - RIG.s0) / RIG.step, i0 = Math.max(0, Math.min(RIG.pos.length - 2, Math.floor(f))), w = clamp01(f - i0);
    camT.lerpVectors(RIG.pos[i0], RIG.pos[i0 + 1], w); look.lerpVectors(RIG.look[i0], RIG.look[i0 + 1], w);
    if (q > P_END) { const e = smooth(clamp01((q - P_END) / (1 - P_END))); camT.lerp(RIG.finPos, e); look.lerp(RIG.finLook, e); }
  }
}
// скролл 7500vh: интро (до парапета) — прежние 960vh, финал после кейсов — прежние ~11286vh на единицу p, всё остальное — кейсам
const VH = 7500, RAW_A = 960 / VH, rawB = () => 1 - (1 - P_B) * 11286 / VH;
const toP = r => { const B = rawB(); return r < RAW_A ? r * P_A / RAW_A : r < B ? P_A + (r - RAW_A) * (P_B - P_A) / (B - RAW_A) : P_B + (r - B) * (1 - P_B) / (1 - B); };
const toRaw = p => { const B = rawB(); return p < P_A ? p * RAW_A / P_A : p < P_B ? RAW_A + (p - P_A) * (B - RAW_A) / (P_B - P_A) : B + (p - P_B) * (1 - B) / (1 - P_B); };
const capEl = document.getElementById('case');
let capId = null;
function caption(p) {
  const k = SHOTS.findIndex(c => p >= c.p0 && p <= c.p1), t = SHOTS[k];
  if (!t) { capEl.classList.remove('on'); capId = null; return; }
  if (capId !== t.id) { capId = t.id; const c = CASES[t.id] || {}, ps = c.pass || {};
    capEl.innerHTML = `<span class="t">{${String(k + 1).padStart(2, '0')}} ${t.loc}</span><h2>${c.title || ''}</h2><p class="m">${[ps.клиент, ps.год].filter(x => x && x !== '—').join(' · ')}</p><p>${c.idea || c.task || ''}</p><a class="btn" href="#case/${t.id}">читать кейс</a>`;
    capEl.classList.toggle('left', t.cam.s > 0); }   // подпись — на свободной половине кадра
  capEl.classList.add('on');
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const max = document.documentElement.scrollHeight - innerHeight, p = toP(max > 0 ? clamp01(scrollY / max) : 0);
  pSm += (p - pSm) * (1 - Math.exp(-dt * 2.6));
  U.uT.value = time;
  camTarget(pSm);
  // риг: пружина с пределом скорости 160 м/с и пределом поворота 40°/с — без рывков даже при резком скролле
  if (snapCam) { rigPos.copy(camT); }
  else { const d = camT.clone().sub(rigPos), stepV = d.multiplyScalar(1 - Math.exp(-dt * 3.0)), mx = 160 * dt; if (stepV.length() > mx) stepV.setLength(mx); rigPos.add(stepV); }
  _m4.lookAt(rigPos, look, _up); _qT.setFromRotationMatrix(_m4);
  if (snapCam) rigQ.copy(_qT); else { _qS.copy(rigQ).slerp(_qT, 1 - Math.exp(-dt * 2.4)); rigQ.rotateTowards(_qS, THREE.MathUtils.degToRad(40) * dt); }
  snapCam = false;
  mouseSm.lerp(mouse, Math.min(1, dt * 2)); camera.position.copy(rigPos).add(V(mouseSm.x * 2.5, -mouseSm.y * 1.5, 0)); camera.quaternion.copy(rigQ);
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
  for (let n = 0; n < 8; n++) { const l = near[n][0]; P[4 + n].set(l.p.x, l.p.y, l.p.z, l.r); C[4 + n].copy(l.c).multiplyScalar(BAKED.on ? 0 : Lh); }
  // воздух локации
  const zn = zoneAt(cp.z); U.uHaze.value.fromArray(zn.haze); U.uHazeK.value = zn.k * Lh; U.uAmb.value.fromArray(zn.amb);
  FX.beams.forEach(o => { o.b.material.uniforms.uK.value = 0.03 * o.k * Lh; });
  FX.glows.forEach(g => { g.visible = Lh > 0.01; });
  // проекторы: в шейдер — три ближайших; лучи видны только у ближних
  const pj = SHOTS.map(c => [c, cp.distanceTo(c.cam.pos)]).sort((a, b) => a[1] - b[1]);
  for (let n = 0; n < 3; n++) { const c = pj[n][0], fl = 0.97 + 0.03 * Math.sin(time * 31 + n * 2) * Math.sin(time * 17.3);
    U.uJp.value[n].set(c.P.x, c.P.y, c.P.z, 4.2 * fl * Lh * (0.28 + 0.72 * Math.exp(-pj[n][1] / 140)));   /* чужие кадры приглушены, свой — в полную силу */ U.uJc.value[n].set(c.C.x, c.C.y, c.C.z, c.W); U.uJn.value[n].set(c.n.x, c.n.y, c.n.z, c.H); U.uJs.value[n].copy(c.sc); U[`tJ${n}`].value = c.tex; }
  pj.forEach(([c, d], n) => { if (c.video) { const on = n < 3 && Lh > 0.01; if (on && c.video.paused) c.video.play().catch(() => {}); else if (!on && !c.video.paused) c.video.pause(); } c.beam.visible = n < 4 && Lh > 0.01; c.beam.material.uniforms.uK.value = 0.03 * Lh; });
  FX.petals.material.uniforms.uO.value = 0.85 * clamp01((-cp.z - 1700) / 150) * clamp01((2600 + cp.z) / 150);
  // вентилятор: на подходе к шахте раскручивается, гонит пыль на зрителя
  const F = FX.fan, spin = smooth(clamp01((pSm - 0.93) / 0.05));
  F.speed += (spin * 7 - F.speed) * Math.min(1, dt * 1.5); F.rot += F.speed * dt;
  F.bi.setMatrixAt(0, M(V(0, F.cy, F.z), [0, 0, F.rot], V(F.k, F.k, F.k * 0.3))); F.bi.instanceMatrix.needsUpdate = true;
  const dp = FX.vdust.geometry.attributes.position;
  for (let n = 0; n < dp.count; n++) { let zz = dp.getZ(n) + dt * (6 + F.speed * 55); if (zz > F.z + 1300) zz = F.z + 10; dp.setZ(n, zz); }
  dp.needsUpdate = true; FX.vdust.material.opacity = 0.25 + 0.5 * spin;
  // ролик
  if (!promo.on && pSm > 0.2) { promo.on = true; promo.v.play().then(() => promo.m.material.color.set(0xffffff)).catch(() => addEventListener('pointerdown', () => promo.v.play().then(() => promo.m.material.color.set(0xffffff)), { once: true })); }
  ovs.forEach(o => o.el.classList.toggle('on', pSm >= o.a && pSm <= o.b)); caption(pSm);
  pctEl.textContent = `${String(Math.round(pSm * 100)).padStart(3, '0')}% · 20_26`;
  updateRays(); grain.uniforms.uT.value = time;
  { const fk = smooth(clamp01((pSm - 0.94) / 0.045)); finale.uniforms.uK.value = fk; finale.uniforms.uT.value = time;
    _sp.set(0, VENT.cy, ZN.fan).project(camera); finale.uniforms.uC.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5);
    finale.uniforms.uW.value = pSm > 0.972 ? ((time * 0.45) % 1.6) : 0; }
  composer.render();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// запечённый свет (Blender, Cycles): 7 кусков по локациям; когда все на месте — заменяют собой живой расчёт
const BAKED = { on: false };
const BAKE_K = { c0: 0.5, c1: 0.6, c2: 0.7, c3: 0.6, c4: 0.11, c5: 0.13, c6: 0.12 };   // экспозиция локаций после нормировки
async function loadBaked() {
  const names = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'], gl = new GLTFLoader(), meshes = [];
  try {
    const scales = await (await fetch('assets/baked/scales.json')).json();
    for (const n of names) {
      const [g, t] = await Promise.all([gl.loadAsync(`assets/baked/${n}.glb`), texL.loadAsync(`assets/baked/${n}.jpg`)]);
      t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
      const mt = litMat({ baked: t, ck: BAKE_K[n] * Math.min(scales[n], 40) });
      g.scene.traverse(o => { if (!o.isMesh) return; const ge = o.geometry; ge.setAttribute('aLM', ge.attributes.uv); ge.setAttribute('aCol', ge.attributes.color);
        const m = new THREE.Mesh(ge, mt); o.updateMatrixWorld(true); m.applyMatrix4(o.matrixWorld); m.frustumCulled = false; meshes.push(m); });
    }
  } catch (e) { console.warn('запечённый свет не загружен, остаётся живой расчёт', e); return; }
  scene.traverse(o => { if (o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uAmb && !o.material.defines?.BAKED && o !== FX.fan.bi) o.visible = false; });
  meshes.forEach(m => scene.add(m)); BAKED.on = true;
}

// мокрый пол: настоящее отражение (Reflector, половинное разрешение) там, где на бетоне лужи
function buildWetFloor() {
  const shader = {
    uniforms: { color: { value: new THREE.Color(1, 1, 1) }, tDiffuse: { value: null }, textureMatrix: { value: null }, tStain: U.tStain, uHaze: U.uHaze, uHazeK: U.uHazeK },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D tDiffuse, tStain; uniform vec3 color; ${HAZE} varying vec4 vUv; varying vec3 vW;
      void main(){
        if (vW.z < -1512.0 && vW.z > -1840.0) discard;   // над колодцем пола нет
        float pud = texture2D(tStain, vW.xz / 300.0).g, wet = 0.3 + 0.7 * smoothstep(0.3, 0.65, pud);
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

// страница кейса поверх мегаструктуры: открывается по кнопке «читать кейс», закрывается крестиком или Esc
const pageEl = document.getElementById('page');
function openCase() {
  const id = (location.hash.match(/^#case\/(\w+)/) || [])[1], c = id && CASES[id];
  if (!c) { pageEl.classList.remove('on'); document.documentElement.classList.remove('lock'); return; }
  const sh = SHOTS.find(t => t.id === id) || {}, ps = c.pass || {};
  pageEl.querySelector('.in').innerHTML = `<span class="t" style="color:var(--red)">${sh.loc || ''}</span><h1>${c.title || ''}</h1>
    <div class="ps">${Object.entries(ps).map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}${(c.awards || []).length ? `<div><b>награды</b>${c.awards.join('<br>')}</div>` : ''}</div>
    ${c.task ? `<h3>задача</h3><p class="big">${c.task}</p>` : ''}${c.idea ? `<h3>идея</h3><p class="big">${c.idea}</p>` : ''}
    ${(c.how || []).length ? `<h3>как сделали</h3>${c.how.map(([src, a, b]) => `<figure><img src="${src}" alt="" loading="lazy"><figcaption><b>${a || ''}</b>${b ? ' — ' + b : ''}</figcaption></figure>`).join('')}` : ''}
    ${(c.result || []).length ? `<h3>результат</h3><div class="res">${c.result.map(([a, b]) => `<div><b>${a}</b>${b}</div>`).join('')}</div>` : ''}
    <a class="btn" href="#">хочу так же</a>`;
  pageEl.scrollTop = 0; pageEl.classList.add('on'); document.documentElement.classList.add('lock');
}
addEventListener('hashchange', openCase);
pageEl.querySelector('.x').addEventListener('click', () => { history.pushState('', '', location.pathname + location.search); openCase(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && pageEl.classList.contains('on')) pageEl.querySelector('.x').click(); });

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
await document.fonts.load('520 64px TT').catch(() => {});
await buildLogo();
buildWorld(slot); buildLight(); buildNeon(); buildReel(); buildWetFloor(); buildTimeline();
if (!new URLSearchParams(location.search).has('live')) await loadBaked();
renderer.compile(scene, camera);
window.__mega = { cam: camera, composer, bloom, fanMesh: FX.fan.bi, LAMPS, SHAFTS, glows: FX.glows, U, rigAt: q => { camTarget(q); return [camT.toArray(), look.toArray()]; }, go: p => { scrollTo(0, toRaw(p) * (document.documentElement.scrollHeight - innerHeight)); pSm = p; snapCam = true; }, STOPS: () => SHOTS.map(c => [c.id, +c.pMid.toFixed(4)]), SHOTS, CP, renderer, scene };
const AT = new URLSearchParams(location.search).get('p'); if (AT) window.__mega.go(+AT);
frame();
await new Promise(res => { const t0 = performance.now(); let calm = 0; const tick = () => { calm = LOAD.total === LOAD.loaded ? calm + 1 : 0; if (calm > 3 || performance.now() - t0 > 30000) return res(); setTimeout(tick, 150); }; tick(); });
document.getElementById('loader').classList.add('done'); document.documentElement.classList.remove('lock'); openCase();
