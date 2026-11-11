// Oxygen — мир из кварталов. Искра ведёт камеру по двум маршрутам; у каждой зоны своя пространственная идея,
// свой материал, свет и небо. Кейсы пока — кубы-плейсхолдеры с подписью.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const RED = 0xf40709, CREAM = 0xe1d9cf;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = t => t * t * (3 - 2 * t);
const rng = a => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------- загрузка: прелоадер считает модели и текстуры ----------
const LOAD = { a: 0, b: 0, last: performance.now(), t0: performance.now() };
THREE.DefaultLoadingManager.onProgress = (u, a, b) => { Object.assign(LOAD, { a, b, last: performance.now() }); document.getElementById('loadPct').textContent = String(Math.min(99, Math.round(a / b * 100))).padStart(2, '0') + '%'; };
const settled = () => new Promise(res => { const tick = () => { const now = performance.now(); if ((LOAD.a >= LOAD.b && now - LOAD.last > 400 && now - LOAD.t0 > 2200) || now - LOAD.t0 > 20000) res(); else setTimeout(tick, 150); }; tick(); });

// ---------- рендер ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// два уровня качества: десктоп — отражения, мягкие тени в углах, сглаживание; телефоны — облегчённо
const HQ = !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) && innerWidth >= 900;
renderer.setPixelRatio(Math.min(devicePixelRatio, HQ ? 1.5 : 1.25)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); scene.fog = new THREE.FogExp2(0x000000, 0);   // дымка — только в пилотных локациях
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 700);   // дальняя плоскость 700 м: дальше мир не рисуется вовсе
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 })); composer.addPass(new RenderPass(scene, camera));
const gtao = HQ ? new GTAOPass(scene, camera, innerWidth, innerHeight) : null;   // мягкие тени в углах и под предметами
if (gtao) { gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12 }); gtao.blendIntensity = 0.85; composer.addPass(gtao); const r0 = gtao.render.bind(gtao); gtao.render = (...a) => { const v = WETS.map(o => o.m.visible); WETS.forEach(o => { o.m.visible = false; }); r0(...a); WETS.forEach((o, i) => { o.m.visible = v[i]; }); }; }   // зеркала не пересчитываются ради затенения
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.5, 0.86); composer.addPass(bloom); composer.addPass(new OutputPass());
// плёнка: зерно, виньетка, лёгкая хроматическая аберрация по краям и мягкий контраст
// фильтр камеры: у каждой локации свой грейдинг — насыщенность, оттенок, контраст, зерно, виньетка, аберрация;
// red — сколько красного сохранять при обесцвечивании (в ai кадр чёрно-белый, а искра остаётся красной)
const GRADE0 = { sat: 1, con: 0.18, grain: 0.045, vig: 0.55, ca: 1, red: 0, tint: [1, 1, 1] };
const film = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uSat: { value: 1 }, uCon: { value: 0.18 }, uGrain: { value: 0.045 }, uVig: { value: 0.55 }, uCA: { value: 1 }, uRed: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uSat, uCon, uGrain, uVig, uCA, uRed; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d); vec2 ca = d * 0.0035 * r2 * 4.0 * uCA;
      vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), red = smoothstep(0.22, 0.45, c.r - max(c.g, c.b));   // только чистый красный бренда, тёплый кремовый не считается
      c = mix(vec3(l), c, mix(uSat, max(uSat, 1.0), red * uRed));      // насыщенность, красный можно сохранить
      c *= uTint;                                                        // оттенок
      c = mix(c, c * c * (3.0 - 2.0 * c), uCon);                         // S-кривая
      c *= 1.0 - smoothstep(0.18, 0.85, r2 * 1.6) * uVig;                // виньетка
      c += (h(vUv * 1000.0 + uT) - 0.5) * uGrain;                        // зерно
      gl_FragColor = vec4(c, 1.0); }` });
composer.addPass(film);

// свет: небо-полусфера, ключевой с тенью (ездит за камерой), искра и три «лампы зоны» — их число постоянно, шейдеры не пересобираются
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 0); key.castShadow = true; scene.add(key, key.target);
Object.assign(key.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 600 }); key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.5;
const lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 40, 1.6); scene.add(l); return l; });

// ---------- материалы ----------
// бетон: опалубочные швы, отверстия от стяжек, разводы и потёки — одна процедурная текстура, тонируется под квартал
function concreteTex(seed, base) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) { const x = r() * 512, y = r() * 512, rad = 10 + r() * 70, v = r() < 0.5 ? 0 : 255, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${v},${v},${v},${0.04 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const id = g.getImageData(0, 0, 512, 512), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
  g.strokeStyle = 'rgba(30,30,30,.35)'; g.lineWidth = 2;
  for (let y = 0; y <= 512; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let x = 0; x <= 512; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  g.fillStyle = 'rgba(25,25,25,.55)'; for (let y = 32; y < 512; y += 64) for (let x = 32; x < 512; x += 64) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(15,15,15,${0.03 + r() * 0.06})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 40 + r() * 160); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const TEX = { light: concreteTex(7, 182), dark: concreteTex(19, 120), clean: cleanTex() };
// чистый бетон для монументальных объёмов: ровный тон, едва заметные швы опалубки и редкие стяжки
function cleanTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), r = rng(77);
  g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) { const x = r() * 512, y = r() * 512, rad = 40 + r() * 120, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${r() < 0.5 ? 0 : 255},0,0,0)`); gr.addColorStop(0, `rgba(128,128,128,${0.012 + r() * 0.02})`); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const id = g.getImageData(0, 0, 512, 512), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
  g.strokeStyle = 'rgba(60,60,60,.16)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  g.fillStyle = 'rgba(70,70,70,.22)'; [[128, 128], [384, 128], [128, 384], [384, 384]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const clean = (tint, rough = 0.9, side = THREE.FrontSide) => memo(`k${tint}|${rough}|${side}`, () => new THREE.MeshStandardMaterial({ color: tint, map: TEX.clean, bumpMap: TEX.clean, bumpScale: 0.35, roughness: rough, metalness: 0, side }));
const conc = (tint, dark = false, rough = 0.93) => memo(`c${tint}|${dark}|${rough}`, () => new THREE.MeshStandardMaterial({ color: tint, map: dark ? TEX.dark : TEX.light, bumpMap: dark ? TEX.dark : TEX.light, bumpScale: 1.2, roughness: rough, metalness: 0 }));
const MEMO = new Map(), memo = (key, make) => MEMO.get(key) || MEMO.set(key, make()).get(key);   // один материал на сочетание параметров — меньше мешей после слияния
const matte = (c, rough = 0.85, metal = 0) => memo(`m${c}|${rough}|${metal}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
const steelM = () => matte(0xb8b8b8, 0.3, 0.9);
const glow = (c, k = 1.6) => memo(`g${c}|${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }));

