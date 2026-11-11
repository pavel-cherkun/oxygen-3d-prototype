// Oxygen — мир из кварталов. Искра ведёт камеру по двум маршрутам; у каждой зоны своя пространственная идея,
// свой материал, свет и небо. Кейсы пока — кубы-плейсхолдеры с подписью.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 700);   // дальняя плоскость 700 м: дальше мир не рисуется вовсе
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.5, 0.86); composer.addPass(bloom); composer.addPass(new OutputPass());

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
const TEX = { light: concreteTex(7, 182), dark: concreteTex(19, 120) };
const conc = (tint, dark = false, rough = 0.93) => memo(`c${tint}|${dark}|${rough}`, () => new THREE.MeshStandardMaterial({ color: tint, map: dark ? TEX.dark : TEX.light, bumpMap: dark ? TEX.dark : TEX.light, bumpScale: 1.2, roughness: rough, metalness: 0 }));
const MEMO = new Map(), memo = (key, make) => MEMO.get(key) || MEMO.set(key, make()).get(key);   // один материал на сочетание параметров — меньше мешей после слияния
const matte = (c, rough = 0.85, metal = 0) => memo(`m${c}|${rough}|${metal}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
const glow = (c, k = 1.6) => memo(`g${c}|${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }));

// коробка с UV в метрах: текстура бетона ложится одинаково на любой габарит (6 м на плитку)
const TILE = 6;
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * s[f][0] / TILE, uv.getY(k) * s[f][1] / TILE); }
  return g;
}
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
function zone(k, o) { const z = Object.assign({ k, exp: 1, g: new THREE.Group(), kit: new Kit(), path: [], cubes: [], anchors: [], rects: [], bloom: 1, sun: [V(0, 0.2, 1), 0x000000, 0] }, o); scene.add(z.g); ZL.push(z); Z[k] = z; return z; }
const XB = 340;   // ось проспекта маршрута Б
const PLINTH = conc(0x3a3836, true);
// куб-плейсхолдер кейса: постамент, куб 5 м, тонкая красная грань, подпись
function cube(q, x, z, title, o = {}) {
  const s = o.s || 5, y0 = o.y ?? 0, mat = o.mat || matte(CREAM, 0.55);
  if (!o.float) q.kit.box(o.plinth || PLINTH, s + 2, 0.8, s + 2, x, y0, z);
  const top = y0 + (o.float ? 3 : 0.8);
  q.kit.box(mat, s, s, s, x, top, z);
  q.kit.box(glow(RED, 1.4), s + 0.06, 0.12, 0.12, x, top + s - 0.06, z - s / 2 - 0.02);
  q.cubes.push({ p: V(x, top + s / 2, z), title });
  const n = String(q.cubes.length).padStart(2, '0'), lab = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: labelTex(title, `{${q.n}·${n}} ${q.t}`), transparent: true, depthWrite: false, toneMapped: false }));
  lab.position.set(x, top + s + 2.2, z); lab.rotation.y = o.face ?? Math.PI; q.g.add(lab);
}
const path = (q, ...pts) => pts.forEach(p => q.path.push(V(...p)));

// {01} город — бетонный каньон брутализма: стены с консолями и рёбрами, мосты над улицей, низкое солнце бьёт сквозь щели между домами
function city() {
  const q = zone('city', { exp: 1.25,spark: 10,  n: '01', t: 'город', line: 'бетонный каньон, низкое солнце сквозь щели', sky: ['#3a342e', '#8a8178', '#d8cdbf'], hemi: [0xbdb3a6, 0x4a423a, 1.1], key: [0xffe2c0, 4.2, V(-1, 0.62, 0.3)], bloom: 0.7, sun: [V(-1, 0.32, 0.4).normalize(), 0xffe6c8, 1] });
  const z0 = -60, z1 = 380, C = conc(0xc2bab0), D = conc(0x8e877e, true), slot = matte(0x0d0c0b, 0.9), k = q.kit, r = rng(11);
  q.rects.push([-80, 80, z0, z1]);
  k.box(conc(0x4a4743, true), 40, 0.3, z1 - z0, 0, -0.3, (z0 + z1) / 2);
  [-1, 1].forEach(s => k.box(conc(0x6a645e), 4, 0.35, z1 - z0, s * 16, 0, (z0 + z1) / 2));   // тротуары
  for (const s of [-1, 1]) for (let z = z0; z < z1;) {
    const L = 22 + r() * 30, d = 16 + r() * 16, h = 30 + r() * 60, x = s * (18 + d / 2), zc = z + L / 2;
    k.box(C, d, h, L, x, 0, zc);
    if (r() < 0.65) k.box(D, d * 0.62, 6 + r() * 16, L * 0.7, x + s * d * 0.16, h, zc);   // уступ наверху
    for (let y = 9 + r() * 5; y < h - 5; y += 8 + r() * 7) if (r() < 0.6) k.box(C, 3.6, 1.1, L * (0.45 + r() * 0.5), s * 16.2, y, zc);   // консоли к улице: глубокие тени
    if (r() < 0.45) for (let zz = z + 1.6; zz < z + L - 1; zz += 2.4) k.box(D, 1.5, h * 0.62, 0.45, s * 17.25, h * 0.18, zz);   // вертикальные рёбра
    else for (let y = 7; y < h - 6; y += 6.5) k.box(slot, 0.2, 1.8, L * 0.84, s * 17.95, y, zc);   // ленточные окна — тёмные прорези
    z += L + (r() < 0.3 ? 3 + r() * 4 : 0);   // узкие щели между домами: в них проходит солнце и ложится полосой на улицу
  }
  for (let z = z0 + 50; z < z1 - 30; z += 64 + r() * 30) {   // мосты и галереи над улицей
    const y = 18 + r() * 16; k.box(C, 36, 2.6, 7, 0, y, z); k.box(D, 36, 0.6, 7.6, 0, y + 2.6, z);
    if (r() < 0.5) for (let x = -15; x <= 15; x += 3) k.box(D, 0.5, 3.4, 0.5, x, y + 3.2, z - 3.4);
    q.anchors.push({ p: V(0, y - 1.5, z), c: 0xffd2a0, i: 40 });
    k.box(glow(0xffd8b0, 1.3), 22, 0.12, 0.3, 0, y - 0.12, z);
  }
  // шлюз в ивенты: массивный портал, в проёме — закат следующего квартала
  k.box(C, 22, 52, 10, -24, 0, z1 - 4); k.box(C, 22, 52, 10, 24, 0, z1 - 4); k.box(D, 70, 14, 12, 0, 52, z1 - 4);
  k.box(conc(0x6a645e), 60, 60, 6, 0, 0, z0 - 6);   // глухая стена за спиной на старте
  cube(q, -10.5, 70, 'ozon селект'); cube(q, 10.5, 170, 'дербент'); cube(q, -10.5, 270, 'tevredens');
  path(q, [0, 6.5, -40], [2, 7, 20], [-1, 7.5, 110], [2, 7, 210], [-1, 7, 300], [0, 7, z1 + 10]);
  return z1;
}