// коробка с UV в метрах: текстура бетона ложится одинаково на любой габарит (6 м на плитку)
const TILE = 6;
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * s[f][0] / TILE, uv.getY(k) * s[f][1] / TILE); }
  return g;
}
// PBR-бетон с Poly Haven (CC0, авторы — в CREDITS.md): цвет, шероховатость, нормали; span — сколько метров на один повтор текстуры
const texL = new THREE.TextureLoader();
const pbrSet = (id, span) => { const k = TILE / span, f = n => { const t = texL.load(`assets/ph/${id}_${n}_1k.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(k, k); t.anisotropy = 8; return t; }; const m = f('diff'); m.colorSpace = THREE.SRGBColorSpace; return { map: m, roughnessMap: f('rough'), normalMap: f('nor') }; };
const PBR = { floor: pbrSet('smooth_concrete_floor', 4), wall: pbrSet('concrete_slab_wall', 3) };
const ENV = { tex: null, mats: [] };   // окружение из HDRI — только для материалов пилотных локаций
const pbr = (set, tint, rough = 1, side = THREE.FrontSide, envI = 0.55) => memo(`p${set}|${tint}|${rough}|${side}|${envI}`, () => { const m = new THREE.MeshStandardMaterial({ color: tint, ...PBR[set], roughness: rough, metalness: 0, side, envMapIntensity: envI }); m.normalScale.set(0.8, 0.8); ENV.mats.push(m); return m; });
// цилиндр (стена ротонды) с UV в метрах
function cylGeo(r, h, a0, a1, seg = 96) { const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, a0, a1 - a0), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * (a1 - a0) / TILE, uv.getY(i) * h / TILE); return g; }
// набор зоны: геометрия копится по материалам и сливается в один меш на материал — мало вызовов отрисовки, тени от всего
class Kit {
  constructor() { this.parts = new Map(); }
  put(mat, g) { if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); return g; }
  // y — низ коробки
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { const g = boxGeo(w, h, d); g.applyMatrix4(new THREE.Matrix4().compose(V(x, y + h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1))); return this.put(mat, g); }
  geo(mat, g, x, y, z, ry = 0, rx = 0, rz = 0) { g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1))); return this.put(mat, g.index ? g : g); }
  flush(group, shadows = true) {
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list.map(g => g.index ? g : g), false); if (!geo) { console.warn('merge', mat); continue; }
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = shadows && !mat.isMeshBasicMaterial; group.add(m);
    }
  }
}

// подпись над кубом: имя кейса и номер остановки
function labelTex(title, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#F40709'; g.font = '400 40px AP, monospace'; g.fillText(sub, 8, 56);
  g.fillStyle = '#E1D9CF'; let fs = 120; g.font = `520 ${fs}px TT, sans-serif`; while (g.measureText(title).width > 1000) { fs -= 6; g.font = `520 ${fs}px TT, sans-serif`; } g.fillText(title, 4, 200);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signTex(lines, w = 2048, h = 512, col = '#E1D9CF') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = col; lines.forEach(([txt, font, y]) => { g.font = font; g.fillText(txt, 0, y); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

await Promise.all([document.fonts.load('520 100px TT'), document.fonts.load('20px AP')]);   // подписи рисуются на canvas — шрифты нужны до сборки
// ---------- зоны ----------
// k, n — ключ и номер; sky — [зенит, середина, горизонт]; hemi — [небо, земля, сила]; key — [цвет, сила, направление на свет];
// sun — [направление, цвет, сила] для диска в небе; rects — прямоугольники зоны в плане [x0, x1, z0, z1]
const ZL = [], Z = {};
function zone(k, o) { const z = Object.assign({ k, exp: 1, hdr: 0, fog: 0, wet: [], grade: {}, g: new THREE.Group(), kit: new Kit(), paths: { btl: [], atl: [] }, cubes: [], anchors: [], rects: [], bloom: 1, sun: [V(0, 0.2, 1), 0x000000, 0] }, o); scene.add(z.g); ZL.push(z); Z[k] = z; return z; }
const PLINTH = conc(0x3a3836, true);
const LABELS = [];   // подписи кубов: вплотную гаснут, чтобы не лезть в кадр
// куб-плейсхолдер кейса. r — маршрут (btl на земле, atl над городом); у atl куб стоит на консоли или парит
function cube(q, x, y, z, title, r, o = {}) {
  const s = o.s || 5, mat = o.mat || matte(CREAM, 0.55);
  if (o.perch) { q.kit.box(o.plinth || PLINTH, s + 3, 0.8, s + 3, x, y - 0.8, z); if (o.perch === 'mast') q.kit.box(o.plinth || PLINTH, 1.4, y - 0.8, 1.4, x, 0, z); }
  else if (!o.float) q.kit.box(o.plinth || PLINTH, s + 2, 0.8, s + 2, x, y, z);
  const top = o.float ? y : o.perch ? y : y + 0.8;
  q.kit.box(mat, s, s, s, x, top, z);
  q.kit.box(glow(r === 'atl' ? CREAM : RED, 1.4), s + 0.06, 0.12, 0.12, x, top + s - 0.06, z - s / 2 - 0.02);
  q.cubes.push({ p: V(x, top + s / 2, z), title, r });
  const n = String(q.cubes.filter(c => c.r === r).length).padStart(2, '0');
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: labelTex(title, `{${q.n}·${r || 'финал'}${r ? '·' + n : ''}} ${q.t}`), transparent: true, depthWrite: false, toneMapped: false }));
  lab.position.set(x, top + s + 2.2, z); lab.rotation.y = Math.PI; q.g.add(lab); LABELS.push(lab);
}
const path = (q, r, ...pts) => pts.forEach(p => q.paths[r].push(V(...p)));

// крыши: старт и нейтральная локация стоят на поверхности города, на высоте ROOF; в азии маршруты ныряют вниз
const ROOF = 110;   // поверхность города: на ней старт и нейтральная, вровень с ней — крыши азии
function lift(q, h) { q.g.position.y += h; for (const r of ['btl', 'atl']) q.paths[r].forEach(p => p.y += h); q.trunk?.forEach(p => p.y += h); q.cubes.forEach(c => c.p.y += h); q.anchors.forEach(a => a.p.y += h); }

// {00} старт — закрытый барабан из тонких бетонных рёбер на крыше. сквозь щели между рёбрами солнце кладёт на пол веер полос.
// выходы не дыры: btl — щель в рёбрах с красными кромками и светящаяся дорожка, atl — световое кольцо в окулюсе, сквозь которое камера поднимается
function rotunda() {
  const R = 40, q = zone('fork', { grade: { sat: 0.85, con: 0.2, tint: [0.98, 0.99, 1.02] },  hdr: 1, fog: 0.0007, n: '00', t: 'старт', line: 'барабан из рёбер: btl — в щель, atl — сквозь световое кольцо', exp: 1.05, sky: ['#121212', '#333333', '#707070'], hemi: [0x8a8a8a, 0x161616, 0.3], key: [0xf2f2f2, 4.6, V(-0.8, 0.38, 0.3)], bloom: 1, spark: 12 });
  const k = q.kit, W = pbr('wall', 0x9a9a9a), Wd = pbr('wall', 0x6a6a6a, 1, THREE.DoubleSide), floor = pbr('floor', 0x3a3a3a, 0.9), red = glow(RED, 1.4), cr = glow(CREAM, 0.6);
  q.rects.push([-56, 56, -56, R + 4]);
  k.box(pbr('floor', 0x5a5a5a), 440, 2, 2 * R + 16, 0, -2, 0);   // поверхность вокруг барабана
  k.box(floor, 2 * R + 6, 0.3, 2 * R + 6, 0, -0.3, 0);
  const N = 72, gap = 0.16;
  for (let i = 0; i < N; i++) {
    const t = i / N * Math.PI * 2, x = Math.sin(t) * R, z = Math.cos(t) * R, d = Math.min(t, Math.PI * 2 - t);
    if (d < gap) continue;
    k.box(W, 1.2, 54, 6, x, 0, z, t);
    if (d < gap + 0.09) k.box(red, 0.12, 54, 0.12, Math.sin(t) * (R - 3.05), 0, Math.cos(t) * (R - 3.05), t);   // красные кромки щели btl
  }
  [54, 56].forEach(y => k.geo(Wd, new THREE.RingGeometry(R - 12, R + 3.5, 128, 1), 0, y, 0, 0, Math.PI / 2));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(R - 12, 0.22, 8, 160), glow(0xfff0dc, 2)); halo.rotation.x = Math.PI / 2; halo.position.y = 53.6; q.g.add(halo);   // кольцо atl
  [[8, cr], [R - 12, cr]].forEach(([rr, m]) => { const g = new THREE.Mesh(new THREE.RingGeometry(rr - 0.12, rr, 160), m); g.rotation.x = -Math.PI / 2; g.position.y = 0.03; q.g.add(g); });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.2, R - 8), red); lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.03, (R + 8) / 2); q.g.add(lane);   // светящаяся дорожка btl к щели
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R - 12, R - 12, 90, 96, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0dc).multiplyScalar(0.04), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  shaft.position.set(0, 45, 0); q.g.add(shaft);
  const floorText = (lines, x, z, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: signTex(lines), transparent: true, toneMapped: false, depthWrite: false })); m.rotation.set(-Math.PI / 2, 0, Math.PI); m.position.set(x, 0.05, z); q.g.add(m); };
  floorText([['btl · на земле', '400 130px AP, monospace', 170], ['вперёд →', '520 220px TT, sans-serif', 440]], -4, R - 14, 12);
  floorText([['atl · над городом', '400 130px AP, monospace', 170], ['вверх ↑', '520 220px TT, sans-serif', 440]], 0, 4, 12);
  q.trunk = [V(0, 6, -30), V(0, 6.5, -12), V(0, 7, 0)];
  path(q, 'btl', [0, 6.5, 20], [0, 6.5, R + 10]);
  path(q, 'atl', [0, 18, 5], [0, 40, 8], [0, 62, 16], [0, 60, R + 10]);
  lift(q, ROOF);
  return R;
}

// {01} нейтральная — тёмно-серая поверхность города: гладкие плиты, в них световые прорези (под поверхностью живёт город),
// огромные чёрные кубы, утопленные в плиты. btl идёт по поверхности, atl летит над ней; кубы atl держит столб света
function neutral(z0) {
  const q = zone('neutral', { grade: { sat: 0.7, con: 0.26, grain: 0.05, tint: [0.95, 0.98, 1.04] },  hdr: 1, fog: 0.0012, n: '01', t: 'нейтральная', line: 'тёмно-серая поверхность: световые прорези, чёрные кубы-гиганты', exp: 0.9, sky: ['#0c0c0c', '#262626', '#4e4e4e'], hemi: [0x9a9a9a, 0x1c1c1c, 0.75], key: [0xf0f0f0, 3.8, V(-0.8, 0.3, 0.55)], bloom: 1, sun: [V(-0.8, 0.18, 0.6).normalize(), 0xffffff, 0.7], spark: 9 });
  const z1 = z0 + 400, mid = (z0 + z1) / 2, k = q.kit, S = pbr('floor', 0x5a5a5a), blk = matte(0x141414, 0.35, 0.15), ln = glow(0xf2efe9, 0.6);
  q.rects.push([-220, 220, z0, z1]);
  k.box(S, 440, 2, z1 - z0, 0, -2, mid);
  [-90, -30, 30, 90].forEach(x => k.box(ln, 0.45, 0.06, z1 - z0, x, 0, mid));             // продольные прорези
  for (let z = z0 + 40; z < z1; z += 80) { k.box(ln, 440, 0.06, 0.45, 0, 0, z); [-90, -30, 30, 90].forEach(x => k.box(ln, 2.6, 0.07, 2.6, x, 0, z)); }   // поперечные и колодцы на узлах
  const r = rng(91); [[-120, z0 + 90, 34], [150, z0 + 160, 46], [-170, z0 + 260, 40], [110, z0 + 330, 30], [-70, z0 + 380, 22], [190, z0 + 40, 26]].forEach(([x, z, a]) => k.box(blk, a, a, a, x, -a * (0.25 + r() * 0.3), z, r() * 0.6));   // кубы-гиганты, утопленные в плиты
  [['ozon селект', 40], ['золотые ворота', 110], ['белград', 180], ['связь есть везде', 250], ['гусь на заводе', 320]].forEach(([t, dz], i) => cube(q, i % 2 ? 9 : -9, 0, z0 + dz, t, 'btl', { plinth: blk }));
  [['дербент', 75], ['tevredens', 145], ['заклинатели', 215], ['дино', 285]].forEach(([t, dz], i) => { const x = i % 2 ? 14 : -14, z = z0 + dz;
    cube(q, x, 34, z, t, 'atl', { float: true }); k.geo(glow(0xf2efe9, 0.7), new THREE.CylinderGeometry(0.12, 0.12, 34, 8), x, 17, z); k.box(ln, 6, 0.07, 6, x, 0, z); });   // столб света под кубом
  path(q, 'btl', [0, 6.5, z0 + 6], [1.5, 7, z0 + 80], [-1, 7.5, z0 + 160], [1.5, 7, z0 + 240], [0, 7, z0 + 330], [0, 6.5, z1]);
  path(q, 'atl', [0, 52, z0 + 20], [-2, 46, z0 + 120], [2, 46, z0 + 220], [-2, 44, z0 + 320], [0, 36, z1]);
  // парапеты: после последнего кейса блока вдоль дороги встают две низкие стенки с кремовой линией — они же уходят вниз по лестнице азии
  const P = pbr('wall', 0x6a6a6a); for (const sd of [-1, 1]) { k.box(P, 0.5, 1.1, z1 - (z0 + 350), sd * 10.6, 0, (z0 + 350 + z1) / 2); k.box(glow(0xf2efe9, 0.9), 0.12, 0.05, z1 - (z0 + 350), sd * 10.6, 1.1, (z0 + 350 + z1) / 2); }
  // облака: невидимые плиты высоко над поверхностью, их тени плывут по плитам — свет всё время играет
  const cl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), 26), dm = new THREE.Object3D(), cr = rng(5);
  q.clouds = []; for (let i = 0; i < 26; i++) q.clouds.push({ x: (cr() - 0.5) * 520, z: z0 - 120 + cr() * (z1 - z0 + 240), w: 30 + cr() * 60, d: 40 + cr() * 80 });
  cl.castShadow = true; cl.frustumCulled = false; q.g.add(cl); q.cloudMesh = cl; q.cloudDm = dm;
  lift(q, ROOF);
  return z1;
}

// {02} азия — прорезь в поверхности города: крыши башен вровень с нейтральной поверхностью, переулок уходит вниз.
// btl спускается по монументальной лестнице на улицу, atl ныряет в прорезь и идёт по уровню зданий
function asia(z0) {
  const q = zone('asia', { grade: { sat: 1.18, con: 0.32, grain: 0.06, vig: 0.72, ca: 1.8, tint: [1.05, 0.97, 0.95] },  fog: 0.0045, n: '02', t: 'азия', line: 'прорезь в поверхности: лестница вниз, чёрные башни, красные вывески-лезвия', sky: ['#050102', '#3a0608', '#8a1010'], hemi: [0xa04048, 0x1a0808, 0.6], key: [0xff7a6a, 2.2, V(0.3, 1, -0.2)], bloom: 1.2, sun: [V(0, 0.32, 1).normalize(), 0xff2a1a, 2.2], spark: 18 });
  const DS = 230, z1 = z0 + 460, k = q.kit, r = rng(31), B = pbr('wall', 0x2a2828, 0.8, THREE.FrontSide, 0.12), red = glow(RED, 1.5), cr = glow(0xffe0d0, 1.1), tor = matte(0x9a0608, 0.5), step = pbr('floor', 0x2e2828, 0.9, THREE.FrontSide, 0.1), S = pbr('floor', 0x5a5a5a);
  const gy = z => z < z0 + DS ? ROOF * (1 - smooth(clamp01((z - z0) / DS))) : 0;   // высота улицы: плавный спуск с поверхности
  q.rects.push([-70, 70, z0, z1]);
  for (let z = z0; z < z0 + DS; z += 1.6) k.box(step, 22, Math.max(0.3, gy(z + 0.8)), 1.6, 0, 0, z + 0.8);   // лестница
  const P = clean(0x5a5a5a, 0.6); for (let z = z0; z < z0 + DS + 40; z += 1.6) for (const sd of [-1, 1]) { const y = gy(z + 0.8); k.box(P, 0.5, 1.1, 1.7, sd * 10.6, y, z + 0.8); k.box(glow(0xf2efe9, 0.9), 0.12, 0.05, 1.7, sd * 10.6, y + 1.1, z + 0.8); }   // парапет с поверхности спускается вниз вместе с лестницей
  k.box(pbr('floor', 0x241e1e, 0.9, THREE.FrontSide, 0.1), 22, 0.3, z1 - z0 - DS, 0, -0.3, (z0 + DS + z1) / 2);
  q.wet.push({ w: 22, d: z1 - z0 - DS, x: 0, y: 0.03, z: (z0 + DS + z1) / 2, k: 0.75 });   // мокрая улица: в лужах красные вывески
  for (const sd of [-1, 1]) k.box(S, 180, 2, z1 - z0, sd * 130, ROOF - 2, (z0 + z1) / 2);   // поверхность города продолжается над кварталом
  for (const s of [-1, 1]) for (let z = z0; z < z1;) {
    const L = 9 + r() * 10, d = 30, x = s * (11 + d / 2), zc = z + L / 2, g0 = gy(z + L);
    k.box(B, d, ROOF, L, x, 0, zc);   // башни: крыши вровень с поверхностью
    for (let i = 0, n = g0 > ROOF - 24 ? 0 : 1 + (r() * 4 | 0); i < n; i++) { const hh = 5 + r() * Math.min(12, ROOF - g0 - 14), y = g0 + 4 + r() * Math.max(0, ROOF - g0 - hh - 8); k.box(r() < 0.8 ? red : cr, 0.5, hh, 2.6, s * 9.4, y, z + 1 + r() * (L - 2)); }
    z += L + 1.4 + r() * 2;   // щели между башнями — красные прорези света, видны и сверху, с поверхности
  }
  for (let z = z0 + 30; z < z1 - 10; z += 13) { if (gy(z) > ROOF - 26) continue; const y = gy(z) + 9 + r() * 8; for (let x = -10; x <= 10; x += 1.6) { const sag = (1 - (x / 10) ** 2) * 1.6; k.box(red, 0.55, 0.7, 0.55, x, y - sag, z); } }
  for (let z = z0 + DS + 20; z < z1 - 10; z += 31) { const y = 30 + r() * 16; for (let x = -10; x <= 10; x += 2.2) k.box(r() < 0.3 ? cr : red, 0.4, 0.4, 0.4, x, y - (1 - (x / 10) ** 2) * 2.4, z); }
  for (let i = 0; i < 3; i++) { const z = z0 + DS + 30 + i * 70; [-8.5, 8.5].forEach(x => k.geo(tor, new THREE.CylinderGeometry(0.45, 0.55, 15, 12), x, 7.5, z)); k.box(tor, 22, 0.9, 1.1, 0, 15, z); k.box(tor, 19, 0.6, 0.7, 0, 12.6, z); q.anchors.push({ p: V(0, 13, z), c: 0xff3020, i: 70 }); }
  for (let z = z0 + 40; z < z0 + DS; z += 60) q.anchors.push({ p: V(0, gy(z) + 14, z), c: 0xff3020, i: 60 });
  [['ozon corp', DS + 60], ['т-банк', DS + 170]].forEach(([t, dz], i) => cube(q, i % 2 ? 6.5 : -6.5, 0, z0 + dz, t, 'btl', { s: 3.6 }));
  [['хроники ижоры', DS + 20, -7], ['треснутые', DS + 130, 7]].forEach(([t, dz, x]) => { k.box(B, 8, 1.2, 8, x + Math.sign(x) * 0.5, 44.8, z0 + dz); cube(q, x, 46, z0 + dz, t, 'atl', { s: 3.6, perch: 'slab', plinth: B }); q.anchors.push({ p: V(0, 52, z0 + dz), c: 0xff4030, i: 50 }); });
  path(q, 'btl', ...[10, 50, 90, 130, 170, 210].map(dz => [0, gy(z0 + dz) + 6.5, z0 + dz]), [1.5, 6, z0 + DS + 30], [-1.5, 6, z0 + DS + 110], [1, 5.5, z0 + DS + 190], [0, 6, z1]);
  path(q, 'atl', [0, ROOF + 26, z0 + 10], ...[70, 130, 190].map(dz => [0, Math.max(50, gy(z0 + dz) + 50), z0 + dz]), [1, 50, z0 + DS + 20], [-1, 50, z0 + DS + 130], [0, 54, z1 - 30], [0, 58, z1]);
  return z1;
}

// {03} спорт — внутри чаши стадиона: btl по полю между кубами, atl пролетает над полем на уровне верхних ярусов
function sport(z0) {
  const q = zone('sport', { grade: { sat: 0.75, con: 0.22, grain: 0.035, vig: 0.45, tint: [0.95, 1.0, 1.06] },  fog: 0.0022, n: '03', t: 'спорт', line: 'чаша стадиона: btl по полю, atl на уровне верхних ярусов', sky: ['#05070a', '#1c2228', '#cfd4d8'], hemi: [0xb8bec4, 0x15171a, 0.5], key: [0xf4f6f8, 4.2, V(0.55, 1, 0.35)], sun: [V(0, 0.05, 1), 0xffffff, 0.3], spark: 6 });
  const z1 = z0 + 400, k = q.kit, cz = (z0 + z1) / 2, C = pbr('wall', 0x8a8e92, 1, THREE.FrontSide, 0.15), D = pbr('wall', 0x4a4e52, 1, THREE.FrontSide, 0.15), seat = pbr('wall', 0x34383c, 1, THREE.FrontSide, 0.1), steel = matte(0x9aa0a6, 0.4, 0.7);
  q.rects.push([-140, 140, z0, z1]);
  k.box(pbr('floor', 0x202326, 0.9, THREE.FrontSide, 0.1), 260, 0.3, z1 - z0, 0, -0.3, cz);
  q.wet.push({ w: 200, d: 330, x: 0, y: 0.03, z: cz, k: 0.6 });   // мокрое поле: в нём прожекторы
  const A = 62, Bz = 120, lines = [];
  for (let lane = 0; lane < 6; lane++) { const a = A - 4 - lane * 1.3, b = Bz - 4 - lane * 1.3; for (let t = 0; t < Math.PI * 2; t += Math.PI / 90) { const t2 = t + Math.PI / 90; lines.push(Math.cos(t) * a, 0.05, cz + Math.sin(t) * b, Math.cos(t2) * a, 0.05, cz + Math.sin(t2) * b); } }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); q.g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9aa0a6 })));
  for (let i = 0; i < 12; i++) {
    const s = 1.06 + i * 0.055, y = i * 3.4, a = A * s, b = Bz * s;
    for (let t = 0; t < Math.PI * 2; t += Math.PI / 60) {
      const x = Math.cos(t) * a, z = cz + Math.sin(t) * b; if (Math.abs(x) < 11 && y < 15) continue;
      const tx = -Math.sin(t) * a, tz = Math.cos(t) * b, L = Math.hypot(tx, tz) * Math.PI / 60 + 0.6, ry = Math.atan2(tx, tz);
      k.box(i % 3 === 2 ? D : seat, 6.4, 3.4, L, x, y, z, ry);
      if (i === 11) { k.box(C, 9, 1.2, L, Math.cos(t) * (a + 10), y + 9, cz + Math.sin(t) * (b + 10), ry); k.box(C, 1.4, 9, L, Math.cos(t) * (a + 3.4), y + 3.4, cz + Math.sin(t) * (b + 3.4), ry); }
    }
  }
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => { const x = sx * A * 1.95, z = cz + sz * Bz * 1.05; k.box(steel, 2.4, 78, 2.4, x, 0, z); k.box(D, 16, 9, 2, x - sx * 1.5, 74, z - sz * 1.2, Math.atan2(-x, cz - z)); const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), glow(0xffffff, 2.2)); p.position.set(x - sx * 3, 78.5, z - sz * 2.6); p.lookAt(0, 0, cz); q.g.add(p); });
  [[z0, z0 + 40], [z1 - 40, z1]].forEach(([a, b]) => { for (const s of [-1, 1]) k.box(C, 2, 12, b - a, s * 9, 0, (a + b) / 2); k.box(D, 20, 1.6, b - a, 0, 12, (a + b) / 2); q.anchors.push({ p: V(0, 9, (a + b) / 2), c: 0xe8eef4, i: 30 }); });
  [['ironstar', -70], ['шёлковый путь', 0], ['балтика 7', 70]].forEach(([t, dz], i) => cube(q, i % 2 ? 14 : -14, 0, cz + dz, t, 'btl'));
  // наверху чаши, на мачтах: синегривый лев и время авангарда
  cube(q, 22, 40, cz - 60, 'синегривый лев', 'atl', { perch: 'mast', plinth: D }); cube(q, -22, 40, cz + 50, 'время авангарда', 'atl', { perch: 'mast', plinth: D });
  path(q, 'btl', [0, 5, z0 + 4], [0, 6, z0 + 50], [1, 8, cz - 80], [-1, 10, cz], [1, 8, cz + 80], [0, 6, z1 - 50], [0, 5, z1]);
  path(q, 'atl', [0, 58, z0 + 10], [0, 52, z0 + 70], [2, 45, cz - 50], [2, 44, cz], [0, 46, cz + 60], [0, 54, z1 - 60], [0, 60, z1 - 10], [0, 58, z1 + 16]);
  return z1;
}

// {04} мерч — концепт-стор на два этажа: белая штукатурка, полированный пол, светящиеся потолки, рейлы с одеждой
// по стенам, чёрные глянцевые постаменты с красным контуром. btl — нижний этаж, atl — верхний
function merch(z0) {
  const q = zone('merch', { grade: { sat: 0.92, con: 0.1, grain: 0.022, vig: 0.25, ca: 0.3, tint: [1.02, 1.0, 0.97] },  n: '04', t: 'мерч', line: 'концепт-стор: белые залы, светящиеся потолки, рейлы, чёрные постаменты', exp: 0.9, sky: ['#d0c8be', '#e6e0d7', '#f6f2ec'], hemi: [0xffffff, 0xc8c0b4, 1.15], key: [0xfff6ea, 1.4, V(0.4, 1, 0.25)], bloom: 0.45, spark: 3 });
  const rooms = 4, L = 46, z1 = z0 + rooms * L, k = q.kit, mid = (z0 + z1) / 2;
  q.wet.push({ w: 36, d: z1 - z0, x: 0, y: 0.03, z: mid, k: 0.3, pol: 1, below: 16 }, { w: 36, d: z1 - z0, x: 0, y: 18.15, z: mid, k: 0.3, pol: 1, above: 16 });   // полированные полы обоих этажей
  const Wl = matte(0xe2dbd0, 0.92), FL = matte(0xd4cec4, 0.3, 0.05), blk = matte(0x0d0d0d, 0.22, 0.3), steel = matte(0xc8c8c8, 0.25, 0.9), lightP = glow(0xfff6ec, 0.95), red = glow(RED, 1.5);
  q.rects.push([-30, 30, z0 - 60, z1 + 10]);
  k.box(FL, 38, 0.3, z1 - z0, 0, -0.3, mid); k.box(Wl, 38, 2, z1 - z0, 0, 16, mid); k.box(FL, 36, 0.12, z1 - z0, 0, 18, mid); k.box(Wl, 38, 1, z1 - z0, 0, 34.5, mid);
  for (const s of [-1, 1]) k.box(Wl, 1.2, 35, z1 - z0, s * 18.6, 0, mid);
  for (let i = 0; i <= rooms; i++) { const z = z0 + i * L; for (const y0 of [0, 18]) { for (const s of [-1, 1]) k.box(Wl, 13.4, 16, 1.2, s * 11.7, y0, z); k.box(Wl, 10, 4, 1.2, 0, y0 + 12, z); } k.box(Wl, 36, 2, 1.2, 0, 16, z); }
  const clothes = [matte(0x111111, 0.8), matte(CREAM, 0.85), matte(0x2a2a2a, 0.8), matte(RED, 0.7)];
  for (let i = 0; i < rooms; i++) for (const y0 of [0, 18]) {
    const zc = z0 + i * L + L / 2;
    k.box(lightP, 26, 0.1, L - 10, 0, y0 + (y0 ? 16.3 : 15.8), zc);   // светящийся потолок
    q.anchors.push({ p: V(0, y0 + 12, zc), c: 0xfff4e6, i: 40 });
    for (const s of [-1, 1]) {
      k.box(steel, 0.12, 0.12, 16, s * 16.6, y0 + 9, zc); [-8, 8].forEach(o => k.box(steel, 2, 0.1, 0.1, s * 17.6, y0 + 9, zc + o));   // рейл на кронштейнах
      for (let j = 0; j < 9; j++) k.box(clothes[(j + i + (s > 0 ? 1 : 0)) % 3 === 0 && j === 4 ? 3 : (j + i) % 3], 0.35, 4.4, 1.3, s * 16.6, y0 + 4.5, zc - 7 + j * 1.75);
    }
  }
  [['мерч g-drive', 1], ['набор креатора', 2], ['мерч льва', 3]].forEach(([t, i]) => { const x = i % 2 ? 6 : -6, z = z0 + i * L + L / 2; k.box(red, 7.6, 0.05, 7.6, x, 0, z); cube(q, x, 0, z, t, 'btl', { plinth: blk }); });
  path(q, 'btl', [0, 5, z0 - 14], [0, 5, z0 + 6], [0, 5, z0 + 90], [0, 5, z1]);
  path(q, 'atl', [0, 36, z0 - 22], [0, 23.5, z0 - 6], [0, 23.5, z0 + 90], [0, 23.5, z1]);
  return z1;
}

// {05} ai — чёрная пустота: кремовая сетка гаснет к краям, монолиты проступают только в свете искры; atl парит среди монолитов
function ai(z0) {
  const q = zone('ai', { grade: { sat: 0, con: 0.36, grain: 0.07, vig: 0.65, ca: 0, red: 1 },  n: '05', t: 'ai-продакшн', line: 'пустота, кремовая сетка, монолиты в свете искры', sky: ['#000000', '#030303', '#0c0c0c'], hemi: [0x6a6a6a, 0x050505, 0.08], key: [0xe1d9cf, 0.35, V(0, 1, -0.4)], bloom: 1.3, spark: 55 });
  const z1 = z0 + 300, k = q.kit, r = rng(53), mono = matte(0x0a0a0a, 0.35, 0.2);
  q.rects.push([-120, 120, z0, z1]);
  k.box(matte(0x050505, 0.6), 240, 0.3, z1 - z0, 0, -0.3, (z0 + z1) / 2);
  const pts = [], col = [], c = new THREE.Color(CREAM);
  const seg = (ax, az, bx, bz) => { const f = p => Math.max(0, 1 - Math.abs(p) / 90) ** 1.5 * 0.55; pts.push(ax, 0.04, az, bx, 0.04, bz); [f(ax), f(bx)].forEach(v => col.push(c.r * v, c.g * v, c.b * v)); };
  for (let x = -108; x <= 108; x += 6) for (let z = z0; z < z1; z += 10) seg(x, z, x, z + 10);
  for (let z = z0; z <= z1; z += 6) for (let x = -108; x < 108; x += 6) seg(x, z, x + 6, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  q.g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })));
  const edges = [];
  for (let i = 0; i < 40; i++) {
    const s = i % 2 ? 1 : -1, x = s * (14 + r() * 90), z = z0 + 10 + r() * (z1 - z0 - 20), w = 1.2 + r() * 1.6, h = 24 + r() * 80, d = 5 + r() * 10, ry = (r() - 0.5) * 0.6;
    k.box(mono, w, h, d, x, 0, z, ry);
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); e.applyMatrix4(new THREE.Matrix4().compose(V(x, h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1))); edges.push(e);
  }
  q.g.add(new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: new THREE.Color(CREAM).multiplyScalar(0.28), toneMapped: false })));
  for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1; k.geo(glow(CREAM, 0.6), new THREE.CylinderGeometry(0.12, 0.12, 260, 6), s * (60 + r() * 50), 130, z0 + r() * (z1 - z0)); }
  const blk = matte(0x111111, 0.3, 0.3);
  [['ai · fonbet', 60], ['ai · mango', 120], ['ai · лавка', 180], ['ai · альфа', 240]].forEach(([t, dz], i) => cube(q, i % 2 ? 7 : -7, 27, z0 + dz, t, 'atl', { float: true, mat: blk }));
  path(q, 'btl', [0, 4.5, z0 + 4], [0, 5, z0 + 150], [0, 4.5, z1]);
  path(q, 'atl', [0, 26, z0 + 4], [1, 30, z0 + 150], [0, 32, z1 - 20], [0, 32, z1]);
  return z1;
}

// финал — чистая чернота после ai: ни стен, ни неба, только логотип, который проявляется в свете искры; искра встаёт в него
function ending(z0) {
  const q = zone('final', { grade: { sat: 1, con: 0.3, vig: 0.8, red: 1 },  n: '06', t: 'oxygen', line: 'чистая чернота: искра встаёт в логотип', sky: ['#000000', '#000000', '#000000'], hemi: [0x000000, 0x000000, 0], key: [0x000000, 0, V(0, 1, 0)], bloom: 1.3, spark: 34 });
  const cz = z0 + 160; q.rects.push([-120, 120, z0, cz + 60]);
  q.logoAt = V(0, 14, cz); q.look = V(0, 14, cz);
  path(q, 'btl', [0, 5.5, z0 + 12], [0, 9, z0 + 60], [0, 13, cz - 70], [0, 14, cz - 46]);
  path(q, 'atl', [0, 30, z0 + 12], [0, 22, z0 + 60], [0, 15, cz - 70], [0, 14, cz - 46]);
  return q;
}

// ---------- сборка мира: развилка → нейтральная → азия → спорт → мерч → ai → финал, оба маршрута через все локации ----------
const zR = rotunda(), zN = neutral(zR + 8), zA = asia(zN), zS = sport(zA), zM = merch(zS + 70), zI = ai(zM), FIN = ending(zI);
ZL.forEach(q => q.kit.flush(q.g));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), matte(0x050505, 1)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);

// небо: сфера вокруг камеры, градиент и диск солнца смешиваются по зонам
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSun: { value: V(0, 0.2, 1) }, uSunC: { value: new THREE.Color() }, uK: { value: 0 }, tHdr: { value: null }, uHdr: { value: 0 }, uHdrK: { value: 0.5 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uTop, uMid, uBot, uSunC, uSun; uniform float uK, uHdr, uHdrK; uniform sampler2D tHdr; varying vec3 vD;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec3 d = normalize(vD); float y = d.y; vec3 c = mix(uBot, uMid, smoothstep(0.0, 0.25, y)); c = mix(c, uTop, smoothstep(0.2, 0.8, y));
      float s = max(dot(d, normalize(uSun)), 0.0); c += uSunC * (pow(s, 700.0) * 4.0 + pow(s, 14.0) * 0.4) * uK;
      if (uHdr > 0.001) { vec2 e = vec2(atan(d.z, d.x) * 0.15915 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31831 + 0.5); vec3 hc = texture2D(tHdr, e).rgb * uHdrK;
        float l = dot(hc, vec3(0.2126, 0.7152, 0.0722)); hc = mix(hc, vec3(l), 0.65);   // небо почти без цвета — палитра бренда ахроматична
        c = mix(c, hc, uHdr * smoothstep(0.2, 0.46, y)); }   // горизонт HDRI (деревья) прячем в градиент — видны только облака
      c += (h(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
// грозовое небо HDRI: фон старта и нейтральной, оно же — отражения на бетоне
{
  const hdr = await new RGBELoader().loadAsync('assets/ph/approaching_storm_2k.hdr'); hdr.mapping = THREE.EquirectangularReflectionMapping;
  sky.material.uniforms.tHdr.value = hdr; ENV.tex = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  ENV.mats.forEach(m => { m.envMap = ENV.tex; m.needsUpdate = true; });
}
// мокрый бетон: плоское отражение поверх поверхности старта и нейтральной; лужи — по маске, в сухих местах отражение размыто
// горизонт поверхности: силуэт города в дымке по кругу вокруг камеры — закрывает деревья HDRI и даёт масштаб
const SKYLINE = { mesh: null }; const tmpL = new THREE.Vector3();
{
  const c = document.createElement('canvas'); c.width = 4096; c.height = 256; const g = c.getContext('2d'), r = rng(808);
  const layer = (shade, hMin, hMax, wMin, wMax) => { g.fillStyle = shade; for (let x = 0; x < 4096;) { const w = wMin + r() * (wMax - wMin), h = hMin + r() * (hMax - hMin); g.fillRect(x, 256 - h, w, h); if (r() < 0.18) g.fillRect(x + w / 2 - 1.5, 256 - h - 10 - r() * 30, 3, 40); x += w + r() * 4; } };
  layer('rgba(255,255,255,.55)', 90, 236, 14, 60); layer('rgba(255,255,255,1)', 50, 160, 10, 46);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(0,0,0,.9)'; g.fillRect(r() * 4096, 160 + r() * 90, 2, 2); }   // редкие окна-прорези
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 200, 128, 1, true), new THREE.MeshBasicMaterial({ map: t, color: 0x2a2a2a, transparent: true, alphaTest: 0.02, side: THREE.BackSide, fog: true, depthWrite: false }));
  m.renderOrder = -0.5; m.frustumCulled = false; scene.add(m); SKYLINE.mesh = m;
}
// мокрый и полированный пол: плоское отражение поверх пола. лужи — по маске (в сухих местах отражение размыто), pol — ровная полировка
const WETS = [];
if (HQ) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), r = rng(404); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.filter = 'blur(10px)';
  for (let i = 0; i < 140; i++) { const x = r() * 512, y = r() * 512, rad = 12 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const wetTex = new THREE.CanvasTexture(c); wetTex.wrapS = wetTex.wrapT = THREE.RepeatWrapping;
  const make = (q, o) => { const { w, d, x, y, z, k = 0.6, pol = 0 } = o;
    const shader = { name: 'WetReflector', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tWet: { value: wetTex }, uK: { value: k }, uPol: { value: pol } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
        void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tWet; uniform float uK, uPol; varying vec4 vUv; varying vec3 vW;
        void main(){ float wet = mix(smoothstep(0.25, 0.75, texture2D(tWet, vW.xz * 0.012).r), 0.55, uPol);
          float b = mix(0.018, 0.002, wet); vec3 c = vec3(0.0);
          for (int i = 0; i < 8; i++) { float a = float(i) * 0.7854; vec4 o = vec4(cos(a) * b, sin(a) * b, 0.0, 0.0) * vUv.w; c += texture2DProj(tDiffuse, vUv + o).rgb; } c /= 8.0;
          vec3 V = normalize(cameraPosition - vW); float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          gl_FragColor = vec4(c, uK * mix(0.05, 1.0, wet) * mix(0.3, 1.0, fres));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` };
    const m = new Reflector(new THREE.PlaneGeometry(w, d), { textureWidth: innerWidth * 0.6, textureHeight: innerHeight * 0.6, shader, clipBias: 0.003 });
    m.material.transparent = true; m.material.depthWrite = false; m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m);
    const ob = m.onBeforeRender; m.onBeforeRender = (...a) => { const v = SKYLINE.mesh.visible; SKYLINE.mesh.visible = false; ob(...a); SKYLINE.mesh.visible = v; }; WETS.push({ m, q, below: o.below, above: o.above });   // кольцо горизонта стоит вокруг камеры — в отражении оно ломается, поэтому не отражаем
  };
  // старт и нейтральная — одна общая мокрая плоскость на поверхности
  const zEnd = Z.neutral.rects[0][3]; make(Z.neutral, { w: 440, d: zEnd + 60, x: 0, y: ROOF + 0.03, z: (zEnd - 60) / 2, k: 0.6 }); WETS[0].also = Z.fork;
  ZL.forEach(q => q.wet.forEach(o => make(q, o)));
}
// искра: контур из того же svg, что и в прелоадере; летит впереди камеры и светит
let spark, sparkLight = new THREE.PointLight(0xff6a50, 0, 30, 1.5); scene.add(sparkLight);
{
  const data = await new SVGLoader().loadAsync('assets/iskra.svg'), shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 40, bevelEnabled: false, curveSegments: 6 }); geo.center(); geo.computeBoundingBox();
  const s = 0.8 / (geo.boundingBox.max.x - geo.boundingBox.min.x); geo.scale(s, -s, s);
  spark = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2.2, roughness: 0.3 })); scene.add(spark);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,80,60,.9)'); gr.addColorStop(0.3, 'rgba(244,7,9,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  halo.scale.setScalar(3.2); halo.visible = !HQ; spark.add(halo);   // на десктопе ореол даёт bloom, а спрайт ломает затенение в углах
}

// логотип в финале: «O» с вырезом под искру; пока искра не встала, он чёрный и виден только в её свете
const LOGO = { mat: null, slot: V(0, 0, 0), k: 1 };
{
  const data = await new SVGLoader().loadAsync('assets/logo.svg'), shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
  const bbOf = pts => { const b = new THREE.Box2(); pts.forEach(p => b.expandByPoint(p)); return b; }, boxes = shapes.map(sh => bbOf(sh.getPoints()));
  const all = new THREE.Box2(); boxes.forEach(b => all.union(b));
  const oIdx = boxes.reduce((m, b, i) => b.min.x < boxes[m].min.x ? i : m, 0); let slot;
  if (shapes[oIdx].holes.length) slot = shapes[oIdx].holes.map(h => bbOf(h.getPoints())).sort((a, b) => (b.max.x - b.min.x) * (b.max.y - b.min.y) - (a.max.x - a.min.x) * (a.max.y - a.min.y))[0];
  else { const inner = boxes.findIndex((b, i) => i !== oIdx && boxes[oIdx].containsBox(b)); slot = boxes[inner]; shapes.splice(inner, 1); }
  const cx = (all.min.x + all.max.x) / 2, cy = (all.min.y + all.max.y) / 2, S = 40 / (all.max.x - all.min.x);
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 6, bevelEnabled: false, curveSegments: 8 }); geo.translate(-cx, -cy, -3);
  LOGO.mat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0b, emissive: RED, emissiveIntensity: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, LOGO.mat)); g.scale.set(S, -S, S); g.rotation.y = Math.PI; g.position.copy(FIN.logoAt); FIN.g.add(g); g.updateMatrixWorld(true);
  const sc = slot.getCenter(new THREE.Vector2()); LOGO.slot.set(sc.x - cx, sc.y - cy, 0).applyMatrix4(g.matrixWorld);
  LOGO.k = (slot.max.x - slot.min.x) * S / 0.8;   // во сколько раз искра должна вырасти, чтобы встать в вырез
  LOGO.glow = new THREE.PointLight(0xff3a20, 0, 90, 1.2); LOGO.glow.position.copy(FIN.logoAt).add(V(0, 8, -34)); scene.add(LOGO.glow);
}