// {02} ивенты — открытое поле на закате: ферменные арки одна за другой, низкие трибуны и валы закрывают горизонт, свет — контровой
function event(z0) {
  const q = zone('event', {spark: 8,  n: '02', t: 'ивенты', line: 'поле на закате, ферменные арки, контровой свет', sky: ['#1a0405', '#b8100f', '#f2d2b4'], hemi: [0xd06a5a, 0x2a0d0b, 0.55], key: [0xffcfa0, 3.2, V(0.15, 0.16, 1)], bloom: 1.1, sun: [V(0.1, 0.06, 1).normalize(), 0xffd8b0, 1.4] });
  const z1 = z0 + 380, k = q.kit, r = rng(23), steel = matte(0x2a2422, 0.5, 0.6), field = conc(0x4a2c26, true), berm = conc(0x5a3a32, true), tent = matte(0x8a7a6e, 0.9);
  q.rects.push([-170, 170, z0, z1]);
  k.box(field, 340, 0.3, z1 - z0, 0, -0.3, (z0 + z1) / 2);
  for (const s of [-1, 1]) for (let z = z0; z < z1; z += 30 + r() * 30) k.box(berm, 40 + r() * 30, 5 + r() * 9, 30 + r() * 30, s * (110 + r() * 40), 0, z);   // валы по краям — горизонт закрыт
  for (const s of [-1, 1]) for (let z = z0 + 20; z < z1 - 20; z += 46) { const x = s * (34 + r() * 50); k.geo(tent, new THREE.ConeGeometry(6 + r() * 3, 6 + r() * 3, 4), x, 3.5, z, Math.PI / 4); }
  for (const s of [-1, 1]) for (let z = z0 + 10; z < z1 - 10; z += 60) for (let i = 0; i < 5; i++) k.box(conc(0x6a4a42), 22, 1, 1.6, s * 26, i * 1.1, z + i * 1.6);   // ступени трибун
  // арки: две ферменные мачты и верхний пояс, свет снизу пояса
  for (let i = 0; i < 5; i++) {
    const z = z0 + 40 + i * 72, H = 24 + i * 2;
    for (const s of [-1, 1]) { [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([a, b]) => k.box(steel, 0.5, H, 0.5, s * 22 + a, 0, z + b)); for (let y = 2; y < H; y += 3) k.box(steel, 3.3, 0.3, 0.3, s * 22, y, z - 1.4, 0, 0, s * 0.7); }
    [-1.2, 1.2].forEach(b => { k.box(steel, 47, 0.5, 0.5, 0, H, z + b); k.box(steel, 47, 0.5, 0.5, 0, H + 2.4, z + b); });
    for (let x = -22; x < 22; x += 2.4) k.box(steel, 0.3, 2.4, 0.3, x, H, z, 0, 0, 0.7);
    k.box(glow(0xffe0c0, 1.5), 40, 0.15, 0.4, 0, H - 0.2, z);
    q.anchors.push({ p: V(0, H - 2, z), c: 0xffc890, i: 60 });
  }
  // сцена в конце поля: подиум, ферма и тёмный экран
  const sx = -70, sz = z1 - 60;   // сцена сбоку от пути, развёрнута к нему
  k.box(conc(0x3a2a26, true), 18, 2, 44, sx, 0, sz); k.box(matte(0x0a0808, 0.4), 0.6, 14, 30, sx - 6, 6, sz);
  [-1, 1].forEach(s => k.box(steel, 1.2, 22, 1.2, sx - 6, 2, sz + s * 18)); k.box(steel, 1.2, 1.2, 38, sx - 6, 24, sz);
  cube(q, -10, z0 + 76, 'золотые ворота'); cube(q, 10, z0 + 148, 'белград'); cube(q, -10, z0 + 220, 'связь есть везде'); cube(q, 10, z0 + 292, 'гусь на заводе');
  path(q, [0, 6, z0 + 20], [3, 6, z0 + 110], [-3, 6.5, z0 + 200], [2, 6, z0 + 300], [0, 6.5, z1 - 50]);
  return z1;
}