// ---------- маршруты ----------
// ствол — вход в ротонду, общий; дальше btl идёт по земле, atl над городом — через те же локации
const ORDER = ['fork', 'neutral', 'asia', 'sport', 'merch', 'ai', 'final'];
const ROUTES = { btl: [...Z.fork.trunk], atl: [...Z.fork.trunk] };
for (const r of ['btl', 'atl']) { ORDER.forEach(k => ROUTES[r].push(...Z[k].paths[r])); ROUTES[r] = ROUTES[r].map(p => V(0, p.y, p.z)); }   // рельсы: строго по оси, без вилянья
const N = 4000, PX = 11;   // пикселей скролла на метр пути
const R = {};
for (const [r, raw] of Object.entries(ROUTES)) {
  const pts = raw.filter((p, i) => !i || p.distanceTo(raw[i - 1]) > 1);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), P = curve.getSpacedPoints(N), C = [0], cubes = ZL.flatMap(q => q.cubes).filter(c => !c.r || c.r === r);
  // у кубов своего маршрута скролл тянется дольше — камера как бы присаживается
  for (let i = 1; i <= N; i++) { const p = P[i], dn = Math.min(...cubes.map(c => Math.hypot(c.p.x - p.x, c.p.z - p.z, (c.p.y - p.y) * 0.5))); C.push(C[i - 1] + P[i].distanceTo(P[i - 1]) * (1 + 1.1 * Math.exp(-((dn / 16) ** 2)))); }
  const iF = P.findIndex(p => p.distanceTo(Z.fork.trunk[2]) < 3);
  R[r] = { curve, P, C, cubes, iF, trunkW: C[iF], restW: C[N] - C[iF] };
}
const TRUNK_W = (R.btl.trunkW + R.atl.trunkW) / 2, REST_W = Math.max(R.btl.restW, R.atl.restW), TOTAL = TRUNK_W + REST_W;
document.getElementById('track').style.height = `${TOTAL * PX + innerHeight}px`;
function uAt(r, s) {
  const o = R[r], target = s <= TRUNK_W ? s / TRUNK_W * o.trunkW : o.trunkW + (s - TRUNK_W) / REST_W * o.restW;
  let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (o.C[m] < target) lo = m; else hi = m; }
  return clamp01((lo + (target - o.C[lo]) / ((o.C[hi] - o.C[lo]) || 1)) / N);
}
let route = null;