// развилка — бетонная ротонда с окулюсом: столб света сверху, два выхода с подписями маршрутов; маршрут Б уходит туннелем направо
function fork(z0) {
  const R = 50, cz = z0 + R + 20, q = zone('fork', {spark: 12,  n: '··', t: 'развилка', line: 'ротонда, столб света из окулюса', sky: ['#14110f', '#3a3631', '#77706a'], hemi: [0x8a847c, 0x1a1816, 0.35], key: [0xfff0dc, 4, V(0.12, 1, 0.08)], bloom: 1 });
  const k = q.kit, C = conc(0x8a837a), D = conc(0x5a5550, true); q.cz = cz; q.R = R;
  q.rects.push([-70, 70, z0, cz + R + 10], [50, XB + 20, cz - 14, cz + 14], [XB - 14, XB + 14, cz - 14, cz + 80]);
  k.box(conc(0x4a4743, true), 2 * R + 20, 0.3, 2 * R + 40, 0, -0.3, cz);
  k.box(C, 40, 30, 16, -32, 0, z0 + 8); k.box(C, 40, 30, 16, 32, 0, z0 + 8);   // горловина из ивентов
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 30) {
    const x = Math.cos(a) * R, z = cz + Math.sin(a) * R;
    if ((z < cz && Math.abs(x) < 11) || (z > cz && Math.abs(x) < 11) || (x > 0 && Math.abs(z - cz) < 9)) continue;
    k.box(C, 4, 46, R * Math.PI / 30 + 0.4, x, 0, z, -a);
    k.box(D, 12, 2, R * Math.PI / 30 + 1, Math.cos(a) * (R - 5), 46, cz + Math.sin(a) * (R - 5), -a);   // кольцо кровли, центр открыт
  }
  [[0, cz - R], [0, cz + R]].forEach(([x, z]) => k.box(D, 26, 18, 6, x, 30, z));   // перемычки над проёмами
  k.box(D, 6, 18, 22, R, 30, cz);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R - 12, R - 12, 46, 64, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0dc).multiplyScalar(0.05), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  shaft.position.set(0, 23, cz); q.g.add(shaft);
  const sA = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: signTex([['маршрут а', '400 120px AP, monospace', 150], ['азия → спорт', '520 230px TT, sans-serif', 420]]), transparent: true, toneMapped: false, depthWrite: false }));
  sA.position.set(0, 24, cz + R - 3); sA.rotation.y = Math.PI; q.g.add(sA);
  const sB = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: signTex([['маршрут б', '400 120px AP, monospace', 150], ['ритейл → ai → мерч', '520 190px TT, sans-serif', 420]]), transparent: true, toneMapped: false, depthWrite: false }));
  sB.position.set(R - 3, 24, cz); sB.rotation.y = -Math.PI / 2; q.g.add(sB);
  // туннель маршрута Б: вдоль x, потом поворот на проспект; щели в кровле дают полосы света
  const T = (x0, x1, z, along) => { for (let t = x0; t < x1; t += 6) { const L = Math.min(6, x1 - t); if (along === 'x') { k.box(C, L, 14, 1.5, t + L / 2, 0, z - 8); k.box(C, L, 14, 1.5, t + L / 2, 0, z + 8); if (Math.floor(t / 6) % 2) k.box(D, L, 1.2, 17.5, t + L / 2, 14, z); } else { k.box(C, 1.5, 14, L, z - 8, 0, t + L / 2); k.box(C, 1.5, 14, L, z + 8, 0, t + L / 2); if (Math.floor(t / 6) % 2) k.box(D, 17.5, 1.2, L, z, 14, t + L / 2); } } };
  T(R + 2, XB - 8, cz, 'x'); T(cz + 8, cz + 80, XB, 'z'); k.box(C, 1.5, 14, 18, XB + 8, 0, cz); k.box(C, 18, 14, 1.5, XB, 0, cz - 8);
  k.box(conc(0x4a4743, true), XB - R, 0.3, 16, (R + XB) / 2, -0.3, cz); k.box(conc(0x4a4743, true), 16, 0.3, 90, XB, -0.3, cz + 40);
  return { cz, zA: cz + R, zB: cz + 80 };
}

// А1 азия — узкий вертикальный переулок между чёрными башнями: красные вывески-лезвия, гирлянды фонарей, тории, красный диск в небе
function asia(z0) {
  const q = zone('asia', {spark: 18,  n: 'А1', t: 'азиатский квартал', line: 'узкий чёрный переулок, красные вывески-лезвия', sky: ['#050102', '#3a0608', '#8a1010'], hemi: [0xa04048, 0x1a0808, 0.6], key: [0xff7a6a, 2.2, V(0.3, 1, -0.2)], bloom: 1.2, sun: [V(0, 0.32, 1).normalize(), 0xff2a1a, 2.2] });
  const z1 = z0 + 340, k = q.kit, r = rng(31), B = conc(0x1a1919, true, 0.6), red = glow(RED, 1.5), cr = glow(0xffe0d0, 1.1), tor = matte(0x9a0608, 0.5);
  q.rects.push([-70, 70, z0, z1]);
  k.box(conc(0x1a1414, true, 0.4), 30, 0.3, z1 - z0, 0, -0.3, (z0 + z1) / 2);
  for (const s of [-1, 1]) for (let z = z0; z < z1;) {
    const L = 9 + r() * 10, d = 14 + r() * 16, h = 60 + r() * 150, x = s * (11 + d / 2), zc = z + L / 2;
    k.box(B, d, h, L, x, 0, zc); if (r() < 0.5) k.box(B, d * 0.5, 10 + r() * 30, L * 0.6, x, h, zc);
    for (let i = 0, n = 1 + (r() * 3 | 0); i < n; i++) { const hh = 5 + r() * 12; k.box(r() < 0.8 ? red : cr, 0.5, hh, 2.6, s * (10.7 - 1.3), 5 + r() * 34, z + 1 + r() * (L - 2)); }   // вывески-лезвия поперёк фасада
    z += L + 1.4 + r() * 2;   // щели между башнями — красные прорези света
  }
  for (let z = z0 + 14; z < z1 - 10; z += 13) { const y = 9 + r() * 8; for (let x = -10; x <= 10; x += 1.6) { const sag = (1 - (x / 10) ** 2) * 1.6; k.box(red, 0.55, 0.7, 0.55, x, y - sag, z); } }   // гирлянды
  for (let i = 0; i < 4; i++) { const z = z0 + 30 + i * 84; [-8.5, 8.5].forEach(x => k.geo(tor, new THREE.CylinderGeometry(0.45, 0.55, 15, 12), x, 7.5, z)); k.box(tor, 22, 0.9, 1.1, 0, 15, z); k.box(tor, 19, 0.6, 0.7, 0, 12.6, z); q.anchors.push({ p: V(0, 13, z), c: 0xff3020, i: 70 }); }
  cube(q, -6.5, z0 + 60, 'ozon corp', { s: 3.6 }); cube(q, 6.5, z0 + 140, 'т-банк', { s: 3.6 }); cube(q, -6.5, z0 + 220, 'хроники ижоры', { s: 3.6 }); cube(q, 6.5, z0 + 296, 'треснутые', { s: 3.6 });
  path(q, [0, 5.5, z0 + 6], [1.5, 5.5, z0 + 100], [-1.5, 6, z0 + 180], [1, 5.5, z0 + 260], [0, 6, z1]);
  return z1;
}