// ---------- зоны по положению камеры: небо, свет, отсечение ----------
const rectD = (q, x, z) => Math.min(...q.rects.map(([x0, x1, z0, z1]) => Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1))));
const M = { top: new THREE.Color(), mid: new THREE.Color(), bot: new THREE.Color(), key: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), sunC: new THREE.Color(), c: new THREE.Color(), dir: V(0, 0, 0), sun: V(0, 0, 0) };
let curZone = null;
function updateZones(dawn) {
  const x = camera.position.x, z = camera.position.z;
  const ws = ZL.map(q => { const d = rectD(q, x, z); q.g.visible = d < 260; q.d = d; return Math.exp(-((d / 16) ** 2)) + 1e-6; }), sum = ws.reduce((a, b) => a + b, 0);
  for (const k of ['top', 'mid', 'bot', 'key', 'hs', 'hg', 'sunC']) M[k].setRGB(0, 0, 0); M.dir.set(0, 0, 0); M.sun.set(0, 0, 0);
  let keyI = 0, hemiI = 0, bl = 0, sunK = 0, sp = 0, ex = 0, hd = 0, fg = 0, best = 0; const gr = { sat: 0, con: 0, grain: 0, vig: 0, ca: 0, red: 0, t0: 0, t1: 0, t2: 0 };
  ZL.forEach((q, i) => { const w = ws[i] / sum; if (ws[i] > ws[best]) best = i;
    M.top.add(M.c.set(q.sky[0]).multiplyScalar(w)); M.mid.add(M.c.set(q.sky[1]).multiplyScalar(w)); M.bot.add(M.c.set(q.sky[2]).multiplyScalar(w));
    M.key.add(M.c.set(q.key[0]).multiplyScalar(w)); M.hs.add(M.c.set(q.hemi[0]).multiplyScalar(w)); M.hg.add(M.c.set(q.hemi[1]).multiplyScalar(w));
    M.sunC.add(M.c.set(q.sun[1]).multiplyScalar(w)); M.sun.addScaledVector(q.sun[0], w); sunK += q.sun[2] * w;
    sp += q.spark * w; ex += q.exp * w; { const g = { ...GRADE0, ...q.grade }; for (const k of ['sat', 'con', 'grain', 'vig', 'ca', 'red']) gr[k] += g[k] * w; gr.t0 += g.tint[0] * w; gr.t1 += g.tint[1] * w; gr.t2 += g.tint[2] * w; } hd += q.hdr * w; fg += q.fog * w; keyI += q.key[1] * w; hemiI += q.hemi[2] * w; bl += q.bloom * w; M.dir.addScaledVector(q.key[2].clone().normalize(), w); });
  curZone = ZL[best];
  const u = sky.material.uniforms, D = dawn;
  u.uTop.value.copy(M.top).multiplyScalar(D); u.uMid.value.copy(M.mid).multiplyScalar(D); u.uBot.value.copy(M.bot).multiplyScalar(D); u.uSun.value.copy(M.sun); u.uSunC.value.copy(M.sunC); u.uK.value = sunK * D;
  sky.position.copy(camera.position);
  hemi.color.copy(M.hs); hemi.groundColor.copy(M.hg); hemi.intensity = hemiI * D;
  key.color.copy(M.key); key.intensity = keyI * D;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); key.target.position.copy(camera.position).addScaledVector(fwd, 50); key.target.position.y = Math.max(0, camera.position.y - (camera.position.y > ROOF ? 6 : 8)); if (camera.position.y > ROOF + 20) key.target.position.y = ROOF;
  key.position.copy(key.target.position).addScaledVector(M.dir.normalize(), 300);
  u.uHdr.value = hd * D; scene.fog.color.copy(M.bot).multiplyScalar(0.55 * D); scene.fog.density = fg * D;
  WETS.forEach(o => { const cy = camera.position.y; o.m.visible = (o.q.g.visible || !!o.also?.g.visible) && !(o.below && cy > o.below) && !(o.above && cy < o.above); });   // в мерче — только пол своего этажа
  if (SKYLINE.mesh) { SKYLINE.mesh.position.set(camera.position.x, ROOF - 30, camera.position.z); SKYLINE.mesh.material.opacity = clamp01(hd * 1.4) * D; SKYLINE.mesh.visible = hd > 0.02; }
  LABELS.forEach(l => { l.getWorldPosition(tmpL); l.material.opacity = smooth(clamp01((tmpL.distanceTo(camera.position) - 15) / 12)); });
  { const f = film.uniforms; f.uSat.value = gr.sat; f.uCon.value = gr.con; f.uGrain.value = gr.grain; f.uVig.value = gr.vig; f.uCA.value = gr.ca; f.uRed.value = gr.red; f.uTint.value.set(gr.t0, gr.t1, gr.t2); }
  renderer.toneMappingExposure = ex; bloom.strength = 0.6 * bl; sparkLight.intensity = sp * (0.9 + 0.1 * Math.sin(performance.now() / 140)) * (0.35 + 0.65 * D) + (1 - D) * 25;
  // лампы зоны: три ближайшие точки света из всех видимых зон
  const an = ZL.filter(q => q.g.visible).flatMap(q => q.anchors).map(a => [a, a.p.distanceToSquared(camera.position)]).sort((a, b) => a[1] - b[1]);
  lamps.forEach((l, i) => { const a = an[i]?.[0]; if (!a) { l.intensity = 0; return; } l.position.copy(a.p); l.color.set(a.c); l.intensity = a.i * D; l.distance = 50; });
}

// ---------- HUD ----------
const zoneN = document.getElementById('zoneN'), zoneT = document.getElementById('zoneT'), pct = document.getElementById('pct'), hint = document.getElementById('hint');
const forkEl = document.getElementById('fork'), routeBtn = document.getElementById('route');
forkEl.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; route = b.dataset.r; forkEl.classList.remove('on'); scrollTo({ top: (TRUNK_W + 30) * PX, behavior: 'smooth' }); });
routeBtn.addEventListener('click', () => { route = null; scrollTo({ top: (TRUNK_W - 6) * PX, behavior: 'smooth' }); });

// ---------- цикл ----------
let sSm = 0, mouse = new THREE.Vector2(), mSm = new THREE.Vector2(), lastZone = '';
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
let lookInit = false;
const clock = new THREE.Clock(), look = V(0, 0, 0), tmp = V(0, 0, 0), ahead = V(0, 0, 0), DOCKQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), endEl = document.getElementById('end');
const REC = { on: /rec/.test(location.search), t: 0 };
function frame() {
  const REC_ = REC.on, dt = REC_ ? 0 : Math.min(clock.getDelta(), 0.05), time = REC_ ? REC.t : clock.elapsedTime;   // при записи видео время идёт по кадрам, а не по часам
  let s = scrollY / PX;
  if (!route && s > TRUNK_W) { s = TRUNK_W; scrollTo(0, TRUNK_W * PX); }
  forkEl.classList.toggle('on', !route && s > TRUNK_W - 14);
  sSm += (s - sSm) * (1 - Math.exp(-dt * 3));
  const r = route || 'btl', o = R[r], u = uAt(r, sSm), du = 14 / o.curve.getLength();
  o.curve.getPointAt(u, camera.position); o.curve.getPointAt(Math.min(1, u + du), ahead);
  // камера на рельсах: взгляд — по касательной к пути на 30 м вперёд, сглажен; без поворотов к кубам и без сдвига от мыши
  o.curve.getPointAt(Math.min(1, u + 30 / o.curve.getLength()), tmp); tmp.y -= 0.6;
  const dLogo = camera.position.distanceTo(FIN.logoAt), dock = smooth(clamp01((72 - dLogo) / 24)), landed = clamp01((dock - 0.92) / 0.08);
  tmp.lerp(FIN.look, smooth(clamp01((110 - dLogo) / 50)));
  look.lerp(tmp, REC.on || !lookInit || look.distanceTo(tmp) > 50 ? 1 : 1 - Math.exp(-dt * 4)); lookInit = true;   // после прыжка по навигации — сразу, без разворота
  camera.lookAt(look);
  // искра впереди, чуть выше линии взгляда; в начале — прямо по центру кадра
  const intro = 1 - clamp01(sSm / 40);
  o.curve.getPointAt(Math.min(1, u + du * (0.9 - 0.45 * intro)), tmp);
  spark.position.copy(tmp).add(V(Math.sin(time * 0.9) * 0.5, 1.4 + Math.sin(time * 1.3) * 0.25 - intro * 1.6, 0));
  spark.lookAt(camera.position); spark.rotateZ(time * 0.6 * (1 - dock));
  // в финале искра летит в вырез логотипа, растёт до его размера и разворачивается вместе с ним; логотип загорается
  if (dock > 0) { spark.position.lerp(LOGO.slot, dock); spark.scale.setScalar(1 + (LOGO.k - 1) * dock); spark.quaternion.slerp(DOCKQ, dock); } else spark.scale.setScalar(1);
  spark.children[0].material.opacity = 1 - dock; spark.material.emissiveIntensity = (HQ ? 3.2 : 2.2) * (1 - landed) + 1.2 * landed;   // на десктопе ореол искры делает bloom
  LOGO.mat.emissiveIntensity = landed * 0.75; LOGO.glow.intensity = landed * 220;
  sparkLight.distance = 30 + 70 * smooth(clamp01((150 - dLogo) / 70));   // на подлёте искра выхватывает чёрный логотип из темноты
  endEl.classList.toggle('on', landed > 0.6);
  sparkLight.position.copy(spark.position);
  const dawn = smooth(clamp01((sSm - 6) / 50));   // мир проявляется, когда искра трогается с места
  // солнце на первом участке ходит: азимут плывёт со временем и с продвижением, облака тянут тени по поверхности
  { const a = time * 0.06 + camera.position.z * 0.004, N = Z.neutral, F0 = Z.fork; N.key[2].set(Math.cos(a) * 0.9, 0.42 + 0.12 * Math.sin(time * 0.11), Math.sin(a) * 0.9); F0.key[2].set(Math.cos(a * 1.4 + 1) * 0.85, 0.36, Math.sin(a * 1.4 + 1) * 0.85);
    N.sun[0].copy(N.key[2]).setY(0.16).normalize();
    if (N.g.visible) { N.clouds.forEach((c, i) => { N.cloudDm.position.set(((c.x + time * 7 + 260) % 520 + 520) % 520 - 260, 72, c.z); N.cloudDm.scale.set(c.w, 2, c.d); N.cloudDm.updateMatrix(); N.cloudMesh.setMatrixAt(i, N.cloudDm.matrix); }); N.cloudMesh.instanceMatrix.needsUpdate = true; } }
  updateZones(dawn);
  if (curZone && curZone.k !== lastZone) { lastZone = curZone.k; zoneN.textContent = `{${curZone.n}} ${route ? (route === 'btl' ? 'btl · на земле' : 'atl · над городом') : 'вход'}`; zoneT.textContent = curZone.t; }
  pct.textContent = String(Math.round(sSm / TOTAL * 100)).padStart(3, '0') + '%';
  hint.style.opacity = sSm < 10 ? 0.6 : 0;
  routeBtn.style.display = route ? 'block' : 'none'; routeBtn.textContent = `маршрут ${route} · сменить ↺`;
  film.uniforms.uT.value = (time * 60) % 1000; composer.render(); requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao?.setSize(innerWidth, innerHeight); });