// А2 спорт — внутри чаши стадиона: ярусы трибун, козырёк, четыре мачты прожекторов. обзор закрывает сама чаша
function sport(z0) {
  const q = zone('sport', {spark: 6,  n: 'А2', t: 'спорт', line: 'внутри чаши стадиона, холодный белый', sky: ['#05070a', '#1c2228', '#cfd4d8'], hemi: [0xb8bec4, 0x15171a, 0.5], key: [0xf4f6f8, 4.2, V(0.55, 1, 0.35)], bloom: 1, sun: [V(0, 0.05, 1), 0xffffff, 0.3] });
  const z1 = z0 + 400, k = q.kit, cz = (z0 + z1) / 2, C = conc(0x8a8e92), D = conc(0x4a4e52, true), seat = conc(0x2c3034, true), steel = matte(0x9aa0a6, 0.4, 0.7);
  q.rects.push([-140, 140, z0, z1]);
  k.box(matte(0x15181a, 0.9), 260, 0.3, z1 - z0, 0, -0.3, cz);
  const A = 62, Bz = 120;
  const lines = []; for (let lane = 0; lane < 6; lane++) { const a = A - 4 - lane * 1.3, b = Bz - 4 - lane * 1.3; for (let t = 0; t < Math.PI * 2; t += Math.PI / 90) { const t2 = t + Math.PI / 90; lines.push(Math.cos(t) * a, 0.05, cz + Math.sin(t) * b, Math.cos(t2) * a, 0.05, cz + Math.sin(t2) * b); } }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); q.g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9aa0a6 })));
  for (let i = 0; i < 12; i++) {
    const s = 1.06 + i * 0.055, y = i * 3.4, a = A * s, b = Bz * s;
    for (let t = 0; t < Math.PI * 2; t += Math.PI / 60) {
      const x = Math.cos(t) * a, z = cz + Math.sin(t) * b; if (Math.abs(x) < 11 && y < 15) continue;   // туннели под нижними ярусами
      const tx = -Math.sin(t) * a, tz = Math.cos(t) * b, L = Math.hypot(tx, tz) * Math.PI / 60 + 0.6, ry = Math.atan2(tx, tz);
      k.box(i % 3 === 2 ? D : seat, 6.4, 3.4, L, x, y, z, ry);
      if (i === 11) { k.box(C, 9, 1.2, L, Math.cos(t) * (a + 10), y + 9, cz + Math.sin(t) * (b + 10), ry); k.box(C, 1.4, 9, L, Math.cos(t) * (a + 3.4), y + 3.4, cz + Math.sin(t) * (b + 3.4), ry); }   // козырёк и задняя стенка
    }
  }
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => { const x = sx * A * 1.95, z = cz + sz * Bz * 1.05; k.box(steel, 2.4, 78, 2.4, x, 0, z); k.box(D, 16, 9, 2, x - sx * 1.5, 74, z - sz * 1.2, Math.atan2(-x, cz - z)); const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), glow(0xffffff, 2.2)); p.position.set(x - sx * 3, 78.5, z - sz * 2.6); p.lookAt(0, 0, cz); q.g.add(p); q.anchors.push({ p: V(x * 0.5, 50, (z + cz) / 2), c: 0xffffff, i: 0 }); });
  // туннели входа и выхода
  [[z0, z0 + 40], [z1 - 40, z1]].forEach(([a, b]) => { for (const s of [-1, 1]) k.box(C, 2, 12, b - a, s * 9, 0, (a + b) / 2); k.box(D, 20, 1.6, b - a, 0, 12, (a + b) / 2); q.anchors.push({ p: V(0, 9, (a + b) / 2), c: 0xe8eef4, i: 30 }); });
  cube(q, -14, cz - 100, 'синегривый лев'); cube(q, 14, cz - 50, 'ironstar'); cube(q, -14, cz, 'шёлковый путь'); cube(q, 14, cz + 50, 'балтика 7'); cube(q, -14, cz + 100, 'время авангарда');
  path(q, [0, 5, z0 + 4], [0, 6, z0 + 50], [1, 8, cz - 80], [-1, 10, cz], [1, 8, cz + 80], [0, 6, z1 - 50], [0, 5, z1]);
  return z1;
}

// Б1 ритейл — нутро бесконечного склада: стеллажи уходят в глубину, натриевые лампы рядами, потолок закрывает небо
function retail(z0) {
  const q = zone('retail', {spark: 10,  n: 'Б1', t: 'ритейл', line: 'нутро склада, стеллажи и натриевые лампы', sky: ['#120704', '#3a1606', '#8a3a0c'], hemi: [0xd08a4a, 0x2a1408, 0.55], key: [0xffa050, 0.6, V(-0.4, 1, 0.3)], bloom: 1.2 });
  const z1 = z0 + 300, x0 = XB, k = q.kit, r = rng(41), C = conc(0x8a7462), D = conc(0x4a3a30, true), rack = matte(0xc06a1a, 0.6, 0.3), shelf = matte(0x3a3430, 0.7, 0.4), box = matte(0x9a7650, 0.95), lamp = glow(0xffa64a, 2);
  q.rects.push([x0 - 50, x0 + 50, z0, z1]);
  k.box(conc(0x3a3430, true, 0.5), 90, 0.3, z1 - z0, x0, -0.3, (z0 + z1) / 2);
  for (const s of [-1, 1]) k.box(C, 2, 24, z1 - z0, x0 + s * 44, 0, (z0 + z1) / 2);
  k.box(D, 90, 1.2, z1 - z0, x0, 24, (z0 + z1) / 2);
  for (const s of [-1, 1]) { k.box(C, 37, 24, 2, x0 + s * 25.5, 0, z0); k.box(C, 37, 24, 2, x0 + s * 25.5, 0, z1); }
  k.box(C, 14, 12, 2, x0, 12, z0); k.box(C, 14, 10, 2, x0, 14, z1);   // проёмы входа и ворот склада
  for (const s of [-1, 1]) for (const dx of [12, 21, 30, 39]) for (let z = z0 + 8; z < z1 - 10; z += 30) {
    const L = 26, x = x0 + s * dx; for (let zz = z; zz <= z + L; zz += 3.25) { k.box(rack, 0.2, 14, 0.2, x - 1.1, 0, zz); k.box(rack, 0.2, 14, 0.2, x + 1.1, 0, zz); }
    for (let y = 0.3; y < 14; y += 3.5) { k.box(shelf, 2.5, 0.15, L, x, y, z + L / 2); for (let zz = z + 0.8; zz < z + L - 0.8;) { const w = 0.8 + r() * 1.2; if (r() < 0.75) k.box(box, 1.9, 0.6 + r() * 2.2, w, x, y + 0.15, zz + w / 2); zz += w + 0.15; } }
  }
  for (const dx of [-16.5, -7, 7, 16.5]) for (let z = z0 + 6; z < z1; z += 9) k.box(lamp, 0.5, 0.12, 4, x0 + dx, 22.6, z);
  for (let z = z0 + 30; z < z1; z += 60) q.anchors.push({ p: V(x0, 18, z), c: 0xffa040, i: 90 });
  cube(q, x0 - 3, z0 + 90, 'заклинатели', { s: 4.4 }); cube(q, x0 + 3, z0 + 200, 'дино', { s: 4.4 });
  path(q, [x0, 5, z0 - 6], [x0 + 1, 5.5, z0 + 80], [x0 - 1, 5, z0 + 180], [x0, 5.5, z1]);
  return z1;
}

// Б2 ai-продакшн — чёрная пустота: кремовая сетка гаснет к краям, монолиты проступают только в свете искры
function ai(z0) {
  const q = zone('ai', {spark: 55,  n: 'Б2', t: 'ai-продакшн', line: 'пустота, кремовая сетка, монолиты в свете искры', sky: ['#000000', '#030303', '#0c0c0c'], hemi: [0x6a6a6a, 0x050505, 0.08], key: [0xe1d9cf, 0.35, V(0, 1, -0.4)], bloom: 1.3 });
  const z1 = z0 + 280, x0 = XB, k = q.kit, r = rng(53), mono = matte(0x0a0a0a, 0.35, 0.2);
  q.rects.push([x0 - 120, x0 + 120, z0, z1]);
  k.box(matte(0x050505, 0.6), 240, 0.3, z1 - z0, x0, -0.3, (z0 + z1) / 2);
  const pts = [], col = [], c = new THREE.Color(CREAM);
  const seg = (ax, az, bx, bz) => { const f = p => Math.max(0, 1 - Math.abs(p - x0) / 90) ** 1.5 * 0.55; pts.push(ax, 0.04, az, bx, 0.04, bz); [f(ax), f(bx)].forEach(v => col.push(c.r * v, c.g * v, c.b * v)); };
  for (let x = x0 - 108; x <= x0 + 108; x += 6) for (let z = z0; z < z1; z += 10) seg(x, z, x, z + 10);
  for (let z = z0; z <= z1; z += 6) for (let x = x0 - 108; x < x0 + 108; x += 6) seg(x, z, x + 6, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  q.g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false })));
  const edges = [];
  for (let i = 0; i < 34; i++) {
    const s = i % 2 ? 1 : -1, x = x0 + s * (14 + r() * 90), z = z0 + 10 + r() * (z1 - z0 - 20), w = 1.2 + r() * 1.6, h = 18 + r() * 70, d = 5 + r() * 10, ry = (r() - 0.5) * 0.6;
    k.box(mono, w, h, d, x, 0, z, ry);
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); e.applyMatrix4(new THREE.Matrix4().compose(V(x, h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1))); edges.push(e);
  }
  q.g.add(new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: new THREE.Color(CREAM).multiplyScalar(0.28), toneMapped: false })));
  for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1; k.geo(glow(CREAM, 0.6), new THREE.CylinderGeometry(0.12, 0.12, 260, 6), x0 + s * (60 + r() * 50), 130, z0 + r() * (z1 - z0)); }   // далёкие вертикальные лучи — масштаб пустоты
  const blk = matte(0x111111, 0.3, 0.3);
  cube(q, x0 - 6, z0 + 50, 'ai · fonbet', { float: true, mat: blk }); cube(q, x0 + 6, z0 + 110, 'ai · mango', { float: true, mat: blk }); cube(q, x0 - 6, z0 + 170, 'ai · лавка', { float: true, mat: blk }); cube(q, x0 + 6, z0 + 230, 'ai · альфа', { float: true, mat: blk });
  path(q, [x0, 4.5, z0 + 4], [x0, 5, z0 + 140], [x0, 4.5, z1]);
  return z1;
}

// Б3 мерч — светлая галерея-анфилада: проёмы выстроены по оси, через них видна следующая комната; свет из щели в потолке
function merch(z0) {
  const q = zone('merch', { exp: 1.7,spark: 3,  n: 'Б3', t: 'мерч', line: 'светлая анфилада, свет из щели в потолке', sky: ['#c8c0b6', '#e2dad0', '#f4f0ea'], hemi: [0xf4f0ea, 0xb0a89c, 1.8], key: [0xfff6ea, 3.8, V(0.25, 1, 0.18)], bloom: 0.35 });
  const rooms = 4, L = 46, z1 = z0 + rooms * L, x0 = XB, k = q.kit, P = conc(0xe0d8cc, false, 0.85), blk = matte(0x111111, 0.4), floor = conc(0xbab2a6, false, 0.45);
  q.rects.push([x0 - 30, x0 + 30, z0, z1 + 10]);
  k.box(floor, 40, 0.3, z1 - z0, x0, -0.3, (z0 + z1) / 2);
  for (const s of [-1, 1]) k.box(P, 1.2, 16, z1 - z0, x0 + s * 18.6, 0, (z0 + z1) / 2);
  for (const s of [-1, 1]) k.box(P, 16, 1, z1 - z0, x0 + s * 11, 16, (z0 + z1) / 2);   // потолок с продольной щелью шириной 6 м
  for (let i = 0; i <= rooms; i++) { const z = z0 + i * L; for (const s of [-1, 1]) k.box(P, 14, 16, 1, x0 + s * 11.5, 0, z); k.box(P, 9, 7, 1, x0, 9, z); }
  const ids = ['мерч g-drive', 'набор креатора', 'мерч льва'];
  ids.forEach((t, i) => cube(q, x0 + (i % 2 ? 7 : -7), z0 + L * (i + 1) + L / 2, t, { mat: blk, plinth: matte(0xd8d0c4, 0.7) }));
  for (let i = 0; i < rooms; i++) [-1, 1].forEach(s => k.box(blk, 0.4, 5, 8, x0 + s * 17.9, 4, z0 + i * L + L / 2));   // тёмные «картины» на стенах
  path(q, [x0, 5, z0 + 3], [x0, 5, z0 + 60], [x0, 5.2, z0 + 120], [x0, 5, z1]);
  return z1;
}