// ?map — план мира из тех же данных: зоны, маршруты, кубы
function drawMap() {
  const W = innerWidth, H = innerHeight, cv = Object.assign(document.createElement('canvas'), { width: W * 2, height: H * 2 }), g = cv.getContext('2d');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:100;background:#111111'; document.body.appendChild(cv); g.scale(2, 2);
  const z0 = -70, z1 = FIN.rects[0][3] + 10, pl = 60, k = (W - pl - 30) / (z1 - z0), X = z => pl + (z - z0) * k;
  g.fillStyle = '#E1D9CF'; g.font = '520 34px TT'; g.fillText('локации и два маршрута', pl, 50);
  g.font = '400 13px AP'; g.globalAlpha = 0.65; g.fillText('btl и atl проходят через одни и те же локации: btl — по земле, atl — над городом · сверху план, снизу разрез по высоте', pl, 76); g.globalAlpha = 1;
  // план
  const pt = 120, ph = 300, kx = ph / 280, Y = x => pt + ph / 2 - x * kx;
  for (const q of ZL) q.rects.forEach(([a, b, c, d]) => { const gr = g.createLinearGradient(0, Y(b), 0, Y(a)); gr.addColorStop(0, q.sky[2]); gr.addColorStop(0.5, q.sky[1]); gr.addColorStop(1, q.sky[0]); g.fillStyle = gr; g.globalAlpha = 0.85; g.fillRect(X(c), Y(b), X(d) - X(c), Y(a) - Y(b)); g.globalAlpha = 1; g.strokeStyle = 'rgba(225,217,207,.3)'; g.strokeRect(X(c), Y(b), X(d) - X(c), Y(a) - Y(b));
    const ink = q.k === 'merch' ? '#111' : '#E1D9CF'; g.fillStyle = ink; g.font = '400 11px AP'; g.fillText(`{${q.n}}`, X(c) + 6, Y(b) + 15); g.font = '520 17px TT'; g.fillText(q.t, X(c) + 6, Y(b) + 34); g.font = '400 10px AP'; g.globalAlpha = 0.8; let line = '', y = Y(b) + 50; for (const w of q.line.split(' ')) { if (g.measureText(line + w).width > X(d) - X(c) - 12) { g.fillText(line, X(c) + 6, y); line = ''; y += 12; } line += w + ' '; } g.fillText(line, X(c) + 6, y); g.globalAlpha = 1; });
  g.font = '400 10px AP'; ZL.flatMap(q => q.cubes).forEach(c => { const x = X(c.p.z), y = Y(c.p.x); g.fillStyle = c.r === 'atl' ? '#E1D9CF' : '#F40709'; g.fillRect(x - 4, y - 4, 8, 8); g.save(); g.translate(x + 3, y + 10); g.rotate(1.1); g.fillStyle = '#E1D9CF'; g.fillText(c.title, 0, 0); g.restore(); });
  // разрез: высота камеры по z
  const st = pt + ph + 120, sh = 180, ky = sh / 70, YS = y => st + sh - y * ky;
  g.strokeStyle = 'rgba(225,217,207,.2)'; g.beginPath(); g.moveTo(X(z0), YS(0)); g.lineTo(X(z1), YS(0)); g.stroke();
  for (const q of ZL) { const [, , c, d] = q.rects[0]; g.fillStyle = q.sky[1]; g.globalAlpha = 0.35; g.fillRect(X(c), YS(70), X(d) - X(c), sh); g.globalAlpha = 1; g.fillStyle = '#E1D9CF'; g.font = '400 10px AP'; g.fillText(q.t, X(c) + 4, YS(70) + 12); }
  [['btl', '#F40709', []], ['atl', '#E1D9CF', [7, 5]]].forEach(([r, c, dash]) => { g.strokeStyle = c; g.lineWidth = 2.5; g.setLineDash(dash); g.beginPath(); R[r].P.forEach((p, i) => { i ? g.lineTo(X(p.z), YS(p.y)) : g.moveTo(X(p.z), YS(p.y)); }); g.stroke(); g.setLineDash([]); });
  ZL.flatMap(q => q.cubes).forEach(c => { g.fillStyle = c.r === 'atl' ? '#E1D9CF' : '#F40709'; g.fillRect(X(c.p.z) - 3, YS(c.p.y) - 3, 6, 6); });
  g.fillStyle = '#E1D9CF'; g.font = '400 10px AP'; [0, 20, 40, 60].forEach(h => g.fillText(`${h} м`, 14, YS(h) + 3));
  const lx = W - 300; g.fillStyle = '#F40709'; g.fillRect(lx, 38, 26, 3); g.fillStyle = '#E1D9CF'; g.font = '400 11px AP'; g.fillText('btl · на земле', lx + 34, 43);
  g.setLineDash([7, 5]); g.strokeStyle = '#E1D9CF'; g.beginPath(); g.moveTo(lx, 60); g.lineTo(lx + 26, 60); g.stroke(); g.setLineDash([]); g.fillText('atl · над городом', lx + 34, 64);
}

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
// отладка и съёмка: ?at=asia:0.3 — встать в зону на долю её пути
const go = (r, s) => { lookInit = false; route = r; document.documentElement.classList.remove('lock'); scrollTo(0, s * PX); sSm = s; };
const goZone = (k, f = 0.3, r = 'btl') => { const o = R[r], q = Z[k]; const idx = o.P.map((p, i) => rectD(q, p.x, p.z) < 0.01 ? i : -1).filter(i => i >= 0); const i = idx[Math.floor(f * (idx.length - 1))]; const w = o.C[i]; const s = w <= o.trunkW ? w / o.trunkW * TRUNK_W : TRUNK_W + (w - o.trunkW) / o.restW * REST_W; go(k === 'fork' && f < 0.5 ? null : r, s); };
// проверка пути: лучи от камеры в шесть сторон — ни одна стена ближе 1,5 м
function check() {
  const rc = new THREE.Raycaster(), hits = [], meshes = []; scene.traverse(o => { if (o.isMesh && o !== sky && o !== ground && o.parent !== spark && o !== spark) meshes.push(o); });
  const dirs = [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1), V(0, 1, 0), V(0, -1, 0)];
  for (const r of ['btl', 'atl']) for (let i = 0; i <= N; i += 10) { const p = R[r].P[i]; for (const d of dirs) { rc.set(p, d); rc.far = d.y < 0 ? 0.6 : 1.5; const h = rc.intersectObjects(meshes, false)[0]; if (h && !(h.object.material.transparent)) { hits.push(`${r} ${i} ${p.toArray().map(v => v.toFixed(0)).join(',')} → ${d.toArray().join('')}`); break; } } }
  console[hits.length ? 'warn' : 'log'](`проверка пути: ${hits.length ? hits.length + ' касаний' : 'чисто'}`, hits.slice(0, 20).join(' | ')); return hits;
}
window.__w = { scene, camera, R, Z, go, goZone, check, TRUNK_W, TOTAL, tick: () => { REC.t += 1 / 24; } };
const AT = new URLSearchParams(location.search).get('at');
if (AT) { const [k, f, r] = AT.split(':'); goZone(k, +f || 0.3, r || 'btl'); }
if (location.search.includes('map')) drawMap();
frame();
// прелоадер: искра встаёт туда, где в кадре 3D-искра, и передаёт ей кадр; только потом открывается скролл
{
  const L = document.getElementById('loader'), open = () => { L.classList.add('done'); document.documentElement.classList.remove('lock'); };
  if (AT || /map|rec/.test(location.search)) open();
  else { await settled(); document.getElementById('loadPct').textContent = '100%';
    const c = spark.position.clone().project(camera), d = spark.position.distanceTo(camera.position), px = 0.8 / (2 * d * Math.tan(camera.fov * Math.PI / 360)) * innerHeight;
    L.style.setProperty('--tx', `${(c.x + 1) / 2 * innerWidth}px`); L.style.setProperty('--ty', `${(1 - c.y) / 2 * innerHeight}px`); L.style.setProperty('--tw', `${Math.max(16, px)}px`);
    L.classList.add('ready'); setTimeout(open, 1250); }
}