// финал — бетонный двор: сюда сходятся оба маршрута; два больших куба: награды и бриф
function final(zA, zB) {
  const z0 = Math.max(zA, zB) + 30, cz = z0 + 70, q = zone('final', { exp: 1.15,spark: 10,  n: '··', t: 'награды и бриф', line: 'двор, где сходятся маршруты', sky: ['#1a0a0a', '#5a1010', '#c8a090'], hemi: [0xc0a090, 0x1a1210, 0.5], key: [0xffd8c0, 3.4, V(-0.5, 0.5, -0.6)], bloom: 0.9, sun: [V(-0.4, 0.15, -1).normalize(), 0xffc8a0, 0.8] });
  const k = q.kit, C = conc(0x9c948a), D = conc(0x6a645e, true); q.cz = cz;
  q.rects.push([-70, 70, zA, cz + 70], [60, XB + 20, cz - 14, cz + 14], [XB - 14, XB + 14, zB, cz + 14]);
  k.box(conc(0x4a4743, true), 140, 0.3, cz + 70 - zA, 0, -0.3, (zA + cz + 70) / 2);
  k.box(C, 4, 34, 140, -60, 0, cz); k.box(C, 4, 34, 61, 60, 0, cz - 39.5); k.box(C, 4, 34, 61, 60, 0, cz + 39.5);   // в восточной стене проём маршрута Б
  k.box(C, 124, 34, 4, 0, 0, cz + 62);
  k.box(C, 48, 34, 4, -36, 0, cz - 62); k.box(C, 48, 34, 4, 36, 0, cz - 62); k.box(D, 30, 20, 4, 0, 14, cz - 62);
  k.box(D, 4, 20, 20, 60, 14, cz);   // проём маршрута Б в восточной стене
  for (let z = zA; z < cz - 62; z += 6) for (const s of [-1, 1]) k.box(C, 2, 12, 6, s * 9, 0, z + 3);   // короткий туннель из стадиона
  k.box(D, 20, 1.4, cz - 62 - zA, 0, 12, (zA + cz - 62) / 2);
  // возврат маршрута Б: туннель от проспекта до двора
  for (let z = zB; z < cz + 8; z += 6) { if (z < cz - 8) k.box(C, 1.5, 14, 6, XB - 8, 0, z + 3); k.box(C, 1.5, 14, 6, XB + 8, 0, z + 3); }
  k.box(C, 18, 14, 1.5, XB, 0, cz + 8.5);
  for (let x = 62; x < XB - 8; x += 6) { k.box(C, 6, 14, 1.5, x + 3, 0, cz - 8); k.box(C, 6, 14, 1.5, x + 3, 0, cz + 8); if (Math.floor(x / 6) % 2) k.box(D, 6, 1.2, 17.5, x + 3, 14, cz); }
  k.box(conc(0x4a4743, true), XB - 60, 0.3, 16, (60 + XB) / 2, -0.3, cz); k.box(conc(0x4a4743, true), 16, 0.3, cz - zB + 10, XB, -0.3, (zB + cz) / 2);
  cube(q, -12, cz + 44, 'награды', { s: 8 }); cube(q, 12, cz + 44, 'бриф', { s: 8, mat: matte(RED, 0.5) });
  q.anchors.push({ p: V(0, 20, cz + 30), c: 0xffd0b0, i: 80 });
  q.pathA = [V(0, 6, zA), V(0, 6.5, cz - 40), V(0, 7.5, cz + 4)];
  q.pathB = [V(XB, 5, zB), V(XB, 5.5, cz - 4), V(XB - 20, 6, cz), V(64, 6, cz), V(30, 6.5, cz + 2), V(0, 7.5, cz + 4)];
  q.look = V(0, 8, cz + 48);
  return q;
}

// ---------- сборка мира ----------
const zCity = city(), zEvent = event(zCity), F = fork(zEvent), zAsia = asia(F.zA), zSport = sport(zAsia);
const zRetail = retail(F.zB), zAi = ai(zRetail), zMerch = merch(zAi), FIN = final(zSport, zMerch);
ZL.forEach(q => q.kit.flush(q.g));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), matte(0x050505, 1)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);

// небо: сфера вокруг камеры, градиент и диск солнца смешиваются по зонам
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSun: { value: V(0, 0.2, 1) }, uSunC: { value: new THREE.Color() }, uK: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uTop, uMid, uBot, uSunC, uSun; uniform float uK; varying vec3 vD;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec3 d = normalize(vD); float y = d.y; vec3 c = mix(uBot, uMid, smoothstep(0.0, 0.25, y)); c = mix(c, uTop, smoothstep(0.2, 0.8, y));
      float s = max(dot(d, normalize(uSun)), 0.0); c += uSunC * (pow(s, 700.0) * 4.0 + pow(s, 14.0) * 0.4) * uK;
      c += (h(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

// искра: контур из того же svg, что и в прелоадере; летит впереди камеры и светит
let spark, sparkLight = new THREE.PointLight(0xff6a50, 0, 30, 1.5); scene.add(sparkLight);
{
  const data = await new SVGLoader().loadAsync('assets/iskra.svg'), shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 40, bevelEnabled: false, curveSegments: 6 }); geo.center(); geo.computeBoundingBox();
  const s = 0.8 / (geo.boundingBox.max.x - geo.boundingBox.min.x); geo.scale(s, -s, s);
  spark = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2.2, roughness: 0.3 })); scene.add(spark);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,80,60,.9)'); gr.addColorStop(0.3, 'rgba(244,7,9,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.setScalar(3.2); spark.add(halo);
}

// ---------- маршруты ----------
// ствол (город, ивенты, вход в ротонду) общий; дальше А — прямо через азию и стадион, Б — туннелем направо через склад, пустоту и галерею
const trunk = [...Z.city.path, ...Z.event.path, V(0, 6.5, F.cz - 40), V(0, 7, F.cz)];
const ROUTES = {
  A: [...trunk, V(0, 7, F.cz + 30), ...Z.asia.path, ...Z.sport.path, ...FIN.pathA],
  B: [...trunk, V(20, 7, F.cz + 2), V(70, 6, F.cz), V(XB - 30, 6, F.cz), V(XB - 6, 6, F.cz), V(XB, 6, F.cz + 6), V(XB, 6, F.cz + 18), ...Z.retail.path, ...Z.ai.path, ...Z.merch.path, ...FIN.pathB],
};
const CUBES = ZL.flatMap(q => q.cubes);
// у каждого маршрута: сплайн и таблица «скролл → точка»; у кубов скролл тянется дольше — камера как бы присаживается
const N = 4000, PX = 11;   // пикселей скролла на метр пути
const R = {};
for (const [r, raw] of Object.entries(ROUTES)) {
  const pts = raw.filter((p, i) => !i || p.distanceTo(raw[i - 1]) > 1);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), P = curve.getSpacedPoints(N), C = [0];
  for (let i = 1; i <= N; i++) { const p = P[i], dn = Math.min(...CUBES.map(c => Math.hypot(c.p.x - p.x, c.p.z - p.z))); C.push(C[i - 1] + P[i].distanceTo(P[i - 1]) * (1 + 2.6 * Math.exp(-((dn / 13) ** 2)))); }
  const iF = P.findIndex(p => p.distanceTo(V(0, 7, F.cz)) < 3);
  R[r] = { curve, P, C, iF, trunkW: C[iF], restW: C[N] - C[iF] };
}
const TRUNK_W = (R.A.trunkW + R.B.trunkW) / 2, REST_W = Math.max(R.A.restW, R.B.restW), TOTAL = TRUNK_W + REST_W;
document.getElementById('track').style.height = `${TOTAL * PX + innerHeight}px`;
// s — пройденный «вес» пути; в своём маршруте превращается в индекс точки
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
  const ws = ZL.map(q => { const d = rectD(q, x, z); q.g.visible = d < 170; q.d = d; return Math.exp(-((d / 16) ** 2)) + 1e-6; }), sum = ws.reduce((a, b) => a + b, 0);
  for (const k of ['top', 'mid', 'bot', 'key', 'hs', 'hg', 'sunC']) M[k].setRGB(0, 0, 0); M.dir.set(0, 0, 0); M.sun.set(0, 0, 0);
  let keyI = 0, hemiI = 0, bl = 0, sunK = 0, sp = 0, ex = 0, best = 0;
  ZL.forEach((q, i) => { const w = ws[i] / sum; if (ws[i] > ws[best]) best = i;
    M.top.add(M.c.set(q.sky[0]).multiplyScalar(w)); M.mid.add(M.c.set(q.sky[1]).multiplyScalar(w)); M.bot.add(M.c.set(q.sky[2]).multiplyScalar(w));
    M.key.add(M.c.set(q.key[0]).multiplyScalar(w)); M.hs.add(M.c.set(q.hemi[0]).multiplyScalar(w)); M.hg.add(M.c.set(q.hemi[1]).multiplyScalar(w));
    M.sunC.add(M.c.set(q.sun[1]).multiplyScalar(w)); M.sun.addScaledVector(q.sun[0], w); sunK += q.sun[2] * w;
    sp += q.spark * w; ex += q.exp * w; keyI += q.key[1] * w; hemiI += q.hemi[2] * w; bl += q.bloom * w; M.dir.addScaledVector(q.key[2].clone().normalize(), w); });
  curZone = ZL[best];
  const u = sky.material.uniforms, D = dawn;
  u.uTop.value.copy(M.top).multiplyScalar(D); u.uMid.value.copy(M.mid).multiplyScalar(D); u.uBot.value.copy(M.bot).multiplyScalar(D); u.uSun.value.copy(M.sun); u.uSunC.value.copy(M.sunC); u.uK.value = sunK * D;
  sky.position.copy(camera.position);
  hemi.color.copy(M.hs); hemi.groundColor.copy(M.hg); hemi.intensity = hemiI * D;
  key.color.copy(M.key); key.intensity = keyI * D;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); key.target.position.copy(camera.position).addScaledVector(fwd, 50); key.target.position.y = 0;
  key.position.copy(key.target.position).addScaledVector(M.dir.normalize(), 300);
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
const clock = new THREE.Clock(), look = V(0, 0, 0), tmp = V(0, 0, 0), ahead = V(0, 0, 0);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  let s = scrollY / PX;
  if (!route && s > TRUNK_W) { s = TRUNK_W; scrollTo(0, TRUNK_W * PX); }
  forkEl.classList.toggle('on', !route && s > TRUNK_W - 14);
  sSm += (s - sSm) * (1 - Math.exp(-dt * 3));
  const r = route || 'A', o = R[r], u = uAt(r, sSm), du = 14 / o.curve.getLength();
  o.curve.getPointAt(u, camera.position); o.curve.getPointAt(Math.min(1, u + du), ahead);
  // взгляд: вперёд по пути, у куба — поворот к нему; в финале — на два больших куба
  look.copy(ahead); look.y = camera.position.y - 0.6;
  let best = null, bd = 1e9; for (const c of CUBES) { const d = c.p.distanceTo(camera.position); if (d < bd && c.p.clone().sub(camera.position).dot(tmp.copy(ahead).sub(camera.position)) > 0) { bd = d; best = c; } }
  if (best) { const w = smooth(clamp01((34 - bd) / 18)) * 0.45, ly = look.y; look.lerp(best.p, w); look.y = ly + (best.p.y - ly) * w * 0.4; }
  if (u > 0.985) look.lerp(FIN.look, smooth((u - 0.985) / 0.015));
  mSm.lerp(mouse, Math.min(1, dt * 3)); camera.position.x += mSm.x * 1.2; camera.position.y -= mSm.y * 0.8;
  camera.lookAt(look);
  // искра впереди, чуть выше линии взгляда; в начале — прямо по центру кадра
  const intro = 1 - clamp01(sSm / 40);
  o.curve.getPointAt(Math.min(1, u + du * (0.9 - 0.45 * intro)), tmp);
  spark.position.copy(tmp).add(V(Math.sin(time * 0.9) * 0.5, 1.4 + Math.sin(time * 1.3) * 0.25 - intro * 1.6, 0));
  spark.lookAt(camera.position); spark.rotateZ(time * 0.6);
  sparkLight.position.copy(spark.position);
  const dawn = smooth(clamp01((sSm - 6) / 50));   // мир проявляется, когда искра трогается с места
  updateZones(dawn);
  if (curZone && curZone.k !== lastZone) { lastZone = curZone.k; zoneN.textContent = `{${curZone.n}} ${route ? (route === 'A' ? 'маршрут а' : 'маршрут б') : 'ствол'}`; zoneT.textContent = curZone.t; }
  pct.textContent = String(Math.round(sSm / TOTAL * 100)).padStart(3, '0') + '%';
  hint.style.opacity = sSm < 10 ? 0.6 : 0;
  routeBtn.style.display = route ? 'block' : 'none'; routeBtn.textContent = `маршрут ${route === 'A' ? 'а' : 'б'} · сменить ↺`;
  composer.render(); requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ?map — план мира из тех же данных: зоны, маршруты, кубы
function drawMap() {
  const W = innerWidth, H = innerHeight, cv = Object.assign(document.createElement('canvas'), { width: W * 2, height: H * 2 }), g = cv.getContext('2d');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:100;background:#111111'; document.body.appendChild(cv); g.scale(2, 2);
  const z0 = -70, z1 = FIN.cz + 80, x0 = -180, x1 = XB + 130, pl = 60, pt = 130, k = Math.min((W - pl - 30) / (z1 - z0), (H - pt - 40) / (x1 - x0)), P = (x, z) => [pl + (z - z0) * k, pt + (x - x0) * k];
  g.fillStyle = '#E1D9CF'; g.font = '520 34px TT'; g.fillText('зонирование · два маршрута', pl, 50);
  g.font = '400 13px AP'; g.globalAlpha = 0.65; g.fillText('вид сверху, движение слева направо · заливка — небо зоны от горизонта к зениту · кубы — места кейсов', pl, 76); g.globalAlpha = 1;
  for (const q of ZL) q.rects.forEach(([a, b, c, d], j) => { const [X0, Y0] = P(a, c), [X1, Y1] = P(b, d), gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, q.sky[2]); gr.addColorStop(0.5, q.sky[1]); gr.addColorStop(1, q.sky[0]); g.fillStyle = gr; g.globalAlpha = 0.85; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0); g.globalAlpha = 1; g.strokeStyle = 'rgba(225,217,207,.3)'; g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    if (!j) { const ink = q.k === 'merch' ? '#111' : '#E1D9CF'; g.fillStyle = ink; g.font = '400 11px AP'; g.fillText(`{${q.n}}`, X0 + 6, Y0 + 15); g.font = '520 17px TT'; g.fillText(q.t, X0 + 6, Y0 + 34); g.font = '400 10px AP'; g.globalAlpha = 0.8; let line = '', y = Y0 + 50; for (const w of q.line.split(' ')) { if (g.measureText(line + w).width > X1 - X0 - 12) { g.fillText(line, X0 + 6, y); line = ''; y += 12; } line += w + ' '; } g.fillText(line, X0 + 6, y); g.globalAlpha = 1; } });
  [['A', '#F40709', []], ['B', '#E1D9CF', [7, 5]]].forEach(([r, c, dash]) => { g.strokeStyle = c; g.lineWidth = 2.5; g.setLineDash(dash); g.beginPath(); R[r].P.forEach((p, i) => { const [X, Y] = P(p.x, p.z); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); g.setLineDash([]); });
  g.font = '400 10px AP'; CUBES.forEach(c => { const [X, Y] = P(c.p.x, c.p.z); g.fillStyle = '#E1D9CF'; g.fillRect(X - 4, Y - 4, 8, 8); g.save(); g.translate(X + 2, Y + 10); g.rotate(1.1); g.fillText(c.title, 0, 0); g.restore(); });
  const lx = W - 300; g.fillStyle = '#F40709'; g.fillRect(lx, 38, 26, 3); g.fillStyle = '#E1D9CF'; g.font = '400 11px AP'; g.fillText('маршрут а · азия → спорт', lx + 34, 43);
  g.setLineDash([7, 5]); g.strokeStyle = '#E1D9CF'; g.beginPath(); g.moveTo(lx, 60); g.lineTo(lx + 26, 60); g.stroke(); g.setLineDash([]); g.fillText('маршрут б · ритейл → ai → мерч', lx + 34, 64);
}

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
// отладка и съёмка: ?at=asia:0.3 — встать в зону на долю её пути
const go = (r, s) => { route = r; document.documentElement.classList.remove('lock'); scrollTo(0, s * PX); sSm = s; };
const goZone = (k, f = 0.3) => { const r = ['retail', 'ai', 'merch'].includes(k) ? 'B' : 'A', o = R[r], q = Z[k]; const idx = o.P.map((p, i) => rectD(q, p.x, p.z) < 0.01 ? i : -1).filter(i => i >= 0); const i = idx[Math.floor(f * (idx.length - 1))]; const w = o.C[i]; const s = w <= o.trunkW ? w / o.trunkW * TRUNK_W : TRUNK_W + (w - o.trunkW) / o.restW * REST_W; go(['city', 'event'].includes(k) ? null : r, s); };
// проверка пути: лучи от камеры в шесть сторон — ни одна стена ближе 1,5 м
function check() {
  const rc = new THREE.Raycaster(), hits = [], meshes = []; scene.traverse(o => { if (o.isMesh && o !== sky && o !== ground && o.parent !== spark && o !== spark) meshes.push(o); });
  const dirs = [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1), V(0, 1, 0), V(0, -1, 0)];
  for (const r of ['A', 'B']) for (let i = 0; i <= N; i += 10) { const p = R[r].P[i]; for (const d of dirs) { rc.set(p, d); rc.far = d.y < 0 ? 0.6 : 1.5; const h = rc.intersectObjects(meshes, false)[0]; if (h && !(h.object.material.transparent)) { hits.push(`${r} ${i} ${p.toArray().map(v => v.toFixed(0)).join(',')} → ${d.toArray().join('')}`); break; } } }
  console[hits.length ? 'warn' : 'log'](`проверка пути: ${hits.length ? hits.length + ' касаний' : 'чисто'}`, hits.slice(0, 20).join(' | ')); return hits;
}
window.__w = { scene, camera, R, Z, go, goZone, check, TRUNK_W, TOTAL };
const AT = new URLSearchParams(location.search).get('at');
if (AT) { const [k, f] = AT.split(':'); goZone(k, +f || 0.3); }
if (location.search.includes('map')) drawMap();
frame();
// прелоадер: искра встаёт туда, где в кадре 3D-искра, и передаёт ей кадр; только потом открывается скролл
{
  const L = document.getElementById('loader'), open = () => { L.classList.add('done'); document.documentElement.classList.remove('lock'); };
  if (AT || location.search.includes('map')) open();
  else { await settled(); document.getElementById('loadPct').textContent = '100%';
    const c = spark.position.clone().project(camera), d = spark.position.distanceTo(camera.position), px = 0.8 / (2 * d * Math.tan(camera.fov * Math.PI / 360)) * innerHeight;
    L.style.setProperty('--tx', `${(c.x + 1) / 2 * innerWidth}px`); L.style.setProperty('--ty', `${(1 - c.y) / 2 * innerHeight}px`); L.style.setProperty('--tw', `${Math.max(16, px)}px`);
    L.classList.add('ready'); setTimeout(open, 1250); }
}
