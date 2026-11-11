// Прототип 3D-главной Oxygen: Искра падает в неоновый логотип на башне, дальше скролл ведёт по улице к разделам.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/'));
import { CASES, renderCase, MODALS } from './cases.js';

const RED = 0xf40709, CREAM = 0xe1d9cf;
const rand = mulberry(20_26);
function mulberry(a) { return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = t => Math.min(1, Math.max(0, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- рендер ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020203);   // мегаструктура: вне света — пустота, никакого неба и тумана
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.45, 0.84);   // половинное разрешение: быстрее и мягче, без пересветов
composer.addPass(bloom);
composer.addPass(new OutputPass());

import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
  // отражения только у глянца, стекла, вывески и искры — матовые поверхности и асфальт остаются тёмными
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const set = (m, k) => { m.envMap = env; m.envMapIntensity = k; m.needsUpdate = true; };
  set(MAT.cream, 0.5); set(MAT.gloss, 0.6); set(MAT.glass, 0.8); set(MAT.glassO, 0.8);
  const later = () => { if (!logo.mat || !iskra) return setTimeout(later, 200); set(logo.mat, 0.45); set(iskra.material, 0.5); }; later();
});
const hemi = new THREE.HemisphereLight(0x9aa0b0, 0x1a1612, 0); scene.add(hemi);   // общий свет почти ноль: видно только то, что освещено

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0b0d14'); gr.addColorStop(0.55, '#262c40'); gr.addColorStop(1, '#3d465f');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- материалы (реф 1 из гайдлайна: матовый чёрный, глянцевый кремовый, полупрозрачный красный) ----------
const MAT = {
  matte: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.92, metalness: 0.05 }),
  cream: new THREE.MeshPhysicalMaterial({ color: 0x8c8378, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),   // приглушённый кремовый, чтобы под светом не уходил в белый
  graphite: new THREE.MeshPhysicalMaterial({ color: 0x2a2a2f, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
  // стекло как в рефе 1: настоящее пропускание света, лёгкая матовость, тонировка в толще
  glass: new THREE.MeshPhysicalMaterial({ color: 0xff3a24, transparent: true, opacity: 0.55, roughness: 0.15, emissive: RED, emissiveIntensity: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
  glassO: new THREE.MeshPhysicalMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.6, roughness: 0.2, emissive: 0xff5a10, emissiveIntensity: 0.16, clearcoat: 1, depthWrite: false }),
  // хром y2k: отражает тёмную комнату с красными полосами света (карта отражений — в buildAtmosphere)
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xffe4e4, metalness: 1, roughness: 0.1, clearcoat: 1, envMapIntensity: 2.2 }),
  gloss: new THREE.MeshPhysicalMaterial({ color: RED, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: RED, emissiveIntensity: 0.12 }),
};
// плиты разной толщины вокруг носителя — как в кинетическом 3D-наборе
function slabs(group, w, h, seed) {
  const r = mulberry(seed);
  for (let i = 0; i < 9; i++) {
    const m = [MAT.matte, MAT.glassO, MAT.graphite, MAT.glass, MAT.glass, MAT.matte][(r() * 6) | 0];
    const sw = 1 + r() * 4, sh = h * (0.4 + r() * 0.9), sd = 0.8 + r() * 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), m);
    const side = r() < 0.5 ? -1 : 1;
    b.position.set(side * (w / 2 + sw / 2 - r() * 2), (r() - 0.5) * h * 0.5, -sd / 2 + r() * 1.5);
    group.add(b);
  }
}

// ---------- текстуры ----------
function windowsTexture(seed, redShare) {
  // окна по рефам 4 и 5: фиолетово-чёрный фасад, багровые окна в точку, редкие розовые — с силуэтами жильцов
  const r = mulberry(seed), c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#120d17'; g.fillRect(0, 0, 128, 512);
  for (let y = 6; y < 512; y += 14) for (let x = 6; x < 128; x += 13) {
    const v = r();
    if (v < redShare) { g.fillStyle = `rgba(255,${30 + r() * 40 | 0},${40 + r() * 30 | 0},${0.55 + r() * 0.45})`; g.fillRect(x, y, 8, 9); g.fillStyle = 'rgba(18,13,23,.55)'; for (let dy = 1; dy < 9; dy += 3) g.fillRect(x, y + dy, 8, 1); }
    else if (v < redShare + 0.04) { g.fillStyle = 'rgba(255,110,140,.8)'; g.fillRect(x, y, 8, 9); if (r() < 0.5) { g.fillStyle = '#1a0a12'; g.fillRect(x + 3, y + 3, 2, 6); g.fillRect(x + 3, y + 1, 2, 2); } }
    else if (v < redShare + 0.08) { g.fillStyle = `rgba(225,217,207,${0.22 + r() * 0.3})`; g.fillRect(x, y, 8, 9); }
    else { g.fillStyle = '#1a1420'; g.fillRect(x, y, 8, 9); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function textTexture(lines, { w = 1024, h = 512, bg = '#111111', color = '#E1D9CF', label = '', accent = 0 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#F40709'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  if (label) { g.fillStyle = '#F40709'; g.font = `28px AP, monospace`; g.fillText(label, 44, 70); }
  lines.forEach((l, i) => { g.fillStyle = i === accent ? '#F40709' : color; g.font = `520 ${i === 0 ? 150 : 64}px TT, sans-serif`; g.fillText(l, 40, 220 + i * 120 - (i ? 30 : 0)); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const LOAD = { loaded: 0, total: 0 };
THREE.DefaultLoadingManager.onProgress = (u, l, t) => { LOAD.loaded = l; LOAD.total = t; const el = document.getElementById('loadPct'); if (el) el.textContent = String(Math.round(100 * l / Math.max(1, t))).padStart(3, '0'); };
const texLoader = new THREE.TextureLoader();
// ---------- бетон мегаструктуры: бесшовная опалубка 16×16 м (assets/concrete, сгенерирована процедурно) ----------
const CONC = (() => {
  const ld = u => { const t = texLoader.load(u); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const map = ld('assets/concrete/albedo.jpg'); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, normalMap: ld('assets/concrete/normal.jpg'), roughnessMap: ld('assets/concrete/rough.jpg'), color: 0xa09d98, normalScale: new THREE.Vector2(1.4, 1.4) });
})();
const CONC_FLOOR = CONC.clone(); CONC_FLOOR.color.set(0x6e6c68); CONC_FLOOR.roughness = 0.62;   // пол чуть влажный: ловит блики ламп
// коробка с UV в метрах: текстура ложится одинаково на стену в 480 м и на тумбу в 4 м
function cgeo(w, h, d, T = 16) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let k = 0; k < 24; k++) { const f = dims[k >> 2]; uv.setXY(k, uv.getX(k) * f[0] / T, uv.getY(k) * f[1] / T); }
  return g;
}
function caseTexture(url, tint = true, W = 512, H = 320) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#2a0506'; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image(); img.onload = () => {
    const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff3a2a'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, W, 1); }
    t.needsUpdate = true;
  }; img.src = url; return t;
}
const CASE_IMGS = ['ozon-fandom-kv-1', 'ozon-fandom-real-1', 'ozon-fandom-real-2', 'ozon-fandom-real-3', 'ozon-select-1', 'ozon-select-2', 'ozon-select-3', 'megafon-zone-1', 'megafon-zone-2', 'baltika7-domes-1', 'baltika7-domes-2', 'ozon-fandom-3d-1'].map(n => `assets/cases/${n}.jpg`);

// ---------- город ----------
const TOWER = { w: 80, h: 260, d: 40 };
function buildCity() {
  // минималистичные корпуса по рефу 1: тело — матовый чёрный с редкими тусклыми окнами,
  // на нём плиты глянцевого кремового, рёбра красного стекла и чёрные надстройки
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mats = [0.05, 0.09, 0.03, 0.12].map((share, i) => {
    const tex = windowsTexture(100 + i, share * 0.6); tex.repeat.set(1, 1.4);   // крупные окна, меньше мелкой ряби
    return new THREE.MeshStandardMaterial({ color: 0x3a3b42, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.9, metalness: 0.05 });
  });
  const cells = [];
  for (let x = -340; x <= 340; x += 34) for (let z = -340; z <= 1320; z += 34) {   // реже и шире — мир разряжен
    if (Math.abs(x) < 20 && z > -20) continue;               // улица
    if (Math.abs(x) < 62 && Math.abs(z) < 42) continue;      // площадь у башни
    if (Math.abs(z - 150) < 15) continue;                    // перекрёсток
    if (reservedByWorld(x, z)) continue;                      // улица после развилки, башни atl и «дикси»
    if (Math.abs(x) < 20 && z > TAIL.brief - 10) continue;    // торец проспекта под бриф
    if (rand() < 0.12) continue;
    const dist = Math.hypot(x, z * 0.8), near = Math.abs(x) < 50 && z > 0;
    const h = near ? 30 + rand() * 70 : 25 + rand() * (60 + Math.min(dist, 380) * 0.35);
    cells.push({ x: x + (rand() - .5) * 4, z: z + (rand() - .5) * 4, w: 20 + rand() * 9, d: 20 + rand() * 9, h, m: (rand() * 4) | 0 });
  }
  CITY.cells = cells;
  const dummy = new THREE.Object3D();
  mats.forEach((mat, mi) => {
    const list = cells.filter(c => c.m === mi);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((c, i) => { dummy.position.set(c.x, 0, c.z); dummy.scale.set(c.w, c.h, c.d); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    scene.add(im);
  });
  // акценты: плиты, рёбра, надстройки — три InstancedMesh по материалам
  const acc = { cream: [], graphite: [], glass: [], glassO: [], matte: [] };
  cells.forEach(c => {
    const toStreet = -Math.sign(c.x) || 1, r = rand;
    if (r() < 0.1) acc.cream.push([c.x + toStreet * (c.w / 2 + 0.6), c.h * (0.25 + r() * 0.3), c.z + (r() - .5) * c.d * 0.4, 1.2, c.h * (0.5 + r() * 0.55), c.d * (0.25 + r() * 0.35)]);
    if (r() < 0.35) acc.graphite.push([c.x + toStreet * (c.w / 2 + 0.6), c.h * (0.25 + r() * 0.3), c.z + (r() - .5) * c.d * 0.4, 1.2, c.h * (0.5 + r() * 0.55), c.d * (0.25 + r() * 0.35)]);
    if (r() < 0.42) acc.glass.push([c.x + (r() - .5) * c.w * 0.6, c.h * (0.35 + r() * 0.3), c.z + c.d / 2 + 1.6, 0.9, c.h * (0.4 + r() * 0.5), 3.2 + r() * 3]);
    if (r() < 0.3) acc.glassO.push([c.x + toStreet * (c.w / 2 + 1.8), c.h * (0.15 + r() * 0.25), c.z - c.d * 0.2, 2.4, c.h * (0.25 + r() * 0.35), c.d * (0.2 + r() * 0.25)]);
    if (r() < 0.4) { const k = 0.4 + r() * 0.35, hh = 5 + r() * 16; acc.matte.push([c.x + (r() - .5) * c.w * 0.3, c.h + hh / 2, c.z + (r() - .5) * c.d * 0.3, c.w * k, hh, c.d * k]); }
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const [k, list] of Object.entries(acc)) {
    const im = new THREE.InstancedMesh(box, MAT[k], list.length);
    list.forEach(([x, y, z, w, h, d], i) => { dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    scene.add(im);
  }
  // экраны на фасадах вдоль улицы — на них крутятся наши кейсы
  cells.filter(c => Math.abs(c.x) < 60 && c.z > -10 && c.z < TAIL.brief).forEach((c, i) => {
    if (rand() < 0.82) return;
    const tw = 12 + rand() * 6, th = tw * (rand() < .5 ? 0.62 : 1.6);
    const mat = new THREE.MeshBasicMaterial({ map: caseTexture(CASE_IMGS[i % CASE_IMGS.length]), toneMapped: false });
    mat.color.setScalar(1.3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), mat);
    const side = Math.sign(c.x) || 1;
    m.position.set(c.x - side * (c.w / 2 + 0.2), Math.min(c.h - th / 2 - 2, 10 + rand() * 40), c.z);
    m.rotation.y = -side * Math.PI / 2;
    scene.add(m);
  });
  // неоновые вертикальные вывески
  const neonMat = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }); neonMat.color.multiplyScalar(2.4);
  for (let i = 0; i < 14; i++) {
    const c = cells[(rand() * cells.length) | 0]; if (Math.abs(c.x) > 120) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6 + rand() * 18, 0.6), neonMat);
    m.position.set(c.x + c.w / 2 * (rand() < .5 ? 1 : -1), 8 + rand() * c.h * 0.7, c.z + c.d / 2);
    scene.add(m);
  }
  // мокрая улица
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.04 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground); CITY.ground = ground;
  for (let z = 50; z < TAIL.brief - 10; z += 12) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: 0x3a3a44 }));
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
  }
  [80, TAIL.awards - 40, TAIL.awards + 40, TAIL.brief - 30].forEach((z, i) => {
    const pl = new THREE.PointLight(i % 2 ? RED : 0xff5533, 420, 60, 1.8); pl.position.set(i % 2 ? 12 : -12, 14, z); scene.add(pl);
  });
}

// ---------- башня, вентиляторы, логотип ----------
const fans = { blades: null, list: [], speed: 0.6 };
function buildTower() {
  const tex = windowsTexture(7, 0.02); tex.repeat.set(2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2b30, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.9, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.d), mat); body.position.y = TOWER.h / 2; scene.add(body);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w * 0.7, 18, TOWER.d * 0.7), MAT.matte); crown.position.y = TOWER.h + 9; scene.add(crown);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 40), new THREE.MeshStandardMaterial({ color: 0x333333 })); mast.position.y = TOWER.h + 38; scene.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4), new THREE.MeshBasicMaterial({ color: RED, toneMapped: false })); tip.position.y = TOWER.h + 59; scene.add(tip); fans.tip = tip;
  // без неона: кремовая глянцевая плита по левому краю фасада и два стеклянных ребра справа
  const cs = new THREE.Mesh(new THREE.BoxGeometry(8, TOWER.h * 0.82, 3), MAT.graphite); cs.position.set(-TOWER.w / 2 - 2, TOWER.h * 0.41, TOWER.d / 2 - 4); scene.add(cs);
  [0, 5].forEach(dz => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.8, TOWER.h * 0.6, 6), MAT.glass); f.position.set(TOWER.w / 2 + 0.4, TOWER.h * 0.5, TOWER.d / 2 - 6 - dz * 3); scene.add(f); });
  [[-44, 60, 26, 9, MAT.glassO], [44, 150, 40, 7, MAT.glass], [-45, 190, 30, 5, MAT.glass]].forEach(([x, y, h, d, m]) => { const g = new THREE.Mesh(new THREE.BoxGeometry(3, h, d), m); g.position.set(x, y, TOWER.d / 2 - d / 2 + 2); scene.add(g); });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w + 4, 3, TOWER.d + 4), MAT.gloss); cap.position.y = TOWER.h + 1.5; scene.add(cap);


  // вентиляторы: корпуса — один InstancedMesh, лопасти — второй, их матрицы крутим каждый кадр
  const slots = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) slots.push({ face: 'front', x: -27 + col * 18, y: 66 + row * 24 });
  for (const side of [-1, 1]) for (let row = 0; row < 8; row++) for (let col = 0; col < 2; col++) slots.push({ face: side, z: -9 + col * 18, y: 30 + row * 26 });
  const R = 7;
  const housing = new THREE.InstancedMesh(new THREE.TorusGeometry(R, 0.9, 8, 32), new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: RED, emissiveIntensity: 0.0, metalness: 0.8, roughness: 0.3 }), slots.length);
  const hubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 16), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 }), slots.length);
  const bladeGeo = new THREE.BoxGeometry(1.8, R - 1.5, 0.25); bladeGeo.translate(0, (R - 1.5) / 2 + 1, 0);
  const blades = new THREE.InstancedMesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0x9a9aa6, metalness: 0.7, roughness: 0.35 }), slots.length * 5);
  const d = new THREE.Object3D();
  slots.forEach((s, i) => {
    const pos = new THREE.Vector3(), rot = new THREE.Euler();
    if (s.face === 'front') { pos.set(s.x, s.y, TOWER.d / 2 + 1.2); rot.set(0, 0, 0); }
    else { pos.set(s.face * (TOWER.w / 2 + 1.2), s.y, s.z); rot.set(0, s.face * Math.PI / 2, 0); }
    d.position.copy(pos); d.rotation.copy(rot); d.scale.setScalar(1); d.updateMatrix(); housing.setMatrixAt(i, d.matrix);
    d.rotateX(Math.PI / 2); d.updateMatrix(); hubs.setMatrixAt(i, d.matrix);
    fans.list.push({ pos, rot, phase: rand() * 6 });
  });
  scene.add(housing, hubs, blades);
  fans.blades = blades; fans.housing = housing;

  // поток воздуха из вентиляторов
  const N = 2400, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3); fans.air = { g, p, seeds: [] };
  for (let i = 0; i < N; i++) { const f = fans.list[i % fans.list.length]; fans.air.seeds.push({ f, t: rand(), spread: new THREE.Vector2(rand() - .5, rand() - .5) }); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: CREAM, size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts); fans.air.mat = pts.material; fans.air.pts = pts;
}
const dmy = new THREE.Object3D(), fwd = new THREE.Vector3();
function updateFans(dt, power) {
  fans.speed += ((0.6 + power * 14) - fans.speed) * Math.min(1, dt * 1.5);
  fans.list.forEach((f, i) => {
    f.phase += fans.speed * dt;
    for (let b = 0; b < 5; b++) {
      dmy.position.copy(f.pos); dmy.rotation.copy(f.rot); dmy.rotateZ(f.phase + b * Math.PI * 2 / 5); dmy.rotateY(0.35);
      dmy.updateMatrix(); fans.blades.setMatrixAt(i * 5 + b, dmy.matrix);
    }
  });
  fans.blades.instanceMatrix.needsUpdate = true;
  fans.housing.material.emissiveIntensity = 0;
  // воздух: частицы вылетают из вентиляторов наружу
  const { p, seeds, g, mat } = fans.air;
  mat.opacity = power * 0.55;
  seeds.forEach((s, i) => {
    s.t += dt * (0.25 + power * 0.9); if (s.t > 1) s.t -= 1;
    fwd.set(0, 0, 1).applyEuler(s.f.rot);
    const dist = s.t * 70, sp = 3 + s.t * 18;
    const right = new THREE.Vector3(1, 0, 0).applyEuler(s.f.rot);
    p[i * 3] = s.f.pos.x + fwd.x * dist + right.x * s.spread.x * sp;
    p[i * 3 + 1] = s.f.pos.y + s.spread.y * sp + s.t * 10;
    p[i * 3 + 2] = s.f.pos.z + fwd.z * dist + right.z * s.spread.x * sp;
  });
  g.attributes.position.needsUpdate = true;
}

// логотип и Искра из SVG брендбука. Искра — это вырез в «O», поэтому её контур берём из того же файла: встаёт точно в слот
const logo = { group: null, mat: null, power: 0 };
let iskra, slotWorld = new THREE.Vector3();
async function buildLogo() {
  const data = await new SVGLoader().loadAsync('assets/logo.svg');
  let shapes = []; data.paths.forEach(p => shapes.push(...SVGLoader.createShapes(p)));
  const bb = s => { const b = new THREE.Box2(); s.getPoints().forEach(pt => b.expandByPoint(pt)); return b; };
  const boxes = shapes.map(bb);
  const all = new THREE.Box2(); boxes.forEach(b => all.union(b));
  // «O» — самая левая форма; Искра — её самая большая дыра (или отдельная форма внутри «O»)
  const oIdx = boxes.reduce((m, b, i) => b.min.x < boxes[m].min.x ? i : m, 0);
  const oShape = shapes[oIdx];
  let iskraPts;
  if (oShape.holes.length) {
    const hole = oShape.holes.map(h => ({ h, b: (() => { const b = new THREE.Box2(); h.getPoints().forEach(pt => b.expandByPoint(pt)); return b; })() }))
      .sort((a, b) => (b.b.max.x - b.b.min.x) * (b.b.max.y - b.b.min.y) - (a.b.max.x - a.b.min.x) * (a.b.max.y - a.b.min.y))[0];
    iskraPts = hole.h.getPoints(6);
  } else {
    const inner = boxes.findIndex((b, i) => i !== oIdx && boxes[oIdx].containsBox(b));
    iskraPts = shapes[inner].getPoints(6); shapes.splice(inner, 1);
  }
  const cx = (all.min.x + all.max.x) / 2, cy = (all.min.y + all.max.y) / 2;
  const S = 72 / (all.max.x - all.min.x);
  const depth = 10;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(-cx, -cy, 0);
  logo.mat = new THREE.MeshPhysicalMaterial({ color: 0x1a0707, emissive: RED, emissiveIntensity: 0, roughness: 0.75, clearcoat: 0.15, clearcoatRoughness: 0.6, side: THREE.DoubleSide });   // до посадки Искры — тусклый, пыльный
  const mesh = new THREE.Mesh(geo, logo.mat);
  logo.group = new THREE.Group(); logo.group.add(mesh);
  logo.group.scale.set(S, -S, S);
  logo.group.position.set(0, LOGO_Y, W0 + 0.6);
  scene.add(logo.group); mesh.castShadow = true;

  // Искра
  const ib = new THREE.Box2(); iskraPts.forEach(pt => ib.expandByPoint(pt));
  const icx = (ib.min.x + ib.max.x) / 2, icy = (ib.min.y + ib.max.y) / 2;
  const iShape = new THREE.Shape(iskraPts.map(pt => new THREE.Vector2(pt.x - icx, -(pt.y - icy))));
  const igeo = new THREE.ExtrudeGeometry(iShape, { depth: 10, bevelEnabled: false, curveSegments: 8 });
  igeo.translate(0, 0, -5); igeo.computeVertexNormals();
  const imat = new THREE.MeshPhysicalMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  iskra = new THREE.Mesh(igeo, imat);
  iskra.userData.slotScale = S * 0.998;
  scene.add(iskra);
  const key = new THREE.PointLight(0xffc8a8, 0, 230, 1.25); scene.add(key); iskra.userData.key = key;   // свет самой Искры: в темноте он один
  logo.group.updateMatrixWorld(true);
  slotWorld.set(icx - cx, icy - cy, depth / 2).applyMatrix4(logo.group.matrixWorld);
  const glow = new THREE.PointLight(0xffe8dc, 0, 260, 1.2); glow.position.copy(slotWorld).add(new THREE.Vector3(0, -14, 90)); scene.add(glow); logo.glow = glow;
}

// ---------- разделы на улице ----------
// проспект (z растёт от башни): площадь с шоурилом → перекрёсток btl/atl → btl на земле → atl «в эфире» на небоскрёбах → награды → о нас → бриф
const diorama = new THREE.Group();
const clickable = [];
// носители: плоский экран и красная рамка вокруг него
const promo = { v: null, started: false, rim: null };
const board = (tex, w, h, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.copy(pos); m.rotation.y = ry; scene.add(m); return m; };
const rim = (w, h, pos, ry) => { const g = promo.rim = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.6, h + 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2.5), toneMapped: false })); g.position.copy(pos); g.rotation.y = ry; g.translateZ(-0.05); scene.add(g); };
function buildSections() {

  // площадь: экран шоурила
  const video = Object.assign(document.createElement('video'), { src: 'assets/oxygen_promo_v2.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'none' });
  promo.v = video;   // шоурил качается, когда камера начинает спуск к башне, а не при открытии страницы
  const vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
  const reelPos = V(0, 30, W0 + 0.8);
  rim(64, 36, reelPos, 0);
  const reel = board(vtex, 64, 36, reelPos, 0); reel.position.z += 0.1; reel.userData.modal = 'reel'; clickable.push(reel);

  buildWorld();

  // награды
  board(textTexture(['16', 'металл: gold · silver · bronze'], { label: '{06} · награды', accent: 0 }), 44, 22, V(19.5, 18, TAIL.awards), -Math.PI / 2);

  // бриф
  board(textTexture(['бриф', 'ответим за рабочий день'], { label: '{08} · oxygen', bg: '#F40709', color: '#111111', accent: -1 }), 50, 25, V(0, 22, TAIL.brief), Math.PI);
}
// ---------- стенд кейса посреди улицы: крупный главный кадр, под ним ряд кадров, сверху табличка ----------
const aim = (o, cam) => { o.rotation.y = Math.atan2(cam.x - o.position.x, cam.z - o.position.z); return o; };
function labelTex(txt, sub = '') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#111111'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#F40709'; g.fillRect(0, 0, 12, 160);
  let fs = 84; const f = () => (g.font = `520 ${fs}px TT, sans-serif`); f(); while (g.measureText(txt).width > 950 && fs > 36) { fs -= 4; f(); }
  g.fillStyle = '#E1D9CF'; g.fillText(txt, 40, sub ? 92 : 108);
  if (sub) { g.font = '26px AP, monospace'; g.fillStyle = '#F40709'; g.fillText(sub, 42, 138); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// mustang ironstar: оранжевый кабриолет g-drive, как на фото кейса — белые надписи по бортам и корме, полоса на лобовом, табло со временем гонки
const ledTimer = { c: null, g: null, t: null, last: -1 };
function decalTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const gdrive = (g, x, y, s, col = '#ffffff') => { g.fillStyle = col; g.font = `italic 800 ${s}px TT, sans-serif`; g.fillText('G·DRIVE', x, y); };
const ironstar = (g, x, y, s, col = '#ffffff') => {
  g.fillStyle = col; g.font = `800 ${s}px TT, sans-serif`; g.fillText('IRON', x, y); const w = g.measureText('IRON').width;
  g.strokeStyle = col; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(x + w + s * 0.05, y - s * 0.32); g.lineTo(x + w + s * 0.2, y - s * 0.32); g.lineTo(x + w + s * 0.3, y - s * 0.75); g.lineTo(x + w + s * 0.42, y + s * 0.05); g.lineTo(x + w + s * 0.52, y - s * 0.32); g.lineTo(x + w + s * 0.66, y - s * 0.32); g.stroke();
  g.fillText('STAR', x + w + s * 0.72, y);
};
function drawTimer(sec) {
  const g = ledTimer.g, w = 512, h = 128; g.fillStyle = '#1a0606'; g.fillRect(0, 0, w, h);
  const txt = `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  g.font = '700 104px AP, monospace'; g.fillStyle = '#ff3a1a'; g.textAlign = 'center'; g.fillText(txt, w / 2, 102);
  g.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);   // точки светодиодной матрицы
  ledTimer.t && (ledTimer.t.needsUpdate = true);
}
// chery tiggo 8 пресс-кара «шёлкового пути»: тёмно-синий кузов, оранжевый капот с g-drive, надписи на дверях, раллийный номер
const tiggoTex = {};
// реальные машины со sketchfab (cc by): ford mustang gt convertible 2018 — adrianaflak09, chery tiggo 8 pro — niev.
// модель приводится к длине len, нос по +x, колёса на y = 0; брендинг — наклейками поверх кузова
const carCache = {};
function carModel(file, len, flip, dress) {
  const g = new THREE.Group();
  (carCache[file] ||= gltfLoader.loadAsync(`assets/models/cars/${file}.glb`)).then(gl => {
    const m = gl.scene.clone(true), b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3());
    m.rotation.y = (sz.z > sz.x ? -Math.PI / 2 : 0) + (flip ? Math.PI : 0);
    const w = new THREE.Group(); w.add(m); w.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(w), s2 = b2.getSize(new THREE.Vector3()), k = len / s2.x;
    w.scale.setScalar(k); w.position.set(-(b2.min.x + b2.max.x) / 2 * k, -b2.min.y * k, -(b2.min.z + b2.max.z) / 2 * k);
    m.traverse(o => { if (o.isMesh && o.material && /paint|carpaint/i.test(o.material.name)) { o.material.envMap = MAT.chrome.envMap; o.material.envMapIntensity = 0.9; } });
    g.add(w); dress && dress(g, len, s2.y * k, s2.z * k);
  }).catch(e => console.warn(file, e));
  return g;
}
const dmat = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
function mustangIronStar() {
  return carModel('mustang', 4.8, false, (g, L, H, W) => {
    const door = decalTex(512, 220, (c) => { c.fillStyle = '#fff'; c.font = 'italic 800 150px TT, sans-serif'; c.fillText('G', 40, 150); gdrive(c, 30, 200, 34); c.fillRect(218, 40, 5, 160); ironstar(c, 245, 120, 78); });
    const fender = decalTex(512, 110, (c) => ironstar(c, 20, 86, 74)), rear = decalTex(512, 90, (c) => gdrive(c, 20, 70, 66));
    [1, -1].forEach(sd => { const z = sd * (W / 2 + 0.015), ry = sd > 0 ? 0 : Math.PI;
      const a = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.52), dmat(door)); a.position.set(-0.15, 0.62, z); a.rotation.y = ry; g.add(a);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.19), dmat(fender)); f.position.set(1.45, 0.78, z); f.rotation.y = ry; g.add(f);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.14), dmat(rear)); r.position.set(-1.7, 0.78, z); r.rotation.y = ry; g.add(r); });
    // табло со временем гонки над задними сиденьями
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; ledTimer.c = c; ledTimer.g = c.getContext('2d');
    ledTimer.t = new THREE.CanvasTexture(c); ledTimer.t.colorSpace = THREE.SRGBColorSpace; drawTimer(3738);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 1.3), MAT.matte); board.position.set(-1.0, H + 0.45, 0); g.add(board);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.3), new THREE.MeshBasicMaterial({ map: ledTimer.t, toneMapped: false })); scr.position.set(-1.045, H + 0.45, 0); scr.rotation.y = -Math.PI / 2; g.add(scr);
    [-0.45, 0.45].forEach(z => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), MAT.chrome); p.position.set(-1.0, H + 0.08, z); g.add(p); });
  });
}
function tiggoPress(n) {
  return carModel('tiggo8', 4.7, false, (g, L, H, W) => {
    tiggoTex.hood ||= decalTex(512, 400, (c, w, h) => { c.fillStyle = '#ff6a10'; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); gdrive(c, -150, 30, 78); c.restore(); });
    const hood = new THREE.Mesh(new THREE.PlaneGeometry(1.15, W * 0.86), new THREE.MeshStandardMaterial({ map: tiggoTex.hood, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    hood.rotation.set(-Math.PI / 2, 0, 0); hood.rotateY(0.13); hood.position.set(1.6, H * 0.665, 0); g.add(hood);
    tiggoTex.door ||= decalTex(512, 120, (c) => gdrive(c, 20, 92, 92, '#ff6a10'));
    tiggoTex.plate = decalTex(200, 240, (c) => { c.fillStyle = '#f2efe9'; c.fillRect(0, 0, 200, 240); c.fillStyle = '#ff6a10'; c.fillRect(0, 0, 200, 46); c.fillStyle = '#111'; c.font = '800 92px TT, sans-serif'; c.textAlign = 'center'; c.fillText(String(n), 100, 160); c.font = '22px AP, monospace'; c.fillText('MEDIA', 100, 210); });
    [1, -1].forEach(sd => { const z = sd * (W / 2 + 0.015), ry = sd > 0 ? 0 : Math.PI;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.25), dmat(tiggoTex.door)); d.position.set(0.55, 0.62, z); d.rotation.y = ry; g.add(d);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.46), dmat(tiggoTex.plate)); p.position.set(-0.75, 0.8, z); p.rotation.y = ry; g.add(p); });
  });
}
function goose() {
  const g = new THREE.Group(), b = new THREE.MeshStandardMaterial({ color: 0xc9bfb2, emissive: 0x3a3430, roughness: 0.8 }), beak = new THREE.MeshStandardMaterial({ color: 0xff7a10, roughness: 0.5 });
  const add = (geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; g.add(o); return o; };
  add(new THREE.SphereGeometry(1, 28, 18), b, 0, 2.6, 0).scale.set(2.2, 1.3, 1.25);
  add(new THREE.ConeGeometry(0.6, 1.4, 12), b, -2.3, 3.1, 0, Math.PI / 2 + 0.5);
  g.userData.neck = add(new THREE.CylinderGeometry(0.36, 0.55, 3.2, 14), b, 1.7, 4.4, 0, -0.35);
  add(new THREE.SphereGeometry(0.72, 20, 14), b, 2.3, 6, 0);
  add(new THREE.ConeGeometry(0.3, 1.1, 12), beak, 3.3, 5.9, 0, -Math.PI / 2);
  [-0.55, 0.55].forEach(z => { add(new THREE.SphereGeometry(0.1, 8, 6), MAT.matte, 2.75, 6.2, z * 0.95); add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), beak, 0.2, 0.8, z); add(new THREE.BoxGeometry(0.8, 0.08, 0.6), beak, 0.45, 0.04, z); });
  return g;
}
function teeGeometry() {
  const s = new THREE.Shape(); s.moveTo(-1.2, 0); s.lineTo(1.2, 0); s.lineTo(1.2, 2.2); s.lineTo(2.1, 1.7); s.lineTo(2.6, 2.6); s.lineTo(1.4, 3.4); s.lineTo(0.5, 3.4); s.quadraticCurveTo(0, 2.9, -0.5, 3.4); s.lineTo(-1.4, 3.4); s.lineTo(-2.6, 2.6); s.lineTo(-2.1, 1.7); s.lineTo(-1.2, 2.2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }); g.scale(0.62, 0.62, 1); return g;
}
// экран atl/ai на кронштейне: развёрнут к точке, откуда на него смотрит камера
function screenAt(tex, w, h, pos, cam, id) {
  const g = new THREE.Group(); g.position.copy(pos); aim(g, cam); scene.add(g);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 2.4, h + 2.4, 1.2), MAT.matte); back.position.z = -0.75; g.add(back);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, h + 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.4), toneMapped: false })); r.position.z = -0.1; g.add(r);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); g.add(m);
  if (id) { m.userData.case = id; clickable.push(m); }
  return { g, m };
}
function tagAt(title, sub, pos, cam, w = 20) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.156), new THREE.MeshBasicMaterial({ map: labelTex(title, sub) })); m.position.copy(pos); aim(m, cam); scene.add(m); return m; }
const webtoon = { tex: null, tops: [], total: 1, win: 1 };
const lionDance = { mixer: null, t: 0 }, spinners = [], rally = [], swing = [];
const vsign = (txt, x, y, z, col, bg = '#111111', w = 2.6) => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 512); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, 116, 500);
  g.fillStyle = col; g.font = '700 84px "Hiragino Sans","Apple SD Gothic Neo","Noto Sans CJK JP",sans-serif'; g.textAlign = 'center';
  [...txt].forEach((ch, i) => g.fillText(ch, 64, 100 + i * 96));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide }));
  m.material.color.setScalar(col === '#E1D9CF' ? 0.85 : 1.3);
  m.position.set(x, y, z); m.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(m); return m;
};
function webtoonInto(mat, aspect) {
  // полотна в порядке, который дал владелец: обложка → кабаны → амулет → кузня → валькирия → 1025 год → постер
  const W = 512, srcs = [1, 2, 3, 4, 5, 6, 7].map(i => `assets/webtoon/izhora-0${i}.jpg`);
  Promise.all(srcs.map(src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; }))).then(list => {
    const ims = list.filter(Boolean), hs = ims.map(im => Math.round(im.height * W / im.width)), total = hs.reduce((a, b) => a + b, 0);
    const c = document.createElement('canvas'); c.width = W; c.height = total; const g = c.getContext('2d');
    let y = 0; webtoon.tops = ims.map((im, i) => { g.drawImage(im, 0, y, W, hs[i]); const t = y; y += hs[i]; return t; });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    webtoon.win = W / aspect; webtoon.total = total; tex.repeat.set(1, webtoon.win / total);
    mat.map = tex; mat.color.setScalar(0.62); mat.needsUpdate = true; webtoon.tex = tex;
  });
}
function updateWebtoon(time) {
  // держим панель, потом мягко листаем к следующей — как читают вебтун пальцем
  const T = webtoon.tex; if (!T) return;
  const n = webtoon.tops.length, seg = 4.2, k = Math.floor(time / seg) % n, f = (time % seg) / seg;
  const a = webtoon.tops[k], b = k + 1 < n ? webtoon.tops[k + 1] : webtoon.total;
  const e = f < 0.62 ? 0 : smooth((f - 0.62) / 0.38), px = a + (b - a) * e;
  T.offset.y = 1 - (px + webtoon.win) / webtoon.total;
}
function plate(url, w, h, pos, ry, cls) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: caseTexture(url, false, 768, Math.round(768 * h / w)) }));
  m.position.copy(pos); m.rotation.y = ry; scene.add(m); if (cls) { m.userData.case = cls; clickable.push(m); } return m;
}
const clips = [], floaters = [];   // ролики на носителях: качаются и играют только на подлёте камеры

// ---------- мир после развилки: одна таблица — из неё места кейсов, камера, рассказы, навигация и обзоры ----------
// btl идёт по земле: камера в коридоре x = 12, кейсы левее коридора (в кадре справа), рассказ — слева.
// atl летит над той же улицей: коридор x = 0 на высоте носителей, экраны на фасадах и стенды на крышах.
// в коридоры ничего не ставим — так камера не проходит сквозь объекты.
const LANE = { btl: { x: 12, y: 11 }, atl: { x: 0 } };
const STEP = 60, ZONE_GAP = 40, Z0 = 230, TAN = Math.tan(25 * Math.PI / 180);
const ZONES = {
  asia: { t: 'азиатский квартал', more: 'asia' }, joint: { t: 'ozon селект' }, sport: { t: 'спорт', more: 'sport' },
  event: { t: 'ивенты', more: 'event' }, merch: { t: 'квартал мерча', more: 'merch' },
  asiaAir: { t: 'азия в эфире', more: 'asia', over: 'asia' }, dixy: { t: '«дикси»', more: 'dixy', over: 'asia' }, arena: { t: 'спорт в эфире', more: 'sport', over: 'sport' },
  city: { t: 'города и бренды', over: 'event' }, ai: { t: 'ai-продакшн', more: 'ai', over: 'merch' },
};
// kind: station — подиум с героем и стенд за ним; vitrine — витрина мерча; screen — экран на фасаде; roof — стенд на крыше башни «дикси»
// hero — габарит объекта кейса [ширина, глубина, высота]; s — сторона улицы у экранов atl (1 — x > 0, в кадре слева)
const WORLD = [
  { id: 'fandom', r: 'btl', zone: 'asia', kind: 'station', hero: [26, 20, 12], imgs: ['ozon-fandom-kv-1', 'ozon-fandom-real-1', 'ozon-fandom-real-2', 'ozon-fandom-real-3'], nav: 'ozon corp', orbit: true, moment: 'fandom' },
  { id: 'tbank', r: 'btl', zone: 'asia', kind: 'station', hero: [16, 16, 10], imgs: ['tbank-zone-1', 'tbank-zone-top-1', 'tbank-road-1', 'tbank-cover-1'], nav: 'чёрный пояс по it', moment: 'tbank' },
  { id: 'selekt', r: 'btl', zone: 'joint', kind: 'station', hero: [14, 4, 10], imgs: ['ozon-select-1', 'ozon-select-0', 'ozon-select-2', 'ozon-select-3'], nav: 'ozon селект' },
  { id: 'lion', r: 'btl', zone: 'sport', kind: 'station', hero: [14, 14, 16], imgs: ['../dp/lion-2', '../dp/lion-1', '../dp/lion-cover'], nav: 'синегривый лев', moment: 'lion' },
  { id: 'ironstar', r: 'btl', zone: 'sport', kind: 'station', hero: [12, 12, 4], imgs: ['gdrive-ironstar-1'], nav: 'ironstar', moment: 'ironstar' },
  { id: 'gdrive', r: 'btl', zone: 'sport', kind: 'station', hero: [30, 8, 4], imgs: ['gdrive-silk-1', 'gdrive-silk-road-1', 'gdrive-silk-road-2', 'gdrive-finish-1'], nav: 'шёлковый путь' },
  { id: 'baltika7', r: 'btl', zone: 'sport', kind: 'station', hero: [12, 10, 5], imgs: ['baltika7-1', 'baltika7-zone-1', 'baltika7-zone-2', 'baltika7-prizes-1'], nav: 'балтика 7' },
  { id: 'baltikaPlant', r: 'btl', zone: 'event', kind: 'station', hero: [7, 4, 8], imgs: ['baltika-plant-1', 'baltika-plant-mock-1', 'baltika-plant-mock-2', 'baltika-plant-ruby-1'], nav: 'гусь на заводе', moment: 'goose' },
  { id: 'megafon', r: 'btl', zone: 'event', kind: 'station', hero: [14, 14, 6], imgs: ['megafon-1', 'megafon-zone-1', 'megafon-zone-2', 'megafon-bullet-1'], nav: 'золотые ворота' },
  { id: 'mice', r: 'btl', zone: 'event', kind: 'station', hero: [8, 6, 6], imgs: ['mice-1', 'mice-details-1', 'mice-details-2', 'mice-out-1'], nav: 'белград' },
  { id: 'megafonTravel', r: 'btl', zone: 'event', kind: 'station', hero: [13, 5, 9], imgs: ['megafon-travel-1', 'megafon-route-1', 'megafon-route-2'], nav: 'связь есть везде' },
  { id: 'gdriveMerch', r: 'btl', zone: 'merch', kind: 'vitrine', imgs: ['gdrive-capsule-1'], nav: 'мерч g-drive' },
  { id: 'oxygenSet', r: 'btl', zone: 'merch', kind: 'vitrine', imgs: ['oxygen-set-1'], nav: 'набор креатора' },
  { id: 'lionMerch', r: 'btl', zone: 'merch', kind: 'vitrine', imgs: ['../dp/lion-cover'], nav: 'мерч льва' },
  { id: 'izhora', r: 'atl', zone: 'asiaAir', kind: 'screen', s: 1, webtoon: true, nav: 'хроники ижоры', also: ['sport'], moment: 'izhora' },
  { id: 'treschnutye', r: 'atl', zone: 'dixy', kind: 'roof', img: 'treschnutye-1', nav: 'треснутые', also: ['asia'], moment: 'treschnutye' },
  { id: 'zaklinateli', r: 'atl', zone: 'dixy', kind: 'roof', img: 'zaklinateli-kv-1', video: 'zaklinateli', nav: 'заклинатели' },
  { id: 'dino', r: 'atl', zone: 'dixy', kind: 'roof', img: 'dino-1', nav: 'дино' },
  { id: 'avangard', r: 'atl', zone: 'arena', kind: 'screen', s: -1, img: 'avangard-1', nav: 'время авангарда' },
  { id: 'derbent', r: 'atl', zone: 'city', kind: 'screen', s: 1, img: 'derbent-1', nav: 'дербент' },
  { id: 'tevredens', r: 'atl', zone: 'city', kind: 'screen', s: -1, img: 'tevredens-1', video: 'tevredens', nav: 'tevredens' },
  { id: 'aiFonbet', r: 'atl', zone: 'ai', kind: 'screen', s: 1, img: 'ai-fonbet', video: 'ai-fonbet', nav: 'ai · fonbet' },
  { id: 'aiMango', r: 'atl', zone: 'ai', kind: 'screen', s: -1, img: 'ai-mango', video: 'ai-mango', nav: 'ai · mango' },
  { id: 'aiLavka', r: 'atl', zone: 'ai', kind: 'screen', s: 1, img: 'ai-lavka', video: 'ai-lavka', nav: 'ai · лавка' },
  { id: 'aiAlfa', r: 'atl', zone: 'ai', kind: 'screen', s: -1, img: 'ai-alfa', video: 'ai-alfa', nav: 'ai · альфа' },
];
const ZR = {}, TAIL = {};
const MOMENTS = {};   // кейсы-моменты: свой герой, своя камера, свет в бит; см. раздел «моменты»   // z-диапазоны кварталов; z наград и брифа
const DIXY_TOWER = { x: -62, w: 38, d: 40, h: 58 }, BANNER = { h: 30, w: 30 * 9 / 16 };
const ATL_TOWER = { x: 58, w: 44, d: 34, h: 150 }, SCREEN_Y = 74;
// ---------- моменты ----------
// кейс-момент: герой в масштабе дома, своя пролётная камера, свет и типографика бьют в бит 128 bpm.
// общий набор (сцена, прожекторы, лазеры, растяжка, бегущая строка, экран с кадрами) — в kit, герой и его движение — в самом моменте
const BPM = 128, beatAt = t => t * BPM / 60;
const glow = (hex, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
// крупный набор на canvas: залитый или контурный
function typeTex(lines, fill, W = 2048, H = 900) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  let fs = H / lines.length * 0.98; g.font = `620 ${fs}px TT, sans-serif`;
  while (Math.max(...lines.map(l => g.measureText(l).width)) > W * 0.98) { fs -= 8; g.font = `620 ${fs}px TT, sans-serif`; }
  g.lineJoin = 'round';
  lines.forEach((l, i) => { const y = (i + 1) * H / lines.length - fs * 0.16;
    if (fill) { g.fillStyle = '#fff'; g.fillText(l, 0, y); } else { g.strokeStyle = '#fff'; g.lineWidth = fs * 0.025; g.strokeText(l, 0, y); } });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function tickerTex(txt) {
  const c = document.createElement('canvas'); c.width = 4096; c.height = 128; const g = c.getContext('2d');
  g.font = '520 92px TT, sans-serif'; const w = g.measureText(txt).width; g.fillStyle = '#fff';
  for (let x = 0; x < 4096; x += w) g.fillText(txt, x, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
// название в две строки примерно поровну
const twoLines = s => { const w = s.split(' '); if (w.length < 3) return w; let best = 1, d = 1e9; for (let i = 1; i < w.length; i++) { const k = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (k < d) { d = k; best = i; } } return [w.slice(0, best).join(' '), w.slice(best).join(' ')]; };
const LIVE = [];   // { fx, center, update } — работают только рядом с камерой

// o: col — три цвета момента; stage — радиус сцены; laser — откуда веер; ticker — [высота, радиус]; wall — [x, y, z] растяжки; scr — [x, y, z] экрана; cam — откуда смотрит экран
function kit(w, g, o) {
  const fx = { beams: [], lasers: [], rings: [], shots: [], shot: -1, hero: {}, light: o.light ?? 1 }, [c1, c2, c3] = o.col, c = CASES[w.id];
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(o.stage, o.stage + 0.6, 0.8, 72), MAT.graphite); disc.position.y = 0.4; g.add(disc);
  [1, 0.76, 0.52].forEach((k, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(o.stage * k, 0.16, 8, 128), glow(i === 1 ? c2 : c1)); m.rotation.x = Math.PI / 2; m.position.y = 0.85; g.add(m); fx.rings.push(m); });
  fx.wave = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128), glow(c3, 1.6)); fx.wave.rotation.x = -Math.PI / 2; fx.wave.position.y = 0.9; fx.waveR = o.stage * 2; g.add(fx.wave);
  fx.key = new THREE.SpotLight(0xffffff, 0, 140, 0.5, 0.5); fx.key.position.set(26, 50, -40); fx.key.target.position.set(0, 10, 0);
  fx.rim = new THREE.SpotLight(c1, 0, 140, 0.6, 0.4); fx.rim.position.set(-10, 46, 34); fx.rim.target.position.set(0, 12, 0);
  g.add(fx.key, fx.key.target, fx.rim, fx.rim.target);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.4, pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * (o.stage + 5), 52, Math.sin(a) * (o.stage + 5)); g.add(pivot);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 60, 32, 1, true), glow([c1, 0xffffff, c2][i % 3], 0.12)); cone.position.y = -30; pivot.add(cone);
    pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.6, 16), MAT.chrome));
    pivot.lookAt(g.position.x, 0, g.position.z); fx.beams.push({ pivot, base: pivot.rotation.clone(), ph: i * 1.3 });
  }
  const lz = new THREE.Group(); lz.position.set(...o.laser); g.add(lz); fx.lz = lz;
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 160), glow(i % 2 ? c2 : c1, 2.2)); m.geometry.translate(0, 0, -80); m.rotation.y = (i / 13 - 0.5) * 2.2; lz.add(m); fx.lasers.push(m); }
  const tk = new THREE.Mesh(new THREE.CylinderGeometry(o.ticker[1], o.ticker[1], 2.6, 96, 1, true), new THREE.MeshBasicMaterial({ map: tickerTex(`${c.title} · ${c.pass.клиент} · `), transparent: true, side: THREE.DoubleSide, color: new THREE.Color(0xffffff).multiplyScalar(1.4), toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  tk.material.map.repeat.set(3, 1); tk.position.y = o.ticker[0]; g.add(tk); fx.ticker = tk;
  // растяжка над улицей за героем: залитый и контурный набор меняются на сильную долю; камера проходит под ней
  const lines = twoLines(c.title), wallW = 72, wallH = wallW * 900 / 2048;
  fx.typeFill = typeTex(lines, true); fx.typeLine = typeTex(lines, false);
  fx.wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), new THREE.MeshBasicMaterial({ map: fx.typeLine, transparent: true, toneMapped: false, depthWrite: false }));
  fx.wall.position.set(...o.wall); fx.wall.rotation.y = Math.PI; fx.wall.rotateX(0.22); g.add(fx.wall); fx.c3 = c2;
  // экран с кадрами кейса: режется на каждый такт, на склейке вспышка
  fx.shots = w.imgs.map(n => caseTexture(`assets/cases/${n}.jpg`, false, 1024, 640));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(24, 15), new THREE.MeshBasicMaterial({ map: fx.shots[0], toneMapped: false }));
  scr.position.set(...o.scr); scr.rotation.y = Math.atan2(o.cam.x - (g.position.x + o.scr[0]), o.cam.z - (g.position.z + o.scr[2])); g.add(scr); fx.scr = scr;
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(24.8, 15.8), glow(c1, 1.4)); frame.position.copy(scr.position); frame.quaternion.copy(scr.quaternion); frame.translateZ(-0.05); g.add(frame);
  scr.userData.case = w.id; clickable.push(scr);
  solid(scr); solid(fx.wall);
  return fx;
}
function kitUpdate(fx, time, I, beat, kick) {
  const bar = Math.floor(beat / 4), b = Math.floor(beat), drop = (bar % 4) === 3, f = beat % 1;   // каждый четвёртый такт — дроп
  fx.key.intensity = I * fx.light * (900 + 2200 * kick); fx.rim.intensity = I * fx.light * (1400 + 1800 * kick);
  fx.rings.forEach((r, i) => { r.material.opacity = 0.35 + 0.65 * Math.exp(-((beat + i * 0.25) % 1) * 5); });
  fx.wave.scale.setScalar(2 + f * fx.waveR); fx.wave.material.opacity = (1 - f) * 0.8;
  fx.beams.forEach((s, i) => { s.pivot.rotation.set(s.base.x + Math.sin(time * 0.9 + s.ph) * 0.35, s.base.y, s.base.z + Math.cos(time * 0.7 + s.ph) * 0.35); s.pivot.children[0].material.opacity = (0.06 + 0.1 * kick) * I * (drop || (b + i) % 2 ? 1 : 0.35); });
  fx.lz.visible = drop || b % 8 >= 4; fx.lz.rotation.y = Math.sin(time * 1.7) * 0.5; fx.lz.rotation.x = -0.15 + Math.sin(time * 2.3) * 0.12;
  fx.lasers.forEach((m, i) => m.visible = drop ? (b + i) % 2 === 0 : true);
  fx.ticker.rotation.y = -time * 0.25; fx.ticker.material.opacity = I;
  fx.wall.material.map = (drop ? b % 2 === 0 : b % 4 === 0) ? fx.typeFill : fx.typeLine;
  fx.wall.material.color.setHex(drop && b % 2 ? fx.c3 : 0xffffff).multiplyScalar(0.6 + 1.2 * kick); fx.wall.material.opacity = I;
  const shot = (drop ? b : bar) % fx.shots.length; if (shot !== fx.shot) { fx.shot = shot; fx.scr.material.map = fx.shots[shot]; }
  fx.scr.material.color.setScalar(f < 0.06 && (drop || b % 4 === 0) ? 3 : 0.9);
  return { b, bar, drop, f };
}
function momentGroup(w) { const g = new THREE.Group(); g.position.copy(w.center); scene.add(g); return g; }

// лев как медиа-инсталляция: голограмма льва в центре поля из полутора тысяч светящихся стержней.
// стержни идут волной от центра — грива из света; над полем медленно качаются три кинетических кольца, сверху бьют белые лучи в дымке
MOMENTS.lion = {
  layout(w) {
    const Z = w.z; w.center = V(-20, 0, Z); w.heroH = 30;
    w.keys = [
      [-0.46, V(10, 2.4, Z - 46), V(-17, 22, Z)],     // снизу, поле стержней по колено камере
      [-0.16, V(11, 9, Z - 30), V(-14, 18, Z)],
      [0.14, V(10, 22, Z - 22), V(-16, 14, Z)],
      [0.44, V(10, 64, Z + 4), V(-20, 0, Z + 2)],      // сверху: видно, как по полю расходится волна
    ];
  },
  build(w) {
    const g = momentGroup(w), Z = w.z, fx = { light: 1 }, BLUE = 0x6f9bff;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(25, 25.4, 0.6, 96), new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.12, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03 })); floor.position.y = 0.3; g.add(floor);
    // поле стержней
    const spots = [];
    for (let r = 7.5; r <= 24; r += 1.15) { const n = Math.round(Math.PI * 2 * r / 1.05); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + r; spots.push([r, a]); } }
    const rods = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1, 0.22), new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length);
    rods.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rods.frustumCulled = false; g.add(rods);
    rods.setColorAt(0, new THREE.Color()); rods.instanceColor.setUsage(THREE.DynamicDrawUsage);
    Object.assign(fx, { rods, spots, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), col: new THREE.Color(), white: new THREE.Color(0xffffff).multiplyScalar(0.85), blue: new THREE.Color(BLUE).multiplyScalar(0.4), dim: new THREE.Color(0x0b0f1e) });
    // кинетические кольца из светодиодной трубки
    fx.rings = [16, 20.5, 25].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 6, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5), toneMapped: false })); m.position.y = 36 + i * 6; m.rotation.x = Math.PI / 2; g.add(m); return m; });
    // белые лучи сверху в дымке, неподвижные: архитектурный свет, а не дискотека
    fx.beams = [0, 1, 2, 3].map(i => { const a = i / 4 * Math.PI * 2 + 0.8, c = new THREE.Mesh(new THREE.ConeGeometry(4.5, 64, 32, 1, true), glow(0xffffff, 0.05)); c.position.set(Math.cos(a) * 10, 32, Math.sin(a) * 10); c.rotation.z = Math.cos(a) * 0.16; c.rotation.x = -Math.sin(a) * 0.16; g.add(c); return c; });
    fx.key = new THREE.SpotLight(0xdde6ff, 0, 120, 0.45, 0.6); fx.key.position.set(18, 56, -30); fx.key.target.position.set(0, 14, 0); g.add(fx.key, fx.key.target);
    // голограмма: тёмное тело и синяя сетка поверх, сетка сидит на том же скелете
    gltfLoader.loadAsync('assets/models/lion-dance.glb').then(gltf => {
      const m = gltf.scene, bb = new THREE.Box3().setFromObject(m), k = w.heroH / (bb.max.y - bb.min.y);
      m.scale.setScalar(k); m.position.set(0, 0.6 - bb.min.y * k, 0); m.rotation.y = Math.PI - 0.5;
      const wire = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE).multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const skins = []; m.traverse(o => o.isSkinnedMesh && skins.push(o));
      skins.forEach(o => { o.frustumCulled = false; const s = o.material;
        o.material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(s.color).multiplyScalar(0.35), map: s.map, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(BLUE), sheenRoughness: 0.35 });
        const net = new THREE.SkinnedMesh(o.geometry, wire); net.bind(o.skeleton, o.bindMatrix); net.frustumCulled = false; o.parent.add(net); });
      m.userData.case = w.id; g.add(m); clickable.push(m);
      lionDance.mixer = new THREE.AnimationMixer(m); gltf.animations.forEach(a => lionDance.mixer.clipAction(a).setEffectiveTimeScale(0.7).play());
      fx.wire = wire;
    }).catch(e => console.warn('lion', e));
    // проекция кадров кейса на тонкий экран-сетку сбоку, без рамки
    fx.shots = w.imgs.map(n => caseTexture(`assets/cases/${n}.jpg`, false, 1024, 640)); fx.shot = -1;
    fx.scr = new THREE.Mesh(new THREE.PlaneGeometry(22, 13.75), new THREE.MeshBasicMaterial({ map: fx.shots[0], transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide }));
    fx.scr.position.set(-18, 15, -30); fx.scr.rotation.y = Math.atan2(10 - (w.center.x - 18), -16); g.add(fx.scr); fx.scr.userData.case = w.id; clickable.push(fx.scr); solid(fx.scr);
    SOLIDS.push({ box: new THREE.Box3(V(w.center.x - 24.4, 0, Z - 24.4), V(w.center.x + 24.4, 10, Z + 24.4)), name: w.id });
    SOLIDS.push({ box: new THREE.Box3(V(w.center.x - 8, 0, Z - 8), V(w.center.x + 8, w.heroH + 2, Z + 8)), name: w.id });
    LIVE.push({ fx, center: V(w.center.x, 12, Z), update: MOMENTS.lion.update });
  },
  update(fx, time, I, beat) {
    const { rods, spots, m4, q, col } = fx, s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), pulse = Math.exp(-(beat / 2 % 1) * 3);   // мягкий удар раз в два такта
    for (let i = 0; i < spots.length; i++) {
      const [r, a] = spots[i];
      const v = 0.5 + 0.5 * Math.sin(r * 0.45 - time * 1.6 + Math.sin(a * 3 + time * 0.4) * 1.4);   // волна от центра, гуляет по кругу
      const h = 0.4 + I * (v * v * 8.5 + pulse * 1.2 * (1 - r / 24));
      p.set(Math.cos(a) * r, 0.6 + h / 2, Math.sin(a) * r); s.y = h; m4.compose(p, q, s); rods.setMatrixAt(i, m4);
      col.copy(fx.dim).lerp(v > 0.8 ? fx.white : fx.blue, I * v); rods.setColorAt(i, col);
    }
    rods.instanceMatrix.needsUpdate = true; rods.instanceColor.needsUpdate = true;
    fx.rings.forEach((m, i) => { m.rotation.x = Math.PI / 2 + Math.sin(time * 0.25 + i * 2) * 0.28; m.rotation.y = Math.cos(time * 0.2 + i) * 0.22; m.position.y = 36 + i * 6 + Math.sin(time * 0.4 + i) * 2; m.material.color.setScalar((0.3 + 0.8 * I) * (0.8 + 0.4 * pulse)); });
    fx.beams.forEach((c, i) => c.material.opacity = I * (0.035 + 0.02 * Math.sin(time * 0.7 + i)));
    fx.key.intensity = I * 1600;
    if (fx.wire) fx.wire.opacity = I * (0.16 + 0.14 * pulse);
    const shot = Math.floor(beat / 8) % fx.shots.length; if (shot !== fx.shot) { fx.shot = shot; fx.scr.material.map = fx.shots[shot]; }
    fx.scr.material.opacity = I * 0.9;
  },
};

// ironstar как световая инсталляция: тоннель из светодиодных порталов поперёк улицы, по ним бежит огонь, как лидер гонки;
// последний портал — финиш с живым гоночным временем. за ним mustang на зеркальном полу под рядами линейного света, как на автосалоне
MOMENTS.ironstar = {
  layout(w) {
    const Z = w.z; w.center = V(-18, 0, Z + 6);
    w.keys = [
      [-0.46, V(10, 6, Z - 42), V(0, 8, Z)],           // в створе тоннеля
      [-0.2, V(9, 7, Z - 20), V(-10, 5, Z + 6)],       // внутри
      [0.14, V(8, 5, Z - 2), V(-18, 3, Z + 6)],        // к машине
      [0.44, V(12, 20, Z + 24), V(-18, 2, Z + 4)],
    ];
  },
  build(w) {
    const g = momentGroup(w), Z = w.z, cx = w.center.x, fx = {}, O = new THREE.Color(0xff6a10);
    // порталы: x от -18 до 22 по миру, высота 24, через 4 м
    fx.portals = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Group(); p.position.set(-cx + 2, 0, -40 + i * 4); g.add(p);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff), toneMapped: false });
      [[0.3, 24, 0.3, -20, 12], [0.3, 24, 0.3, 20, 12], [40.3, 0.3, 0.3, 0, 24]].forEach(([a, b, c, x, y]) => { const bar = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), m); bar.position.set(x, y, 0); p.add(bar); });
      fx.portals.push(m);
    }
    // финиш: время над последним порталом
    const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 256; fx.tg = tc.getContext('2d'); fx.tt = new THREE.CanvasTexture(tc); fx.tt.colorSpace = THREE.SRGBColorSpace;
    const timer = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: fx.tt, toneMapped: false })); timer.position.set(-cx + 2, 28, -12); timer.rotation.y = Math.PI; g.add(timer);
    const back = new THREE.Mesh(new THREE.BoxGeometry(18.6, 5.1, 0.4), MAT.matte); back.position.set(-cx + 2, 28, -11.7); g.add(back);
    // зеркальный пол и ряды линейного света над машиной
    const floor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 26), new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.06, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.02 })); floor.position.y = 0.2; g.add(floor);
    fx.bars = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff), toneMapped: false });
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 24), fx.bars); b.position.set(-14 + i * 3.5, 13, 0); g.add(b); }
    const car = mustangIronStar(); car.scale.setScalar(5.5); car.position.y = 0.4; car.rotation.y = 0.6; g.add(car); car.userData.case = w.id; clickable.push(car); fx.car = car;
    fx.key = new THREE.SpotLight(0xffffff, 0, 60, 0.7, 0.8); fx.key.position.set(0, 14, 0); fx.key.target.position.set(0, 0, 0); g.add(fx.key, fx.key.target);
    // проекция кадров кейса
    fx.shots = w.imgs.map(n => caseTexture(`assets/cases/${n}.jpg`, false, 1024, 640)); fx.shot = -1;
    fx.scr = new THREE.Mesh(new THREE.PlaneGeometry(20, 12.5), new THREE.MeshBasicMaterial({ map: fx.shots[0], transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    fx.scr.position.set(-12, 9, 14); fx.scr.rotation.y = Math.atan2(8 - (cx - 12), (Z - 2) - (Z + 20)); g.add(fx.scr); solid(fx.scr);
    SOLIDS.push({ box: new THREE.Box3(V(cx - 17, 0, w.center.z - 13), V(cx + 17, 14, w.center.z + 13)), name: w.id });
    LIVE.push({ fx, center: V(cx + 10, 8, Z - 10), update: MOMENTS.ironstar.update });
  },
  update(fx, time, I, beat) {
    // огонь бежит по порталам к финишу раз в такт; за ним гаснущий шлейф
    const run = (beat / 4 % 1) * 10;
    fx.portals.forEach((m, i) => { const d = run - i; const v = d >= 0 && d < 1 ? 1 : d >= 1 && d < 3 ? 1 - (d - 1) / 2 : 0;
      m.color.setRGB(0.25, 0.25, 0.27).lerp(new THREE.Color(1.6, 0.75, 0.3), v).multiplyScalar(0.3 + 0.7 * I); });
    fx.bars.color.setScalar(0.4 + 0.7 * I); fx.key.intensity = I * 500;
    fx.car.rotation.y = 0.6 + Math.sin(time * 0.15) * 0.25;
    const shot = Math.floor(beat / 8) % fx.shots.length; if (shot !== fx.shot) { fx.shot = shot; fx.scr.material.map = fx.shots[shot]; }
    fx.scr.material.opacity = I * 0.9;
    const s = Math.floor(time) + 3600 + 1338; if (s !== fx.last) { fx.last = s; const g = fx.tg;
      g.fillStyle = '#100404'; g.fillRect(0, 0, 1024, 256); g.font = '700 210px AP, monospace'; g.fillStyle = '#ff3a1a'; g.textAlign = 'center';
      g.fillText(`${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 512, 200);
      g.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 0; x < 1024; x += 8) g.fillRect(x, 0, 3, 256); for (let y = 0; y < 256; y += 8) g.fillRect(0, y, 1024, 3); fx.tt.needsUpdate = true; }
  },
};

// гусь на заводе: белый глянцевый гусь ростом 30 м топает по улице, светящиеся лапки на асфальте шаг за шагом ведут к нему
MOMENTS.goose = {
  layout(w) {
    const Z = w.z; w.center = V(-20, 0, Z + 4);
    w.keys = [
      [-0.46, V(8, 2.2, Z - 54), V(-10, 18, Z + 4)],   // от земли, по дорожке лапок
      [-0.14, V(10, 5, Z - 26), V(-14, 22, Z + 4)],
      [0.16, V(4, 26, Z - 16), V(-18, 24, Z + 4)],     // глаза в глаза
      [0.44, V(12, 34, Z + 24), V(-20, 10, Z + 2)],
    ];
  },
  build(w) {
    const g = momentGroup(w), Z = w.z, O = 0xff7a10;
    const fx = kit(w, g, { col: [O, RED, 0xffe0b0], stage: 16, laser: [6, 26, 0], ticker: [33, 14], wall: [6, 50, 44], scr: [-14, 15, -22], cam: V(8, 6, Z - 52) });
    const gooseM = new THREE.MeshPhysicalMaterial({ color: 0xf2ede4, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }), pawM = new THREE.MeshStandardMaterial({ color: O, emissive: O, emissiveIntensity: 0.5, roughness: 0.4 });
    const gs = goose(); gs.traverse(o => { if (!o.isMesh || o.material === MAT.matte) return; o.material = o.material.color.getHex() === 0xff7a10 ? pawM : gooseM; });   // белый глянец, как виниловая игрушка
    gs.scale.setScalar(4.6); gs.position.y = 0.8; gs.rotation.y = 2.3; g.add(gs); gs.userData.case = w.id; clickable.push(gs); fx.hero.goose = gs;
    // лапки: дорожка от камеры к сцене, загораются по одной в бит
    const paw = decalTex(256, 256, (c) => { c.fillStyle = '#fff'; c.translate(128, 150); [-0.55, 0, 0.55].forEach(a => { c.save(); c.rotate(a); c.beginPath(); c.ellipse(0, -60, 22, 70, 0, 0, Math.PI * 2); c.fill(); c.restore(); }); c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill(); });
    fx.hero.paws = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: paw, color: new THREE.Color(O).multiplyScalar(2), transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      const t = i / 11; m.position.set(-w.center.x + 6 - t * 18 + (i % 2 ? 1.6 : -1.6), 0.06, -66 + t * 52); m.rotation.set(-Math.PI / 2, 0, Math.PI - 0.35); g.add(m); fx.hero.paws.push(m);
    }
    SOLIDS.push({ box: new THREE.Box3(V(w.center.x - 16.6, 0, w.center.z - 16.6), V(w.center.x + 16.6, 30, w.center.z + 16.6)), name: w.id });
    LIVE.push({ fx, center: V(w.center.x, 14, w.center.z), update: MOMENTS.goose.update });
  },
  update(fx, time, I, beat, kick) {
    const { b, f } = kitUpdate(fx, time, I, beat, kick), h = fx.hero, gs = h.goose;
    // переваливается с лапы на лапу в бит, шея кивает на удар
    const side = b % 2 ? 1 : -1, step = Math.sin(Math.min(1, f * 2) * Math.PI);
    gs.rotation.x = side * 0.07 * (1 - f); gs.position.y = 0.8 + step * 1.4; gs.userData.neck.rotation.z = -0.35 - kick * 0.25;
    h.paws.forEach((m, i) => { const d = (b - i) % 12; m.material.opacity = I * (d === 0 ? 1 : d > 0 && d < 4 ? 0.55 - d * 0.12 : 0.08); });
  },
};
// бит общий: момент разгорается, когда камера подлетает ближе 130 м; удар мягко качает bloom и чуть поджимает кадр
function updateMoments(time) {
  const beat = beatAt(time), kick = Math.exp(-(beat % 1) * 7);
  let top = 0;
  for (const m of LIVE) {
    const I = clamp01((130 - camera.position.distanceTo(m.center)) / 60); if (m.fx.beams && m.fx.lz) top = Math.max(top, I);   // качает кадр только рейв-оформление
    if (I > 0 || m.wasOn) m.update(m.fx, time, I, beat, kick); m.wasOn = I > 0;
  }
  bloom.strength = 0.55 + top * (0.12 + 0.3 * kick);
  const fov = 50 + top * (1.5 - 0.6 * kick); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------- азиатский квартал как световая инсталляция ----------
// объём квартала: чёрные башни, очерченные красной линией по рёбрам; по фасадам вверх бежит полоса проекции,
// на углах — светодиодные ленты, над улицей — тории из светящейся трубки, в небе — красный диск и прожекторы.
// обычные дома города в этот объём не ставятся (см. reservedByWorld)
const ASIA = { z0: 168, z1: 364, x: 140 };
const inAsia = (x, z) => Math.abs(x) < ASIA.x && z > ASIA.z0 && z < ASIA.z1;
const ASIA_FX = {};
function buildAsia() {
  const r = mulberry(77), towers = [];
  const busy = (x, z, w, d) => WORLD.some(t => t.tower && Math.abs(x - t.tower.x) < (w + t.tower.w) / 2 + 6 && Math.abs(z - t.tower.z) < (d + t.tower.d) / 2 + 6);
  for (let side = -1; side <= 1; side += 2) for (let x = 54; x <= 128; x += 25) for (let z = ASIA.z0 + 12; z <= ASIA.z1 - 12; z += 25) {
    const w = 13 + r() * 8, d = 13 + r() * 8, X = side * x + (r() - .5) * 4, Zc = z + (r() - .5) * 4;
    if (r() < 0.18 || busy(X, Zc, w, d)) continue;
    const near = x < 70, h = near ? 70 + r() * 110 : 50 + r() * 170;
    towers.push({ x: X, z: Zc, w, d, h });
  }
  // atl-башни квартала тоже обводим
  WORLD.filter(t => t.tower && inAsia(t.tower.x, t.tower.z)).forEach(t => t.tower.lined = true);
  ASIA_FX.towers = towers;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const body = new THREE.InstancedMesh(box, MAT.matte, towers.length), dummy = new THREE.Object3D();
  towers.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.scale.set(t.w, t.h, t.d); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); });
  scene.add(body);
  // рёбра башен — одна линия на весь квартал
  const edge = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), ep = edge.attributes.position.array, pts = [];
  const outline = (t, y0 = 0) => { for (let i = 0; i < ep.length; i += 3) pts.push(t.x + ep[i] * t.w, y0 + ep[i + 1] * t.h, t.z + ep[i + 2] * t.d); };
  towers.forEach(t => outline(t)); WORLD.filter(t => t.tower?.lined).forEach(w => outline(w.tower));
  // пагода: девять ярусов, каждый с выносом кровли
  const pg = { x: -96, z: 262 };
  for (let i = 0, y = 0; i < 9; i++) { const s = 26 - i * 2.1, h = 13 - i * 0.6;
    outline({ x: pg.x, z: pg.z, w: s, d: s, h }, y); outline({ x: pg.x, z: pg.z, w: s + 7, d: s + 7, h: 0.8 }, y + h);   // ярус и вынос кровли
    y += h + 0.8; }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  ASIA_FX.lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(0.9), toneMapped: false, transparent: true });
  scene.add(new THREE.LineSegments(lg, ASIA_FX.lineMat));
  const pgBody = new THREE.Mesh(new THREE.CylinderGeometry(7, 11, 118, 4), MAT.matte); pgBody.position.set(pg.x, 59, pg.z); pgBody.rotation.y = Math.PI / 4; scene.add(pgBody);
  towers.push({ x: pg.x, z: pg.z, w: 33, d: 33, h: 120 });
  // полоса проекции по фасаду к улице: поднимается снизу вверх, у каждой башни своя фаза
  const front = towers.filter(t => Math.abs(t.x) < 80);
  ASIA_FX.scan = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glow(0xff4a3a, 1.6), front.length); ASIA_FX.front = front;
  ASIA_FX.scan.material.side = THREE.DoubleSide; ASIA_FX.scan.frustumCulled = false; scene.add(ASIA_FX.scan);
  // светодиодные ленты на углах к улице
  ASIA_FX.strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshBasicMaterial({ toneMapped: false }), front.length * 2);
  front.forEach((t, i) => [-1, 1].forEach((s, k) => { const fx = t.x - Math.sign(t.x) * (t.w / 2 + 0.2); dummy.position.set(fx, t.h / 2, t.z + s * (t.d / 2 + 0.2)); dummy.scale.set(1, t.h, 1); dummy.updateMatrix(); ASIA_FX.strips.setMatrixAt(i * 2 + k, dummy.matrix); ASIA_FX.strips.setColorAt(i * 2 + k, new THREE.Color(0)); }));
  scene.add(ASIA_FX.strips);
  // тории из светящейся трубки поперёк улицы: столбы за коридором камеры, кровля с загнутыми концами
  const tor = glow(RED, 1.5); ASIA_FX.tor = tor;
  [184, 262, 322].forEach(z => {
    const g = new THREE.Group(); g.position.set(-1, 0, z); scene.add(g);
    [-25, 23].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 27, 12), tor); p.position.set(x, 13.5, 0); g.add(p); });
    const cv = new THREE.CatmullRomCurve3([V(-31, 30, 0), V(-20, 28, 0), V(0, 27.4, 0), V(20, 28, 0), V(29, 30, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 48, 0.5, 8), tor));
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(54, 0.6, 0.6), tor); nuki.position.set(-1, 23, 0); g.add(nuki);
  });
  // красный диск над улицей в конце квартала и прожекторы с крыш в небо
  const sun = new THREE.Group(); sun.position.set(0, 150, ASIA.z1 + 120); scene.add(sun);
  sun.add(new THREE.Mesh(new THREE.TorusGeometry(42, 0.6, 8, 160), glow(RED, 1.6)));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(42, 96), glow(RED, 0.18)); disc.material.side = THREE.DoubleSide; sun.add(disc); ASIA_FX.sun = disc;
  ASIA_FX.beams = towers.filter(t => t.h > 150).slice(0, 6).map((t, i) => {
    const p = new THREE.Group(); p.position.set(t.x, t.h, t.z); scene.add(p);
    const c = new THREE.Mesh(new THREE.ConeGeometry(5, 220, 24, 1, true), glow(0xffffff, 0.04)); c.geometry.translate(0, -110, 0); c.rotation.x = Math.PI; p.add(c);
    return { p, ph: i * 1.7 };
  });
}
function updateAsia(time) {
  if (!ASIA_FX.scan) return;
  const near = clamp01((260 - Math.abs(camera.position.z - (ASIA.z0 + ASIA.z1) / 2)) / 120), dummy = updateAsia.d ||= new THREE.Object3D(), col = updateAsia.c ||= new THREE.Color();
  ASIA_FX.front.forEach((t, i) => {
    const f = (time * 0.12 + i * 0.137) % 1, y = f * t.h, fx = t.x - Math.sign(t.x) * (t.w / 2 + 0.25);
    dummy.position.set(fx, y, t.z); dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.set(t.d, 0.35 + 1.2 * (1 - f), 1); dummy.updateMatrix(); ASIA_FX.scan.setMatrixAt(i, dummy.matrix);
    [0, 1].forEach(k => { const v = Math.pow(0.5 + 0.5 * Math.sin(time * 2.2 - i * 0.9 - k * 0.5), 6); ASIA_FX.strips.setColorAt(i * 2 + k, col.setRGB(1, 0.15, 0.12).multiplyScalar(0.25 + 1.1 * v)); });
  });
  ASIA_FX.scan.instanceMatrix.needsUpdate = true; ASIA_FX.strips.instanceColor.needsUpdate = true;
  ASIA_FX.scan.material.opacity = 0.7 * near;
  ASIA_FX.lineMat.opacity = 0.35 + 0.5 * near;
  ASIA_FX.sun.material.opacity = 0.12 + 0.05 * Math.sin(time * 0.8);
  ASIA_FX.beams.forEach(b => { b.p.rotation.set(Math.sin(time * 0.21 + b.ph) * 0.3, 0, Math.cos(time * 0.17 + b.ph) * 0.3); b.p.children[0].material.opacity = 0.03 * near; });
}

// ozon corp: зона из киберпанк-переулка на зеркальной сцене; рядом стена ретро-телевизоров —
// как на фестивале, центральный показывает живую картинку с камеры наблюдения, которая смотрит на улицу, то есть на зрителя
MOMENTS.fandom = {
  layout(w) {
    const Z = w.z; w.center = V(-20, 0, Z);
    w.keys = [
      [-0.46, V(10, 4, Z - 48), V(-16, 8, Z)],
      [-0.14, V(11, 9, Z - 26), V(-20, 6, Z)],
      [0.16, V(9, 16, Z - 10), V(-24, 6, Z + 2)],
      [0.44, V(12, 30, Z + 18), V(-22, 4, Z)],
    ];
  },
  build(w) {
    const Z = w.z, cx = w.center.x, fx = {};
    diorama.position.copy(w.center); scene.add(diorama);   // в той же группе модель крутится в «покрутить в 3D»
    const floor = new THREE.Mesh(new THREE.BoxGeometry(32, 0.5, 26), new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.08, metalness: 0.8, clearcoat: 1 })); floor.position.y = 0.25; diorama.add(floor);
    const edgeM = glow(RED, 1.4); fx.edge = edgeM;
    [[32.2, 0.15, 0.15, 0, 13], [32.2, 0.15, 0.15, 0, -13], [0.15, 0.15, 26.2, 16, 0], [0.15, 0.15, 26.2, -16, 0]].forEach(([a, b, c, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), edgeM); m.position.set(x, 0.5, z); diorama.add(m); });
    gltfLoader.loadAsync('assets/models/ozon-corp.min.glb').then(gltf => {
      const model = gltf.scene;
      model.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0; } });
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(w.hero[0] / Math.max(size.x, size.z)); box.setFromObject(model); const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, 0.5 - box.min.y, -c.z); diorama.add(model);
    }).catch(() => {});
    // свет как на выставке: тёплый ключ сверху, красный и синий неон по бокам
    const key = new THREE.SpotLight(0xfff1e0, 900, 70, 0.6, 0.6); key.position.set(10, 30, -14); key.target.position.set(0, 2, 0); diorama.add(key, key.target);
    [[RED, -14], [0x3a6bff, 14]].forEach(([c, x]) => { const l = new THREE.PointLight(c, 260, 34, 1.6); l.position.set(x, 8, 4); diorama.add(l); });
    diorama.userData.case = w.id; clickable.push(diorama);
    // стена телевизоров 3×3: в центре — живая камера, вокруг кадры кейса с плашкой rec
    fx.rt = new THREE.WebGLRenderTarget(320, 200); fx.cctv = new THREE.PerspectiveCamera(52, 1.6, 1, 400);
    fx.cctv.position.set(-30, 18, Z + 10); fx.cctv.lookAt(10, 6, Z - 40);
    const wall = new THREE.Group(); wall.position.set(-36, 0, Z + 18); wall.rotation.y = Math.atan2(10 - -36, (Z - 30) - (Z + 18)); scene.add(wall);
    fx.tvs = [];
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = (i / 3) | 0, live = i === 4;
      const tv = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.8, 3.6), MAT.graphite); tv.position.set((col - 1) * 6.8, 3 + row * 5.2, -1.8); wall.add(tv);
      const tex = live ? fx.rt.texture : caseTexture(`assets/cases/${w.imgs[i % w.imgs.length]}.jpg`, false, 512, 384);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(live ? 0xb8ffc8 : 0xd8e8ff).multiplyScalar(live ? 1.1 : 0.75) }));
      scr.position.set((col - 1) * 6.8, 3 + row * 5.2, 0.02); wall.add(scr); fx.tvs.push(scr); scr.userData.case = w.id; clickable.push(scr);
    }
    const rec = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), new THREE.MeshBasicMaterial({ map: decalTex(512, 72, (c) => { c.fillStyle = '#ff2020'; c.beginPath(); c.arc(30, 36, 16, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '40px AP, monospace'; c.fillText('REC  CAM 04  OZON CORP', 60, 50); }), transparent: true, toneMapped: false }));
    rec.position.set(0, 18.4, 0.05); wall.add(rec); fx.rec = rec;
    solid(wall);
    SOLIDS.push({ box: new THREE.Box3(V(cx - 16, 0, Z - 13), V(cx + 16, 14, Z + 13)), name: w.id });
    LIVE.push({ fx, center: V(cx + 8, 8, Z - 6), update: MOMENTS.fandom.update });
  },
  update(fx, time, I, beat) {
    fx.edge.opacity = 0.5 + 0.5 * I;
    fx.rec.visible = Math.floor(time * 1.6) % 2 === 0;
    fx.tvs.forEach((s, i) => { if (i !== 4) s.material.color.setScalar((0.55 + 0.25 * Math.sin(time * 9 + i * 3) ** 8) * (0.4 + 0.6 * I)); });
    if (I > 0.05 && (fx.n = (fx.n || 0) + 1) % 3 === 0) { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(fx.rt); renderer.render(scene, fx.cctv); renderer.setRenderTarget(prev); }
  },
};

// чёрный пояс по it: павильон-додзё под круглым тентом — тент из светящихся линий, вход через тории,
// пять станций по часовой стрелке зажигаются по очереди, как печати на маршрутном листе
MOMENTS.tbank = {
  layout(w) {
    const Z = w.z; w.center = V(-18, 0, Z);
    w.keys = [
      [-0.46, V(10, 4, Z - 46), V(-14, 10, Z)],
      [-0.14, V(11, 8, Z - 24), V(-18, 8, Z)],
      [0.16, V(9, 26, Z - 6), V(-18, 2, Z)],        // над тентом: видно круг станций
      [0.44, V(12, 18, Z + 22), V(-18, 4, Z)],
    ];
  },
  build(w) {
    const g = momentGroup(w), Z = w.z, cx = w.center.x, Y = 0xffdd2d, fx = { st: [] };
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.8, 0.5, 64), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.3, clearcoat: 1 })); floor.position.y = 0.25; g.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12.6, 0.12, 6, 128), glow(Y, 1.4)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.55; g.add(ring);
    // тент: двадцать четыре луча от кольца к вершине
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(Math.cos(a) * 12.5, 7, Math.sin(a) * 12.5, 0, 15, 0); }
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2; pts.push(Math.cos(a) * 12.5, 7, Math.sin(a) * 12.5, Math.cos(b) * 12.5, 7, Math.sin(b) * 12.5); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    fx.tent = new THREE.LineBasicMaterial({ color: new THREE.Color(0xffffff), toneMapped: false, transparent: true }); g.add(new THREE.LineSegments(tg, fx.tent));
    // тории на входе со стороны камеры
    const tor = glow(RED, 1.5), te = new THREE.Group(); te.position.set(10, 0, -9); te.rotation.y = -0.7; g.add(te);
    [-3.2, 3.2].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 8, 10), tor); p.position.set(x, 4, 0); te.add(p); });
    const kas = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.4, 0.4), tor); kas.position.y = 8.2; te.add(kas);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 0.3), tor); nuki.position.y = 6.8; te.add(nuki);
    // пять станций: световые колонны и печать на полу
    const seal = decalTex(256, 256, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 14; c.beginPath(); c.arc(128, 128, 100, 0, 7); c.stroke(); c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 70, 0, 7); c.stroke(); });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i / 5 * Math.PI * 2, x = Math.cos(a) * 8.5, z = Math.sin(a) * 8.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x222222), toneMapped: false })); col.position.set(x, 3.5, z); g.add(col);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: seal, transparent: true, color: new THREE.Color(Y), toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.set(x * 0.62, 0.56, z * 0.62); g.add(s);
      fx.st.push({ col, s });
    }
    // ключевой визуал на тонком экране за павильоном
    fx.shots = w.imgs.map(n => caseTexture(`assets/cases/${n}.jpg`, false, 1024, 640)); fx.shot = -1;
    fx.scr = new THREE.Mesh(new THREE.PlaneGeometry(20, 12.5), new THREE.MeshBasicMaterial({ map: fx.shots[0], transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    fx.scr.position.set(-10, 12, 14); fx.scr.rotation.y = Math.atan2(10 - (cx - 10), (Z - 30) - (Z + 14)); g.add(fx.scr); solid(fx.scr); fx.scr.userData.case = w.id; clickable.push(fx.scr);
    g.userData.case = w.id; clickable.push(floor);
    SOLIDS.push({ box: new THREE.Box3(V(cx - 13, 0, Z - 13), V(cx + 13, 16, Z + 13)), name: w.id });
    LIVE.push({ fx, center: V(cx + 6, 8, Z - 6), update: MOMENTS.tbank.update });
  },
  update(fx, time, I, beat) {
    const k = Math.floor(beat / 2) % 6;   // по станции на два удара, шестой шаг — все пять горят разом
    fx.st.forEach((s, i) => { const on = k === 5 || i <= k; s.col.material.color.setHex(on ? 0xffdd2d : 0x222222).multiplyScalar(on ? 1.5 * I + 0.1 : 1); s.s.material.opacity = on ? I : 0.06; });
    fx.tent.opacity = 0.25 + 0.55 * I;
    const shot = Math.floor(beat / 8) % fx.shots.length; if (shot !== fx.shot) { fx.shot = shot; fx.scr.material.map = fx.shots[shot]; }
    fx.scr.material.opacity = 0.3 + 0.6 * I;
  },
};

// хроники ижоры: целый фасад азиатской башни становится медиафасадом — по нему листается вебтун, сверху сетка светодиодов
MOMENTS.izhora = {
  layout(w) {
    const Z = w.z, X = w.tower.x - Math.sign(w.tower.x) * (w.tower.w / 2 + 0.3); w.face = X;
    w.keys = [
      [-0.46, V(-14, 50, Z - 80), V(X, 62, Z)],
      [-0.1, V(-28, 62, Z - 46), V(X, 66, Z)],
      [0.2, V(-30, 70, Z - 20), V(X, 66, Z)],
      [0.44, V(-16, 88, Z + 14), V(X, 60, Z)],
    ];
  },
  build(w) {
    const t = w.tower, fx = {};
    towerBox(t, MAT.matte);
    const W = 30, H = W * 24.2 / 14, s = Math.sign(t.x);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ toneMapped: false }));
    m.position.set(w.face, 66, w.z); m.rotation.y = -s * Math.PI / 2; scene.add(m); webtoonInto(m.material, W / H); m.userData.case = w.id; clickable.push(m);
    // сетка светодиодов поверх: тёмные зазоры между пикселями
    const grid = decalTex(64, 64, (c) => { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, 64, 64); c.clearRect(6, 6, 52, 52); }); grid.wrapS = grid.wrapT = THREE.RepeatWrapping; grid.repeat.set(W * 2.2, H * 2.2);
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: grid, transparent: true, depthWrite: false })); gm.position.copy(m.position); gm.position.x -= s * 0.05; gm.rotation.copy(m.rotation); scene.add(gm);
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.2, H + 1.2), glow(0x3a6bff, 1.2)); fr.position.copy(m.position); fr.position.x += s * 0.05; fr.rotation.copy(m.rotation); scene.add(fr); fx.fr = fr;
    tagAt(CASES[w.id].title, CASES[w.id].pass.клиент, V(w.face - s * 0.4, 66 + H / 2 + 3, w.z), w.keys[1][1], 20);
    solid(m);
    LIVE.push({ fx, center: V(w.face, 66, w.z), update: (fx, time, I) => { fx.fr.material.opacity = 0.3 + 0.6 * I; } });
  },
};

// треснутые: на крыше башни «дикси» — гача-автомат как световой объект: сфера из оранжевых линий, внутри кружат 26 капсул по числу героев
MOMENTS.treschnutye = {
  layout(w) {
    const Z = w.z, T = w.tower;
    w.keys = [
      [-0.46, V(-10, 66, Z - 60), V(T.x + 8, T.h + 12, Z)],
      [-0.1, V(-14, 74, Z - 30), V(T.x + 6, T.h + 13, Z)],
      [0.2, V(-12, 86, Z - 8), V(T.x + 4, T.h + 10, Z)],
      [0.44, V(-6, 96, Z + 20), V(T.x, T.h + 6, Z)],
    ];
  },
  build(w) {
    const T = w.tower, O = 0xff7a10, fx = {};
    towerBox(T, MAT.matte);
    const g = new THREE.Group(); g.position.set(T.x + 4, T.h, T.z); scene.add(g);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1, 64), MAT.graphite); deck.position.y = 0.5; g.add(deck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.2, 6, 128), glow(O, 1.5)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.05; g.add(ring);
    fx.sphere = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(12, 1)), new THREE.LineBasicMaterial({ color: new THREE.Color(O).multiplyScalar(1.5), toneMapped: false, transparent: true }));
    fx.sphere.position.y = 14; g.add(fx.sphere);
    const r = mulberry(26), cap = new THREE.SphereGeometry(1.6, 20, 12);
    const half = [new THREE.MeshPhysicalMaterial({ color: O, roughness: 0.2, clearcoat: 1, emissive: O, emissiveIntensity: 0.25 }), new THREE.MeshPhysicalMaterial({ color: 0xf4efe8, roughness: 0.15, clearcoat: 1, emissive: 0xf4efe8, emissiveIntensity: 0.35 })];
    fx.caps = Array.from({ length: 26 }, (_, i) => { const m = new THREE.Mesh(cap, half[i % 2]); g.add(m); return { m, a: r() * 6.28, b: r() * 6.28, sa: 0.3 + r() * 0.5, sb: 0.2 + r() * 0.4, rad: 4 + r() * 6 }; });
    // ключевой визуал рядом — вертикальный экран 9:16
    const { g: sg, m: sm } = screenAt(caseTexture(`assets/cases/${w.img}.jpg`, false, 576, 1024), BANNER.w, BANNER.h, V(T.x + 22, T.h + BANNER.h / 2 + 1.2, T.z + 14), w.keys[1][1], w.id);
    fx.screen = sm;
    tagAt(CASES[w.id].title, CASES[w.id].pass.клиент, V(T.x + 22, T.h + BANNER.h + 4.2, T.z + 14), w.keys[1][1], 18);
    solid(sg); SOLIDS.push({ box: new THREE.Box3(V(g.position.x - 16, T.h, T.z - 16), V(g.position.x + 16, T.h + 27, T.z + 16)), name: w.id });
    g.userData.case = w.id; clickable.push(fx.sphere);
    LIVE.push({ fx, center: V(g.position.x, T.h + 14, T.z), update: MOMENTS.treschnutye.update });
  },
  update(fx, time, I, beat) {
    fx.sphere.rotation.y = time * 0.15; fx.sphere.material.opacity = 0.4 + 0.6 * I;
    const kick = Math.exp(-(beat % 1) * 5);
    fx.caps.forEach(c => { const a = c.a + time * c.sa, b = c.b + time * c.sb, rr = c.rad * (1 + 0.04 * kick);
      c.m.position.set(Math.cos(a) * Math.cos(b) * rr, 14 + Math.sin(b) * rr, Math.sin(a) * Math.cos(b) * rr); c.m.rotation.set(a, b, 0); });
  },
};

function layoutWorld() {
  let z = Z0 - STEP, prev = null;
  for (const w of WORLD.filter(w => w.r === 'btl')) { z += STEP + (prev && prev !== w.zone ? ZONE_GAP : 0); prev = w.zone; w.z = z; (ZR[w.zone] ||= [z, z])[1] = z; }
  z = -1e9; prev = null;
  for (const w of WORLD.filter(w => w.r === 'atl')) { z = prev === w.zone ? z + STEP : Math.max(ZR[ZONES[w.zone].over][0], z + STEP + ZONE_GAP); prev = w.zone; w.z = z; (ZR[w.zone] ||= [z, z])[1] = z; }
  const last = Math.max(...WORLD.map(w => w.z)); TAIL.awards = last + 120; TAIL.brief = last + 260;
  for (const w of WORLD) {
    // F — центр носителя, H — высота, которую он должен занять в кадре вместе с героем, frac — доля высоты кадра
    if (w.kind === 'station') {
      const [hw, hd, hh] = w.hero;
      w.heroPos = new THREE.Vector3(Math.min(-5, -hw / 2 - 2), 0, w.z - 4);
      w.standPos = new THREE.Vector3(-17, 0, w.z + hd / 2 + 2);
      w.F = new THREE.Vector3((w.heroPos.x + w.standPos.x) / 2, 7, (w.heroPos.z + w.standPos.z) / 2); w.H = Math.max(18, hh + 4); w.frac = 0.42;
    } else if (w.kind === 'vitrine') { w.F = new THREE.Vector3(-14, 8, w.z); w.H = 17; w.frac = 0.46; }
    else if (w.kind === 'roof') {
      w.tower = { x: DIXY_TOWER.x, z: w.z, w: DIXY_TOWER.w, d: DIXY_TOWER.d, h: DIXY_TOWER.h };
      w.F = new THREE.Vector3(DIXY_TOWER.x + 12, DIXY_TOWER.h + BANNER.h / 2 + 1.2, w.z); w.H = BANNER.h + 4; w.frac = 0.5;
    } else {
      w.tower = { x: w.s * ATL_TOWER.x, z: w.z, w: ATL_TOWER.w, d: ATL_TOWER.d, h: ATL_TOWER.h };
      w.size = w.webtoon ? [14, 24.2] : [28, 15.75];
      w.F = new THREE.Vector3(w.s * 24, SCREEN_Y, w.z); w.H = w.size[1] + 4; w.frac = w.webtoon ? 0.56 : 0.44;
    }
    // камера в коридоре своего маршрута, на расстоянии, при котором носитель занимает frac кадра
    const dist = w.H / (2 * TAN * w.frac), C = new THREE.Vector3(LANE[w.r].x, w.r === 'btl' ? LANE.btl.y : w.F.y + 4, 0);
    const dx = C.x - w.F.x, dy = C.y - w.F.y; C.z = w.F.z - Math.sqrt(Math.max(dist * dist - dx * dx - dy * dy, 144));
    // носитель — на своей стороне кадра, рассказ — на другой: смещаем точку взгляда в сторону рассказа
    const caseRight = w.F.x < C.x, fwd = w.F.clone().sub(C).normalize(), right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    w.cam = C; w.look = w.F.clone().addScaledVector(right, (caseRight ? -1 : 1) * 0.22 * dist); w.story = caseRight ? 'left' : 'right';
    if (w.moment) MOMENTS[w.moment].layout(w);
  }
}
layoutWorld();
const reservedByWorld = (x, z) => inAsia(x, z) || (Math.abs(x) < 44 && z > 165 && z < TAIL.brief - 10) || WORLD.some(w => w.tower && Math.abs(x - w.tower.x) < w.tower.w / 2 + 16 && Math.abs(z - w.tower.z) < w.tower.d / 2 + 16);

const SOLIDS = [];   // коробки всего, что стоит у маршрута, — для проверки камеры на столкновения
const solid = o => { o.updateMatrixWorld(true); SOLIDS.push({ box: new THREE.Box3().setFromObject(o), name: o.userData.case || o.name || '' }); return o; };
const towerMat = CONC;   // башни носителей — бетонные пилоны мегаструктуры
const heroMat = new THREE.MeshStandardMaterial({ color: 0x9a9ca6, emissive: 0x2a2a30, roughness: 0.8 });   // временный серый блок вместо героя

function stand(id, imgs, pos, cam) {
  const g = new THREE.Group(); g.position.copy(pos); aim(g, cam); scene.add(g);
  const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
  const HW = 17, HH = HW / 1.6, rest = imgs.slice(1), tw = 7.4, th = tw / 1.6, gap = 0.8;
  const W = Math.max(HW, rest.length * (tw + gap) - gap) + 1.6, rowH = rest.length ? th + gap : 0, H = HH + rowH + 1.6, y0 = 1.4;
  add(new THREE.BoxGeometry(W + 2, 1.4, 5), MAT.graphite, 0, 0.7, -1.2);
  add(new THREE.BoxGeometry(W, H, 0.8), MAT.matte, 0, y0 + H / 2, -0.5);
  [-1, 1].forEach(sd => add(new THREE.CylinderGeometry(0.28, 0.28, H + 3, 16), MAT.chrome, sd * (W / 2 + 0.3), y0 + H / 2 + 0.6, -0.3));
  const cap = add(new THREE.CylinderGeometry(0.45, 0.45, W + 1.2, 20), MAT.chrome, 0, y0 + H + 0.3, -0.3); cap.rotation.z = Math.PI / 2;
  const pic = (src, w, h, px, py) => { const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: caseTexture(`assets/cases/${src}.jpg`, false, 1024, 640) }), px, py, 0); m.material.color.setScalar(0.78); m.userData.case = id; clickable.push(m); };
  pic(imgs[0], HW, HH, 0, y0 + rowH + 0.8 + HH / 2);
  rest.forEach((src, i) => pic(src, tw, th, (i - (rest.length - 1) / 2) * (tw + gap), y0 + 0.8 + th / 2));
  const c = CASES[id];
  add(new THREE.PlaneGeometry(16, 2.5), new THREE.MeshBasicMaterial({ map: labelTex(c.title, `${c.pass.клиент} · ${c.pass.год}`) }), -W / 2 + 8, y0 + H + 1.75, 0);
  g.userData.case = id; return solid(g);
}
function station(w) {
  stand(w.id, w.imgs, w.standPos, w.cam);
  const [hw, hd, hh] = w.hero, g = w.id === 'fandom' ? diorama : new THREE.Group();
  g.position.copy(w.heroPos); scene.add(g);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(hw + 2, 0.8, hd + 2), MAT.graphite); pod.position.y = 0.4; g.add(pod);
  const blk = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), heroMat); blk.position.y = 0.8 + hh / 2; g.add(blk); w.heroBlock = blk;
  g.userData.case = w.id; clickable.push(g); solid(g);
}
function vitrine(w) {
  const g = new THREE.Group(); g.position.set(w.F.x, 0, w.z); aim(g, w.cam); scene.add(g);
  const add = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); g.add(o); return o; };
  add(new THREE.BoxGeometry(15, 1.2, 10), MAT.graphite, 0, 0.6, 0);
  [[-7, -4.6], [7, -4.6], [-7, 4.6], [7, 4.6]].forEach(([x, zz]) => add(new THREE.CylinderGeometry(0.22, 0.22, 13, 16), MAT.chrome, x, 7.7, zz));
  add(new THREE.BoxGeometry(15.4, 1.4, 10.2), MAT.matte, 0, 14.7, 0);
  add(new THREE.BoxGeometry(14, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8b0).multiplyScalar(1.3), toneMapped: false }), 0, 13.9, 4.5);
  add(new THREE.BoxGeometry(14.4, 11.6, 0.6), MAT.matte, 0, 7.6, -4.9);
  const pic = add(new THREE.PlaneGeometry(13, 8.1), new THREE.MeshBasicMaterial({ map: caseTexture(`assets/cases/${w.imgs[0]}.jpg`, false, 1024, 640) }), 0, 8.4, -4.55); pic.material.color.setScalar(0.8);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, clearcoat: 1, depthWrite: false });
  add(new THREE.BoxGeometry(14, 12.4, 0.1), glass, 0, 7.4, 4.6); [-7, 7].forEach(x => add(new THREE.BoxGeometry(0.1, 12.4, 9.2), glass, x, 7.4, 0));
  const c = CASES[w.id]; add(new THREE.PlaneGeometry(13, 2.03), new THREE.MeshBasicMaterial({ map: labelTex(c.title, c.pass.клиент) }), 0, 16.6, 0.2);
  w.prop = new THREE.Group(); w.prop.position.set(0, 1.2, 0.5); g.add(w.prop);
  g.userData.case = w.id; clickable.push(g); solid(g);
}
// ролик на носителе: пока видео не пошло, на экране стоит постер — кадр кейса
function videoOn(m, name) {
  const v = Object.assign(document.createElement('video'), { src: `assets/${name}.mp4`, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'none' });
  v.addEventListener('playing', () => { if (m.material.map?.isVideoTexture) return; const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; m.material.map = t; m.material.needsUpdate = true; }, { once: true });
  return v;
}
function towerBox(t, mat) { const m = new THREE.Mesh(mat === CONC ? cgeo(t.w, t.h, t.d) : new THREE.BoxGeometry(t.w, t.h, t.d), mat); m.position.set(t.x, t.h / 2, t.z); m.castShadow = m.receiveShadow = true; scene.add(m); return solid(m); }
function screen(w) {
  towerBox(w.tower, w.zone === 'ai' ? MAT.matte : towerMat);
  const [sw, sh] = w.size, c = CASES[w.id];
  const tex = w.webtoon ? null : caseTexture(`assets/cases/${w.img}.jpg`, false, 1024, 576);
  const { g, m } = screenAt(tex, sw, sh, w.F, w.cam, w.id);
  if (w.webtoon) webtoonInto(m.material, sw / sh);
  if (w.video) clips.push({ g, v: videoOn(m, w.video) });
  [w.F.y + sh / 2 - 2, w.F.y - sh / 2 + 2].forEach(y => { const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(w.tower.x) - w.tower.w / 2 - Math.abs(w.F.x) + 2, 0.9, 0.9), MAT.graphite); arm.position.set(w.s * (Math.abs(w.F.x) + Math.abs(w.tower.x) - w.tower.w / 2) / 2, y, w.z); scene.add(arm); });
  tagAt(c.title, c.pass.клиент, V(w.F.x, w.F.y + sh / 2 + 3.4, w.F.z), w.cam, 20);
  solid(g);
}
function roof(w) {
  towerBox(w.tower, towerMat);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w.tower.w + 1, 1.2, w.tower.d + 1), MAT.graphite); top.position.set(w.tower.x, w.tower.h + 0.6, w.z); scene.add(top);
  const { g, m } = screenAt(caseTexture(`assets/cases/${w.img}.jpg`, false, 576, 1024), BANNER.w, BANNER.h, w.F, w.cam, w.id);
  if (w.video) clips.push({ g, v: videoOn(m, w.video) });
  const c = CASES[w.id]; tagAt(c.title, c.pass.клиент, V(w.F.x, w.F.y + BANNER.h / 2 + 3, w.F.z), w.cam, 18);
  solid(g);
}
function buildWorld() {
  for (const w of WORLD) w.moment ? MOMENTS[w.moment].build(w) : ({ station, vitrine, screen, roof })[w.kind](w);
}
function updateWorld(time) {
  updateMoments(time);
  if (lionDance.mixer) { const dt = Math.min(0.05, time - (lionDance.t || time)); lionDance.t = time; lionDance.mixer.update(dt); }
  clips.forEach(c => { const near = c.g.position.distanceTo(camera.position) < 220; if (near && c.v.paused) c.v.play().catch(() => {}); else if (!near && !c.v.paused) c.v.pause(); });
}
// проверка: камера обоих маршрутов не должна заходить ни в один объект (в консоли при ?dev)
function checkPath() {
  const boxes = [...SOLIDS, ...CITY.cells.map(c => ({ box: new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, 0, c.z - c.d / 2), new THREE.Vector3(c.x + c.w / 2, c.h, c.z + c.d / 2)), name: 'дом' }))];
  const hits = [], s = new THREE.Sphere(new THREE.Vector3(), 2.5), q = new THREE.Vector3();
  for (const r of ['btl', 'atl']) {
    const k = CAM[r];
    for (let n = 0; n <= 800; n++) {
      const p = FORK + (1 - FORK) * n / 800; let i = 0; while (i < k.length - 2 && p > k[i + 1].p) i++;
      k.pos.getPoint((i + clamp01((p - k[i].p) / (k[i + 1].p - k[i].p))) / (k.length - 1), q); s.center.copy(q);
      const b = boxes.find(b => b.box.intersectsSphere(s)); if (b) hits.push({ r, p: +p.toFixed(3), cam: q.toArray().map(v => +v.toFixed(1)).join(' '), obj: b.name });
    }
  }
  console[hits.length ? 'warn' : 'log'](`проверка камеры: ${hits.length ? hits.length + ' касаний' : 'чисто'}`); if (hits.length) console.table(hits);
  return hits;
}


// ---------- мегаструктура ----------
// один бесконечный бетонный объём, разрезанный переборками на камеры: в каждой камере — квартал кейсов.
// как ограничиваем обзор без тумана (приём «первого Silent Hill» другими средствами):
// 1) темнота вместо тумана: общий свет нулевой, видно только то, что освещено лампами, шахтами и Искрой;
// 2) переборки с проёмами-порталами: рисуются только камера, где стоит зритель, и соседние, остальное скрыто (culling по z);
// 3) за проёмом — светящиеся рамки всех следующих порталов (дешёвые линии, их не прячем): коридор уходит в темноту бесконечно;
// 4) масштаб задают ориентиры: колонны во всю высоту, ярусы галерей с цепочками ламп, крошечные фигуры людей, косые световые шахты.
const W0 = -200, LOGO_Y = 92;
const HALL = { x: 120, h: 480, col: 100, gw: 44, gh: 140 };
const MEGA = { gates: [], cham: [], cull: [], lamps: [], anchors: [], pool: [], shafts: [], L: -1, figs: [] };
function megaSlab(x0, x1, y0, y1, z0, z1, mat = CONC) {
  const m = new THREE.Mesh(cgeo(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
// мягкие градиенты для «ненастоящего» света: размывка по колонне и пятно на полу
const washTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(0.25, 'rgba(0,0,0,0)'); sg.addColorStop(0.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = sg; g.fillRect(0, 0, w, h); });
function megaInst(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length), d = new THREE.Object3D();
  list.forEach((l, i) => { d.position.copy(l.p); d.rotation.set(l.rx || 0, l.ry || 0, 0); d.scale.set(l.sx || 1, l.sy || 1, l.sz || 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, new THREE.Color(0)); });
  im.frustumCulled = false; im.userData.noCull = true; im.userData.list = list; scene.add(im); MEGA.lamps.push(im); return im;
}
const addMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const beamMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(0xc9d4ff) } },
  vertexShader: 'varying float vY; varying float vF; void main(){ vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.); vec3 n = normalize(mat3(modelMatrix) * normal); vF = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: 'uniform float uK; uniform vec3 uC; varying float vY; varying float vF; void main(){ float a = uK * pow(vF, 2.) * mix(.3, 1., vY); gl_FragColor = vec4(uC, a); }',
});
function buildMega() {
  // переборки: между кварталами btl, перед наградами; первая — между залом логотипа и маршрутами
  const btl = WORLD.filter(w => w.r === 'btl');
  const G = [190]; for (let i = 1; i < btl.length; i++) if (btl[i].zone !== btl[i - 1].zone) G.push((btl[i].z + btl[i - 1].z) / 2);
  G.push(Math.max(...WORLD.map(w => w.z)) + 60);
  const END = TAIL.brief + 40; MEGA.gates = G; MEGA.end = END;
  const bounds = [W0, ...G, END];
  for (let i = 0; i < bounds.length - 1; i++) MEGA.cham.push([bounds[i], bounds[i + 1]]);
  const { x: X, h: H, col: C, gw, gh } = HALL, T = 12;
  // торцы
  megaSlab(-X - 12, X + 12, 0, H, W0 - 14, W0); megaSlab(-X - 12, X + 12, 0, H, END, END + 14);
  const washL = [], poolL = [], dotL = [], stripL = [], winL = [];
  const fig = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 });
  const figGeo = new THREE.CapsuleGeometry(0.32, 1.1, 3, 8); figGeo.translate(0, 0.87, 0);
  MEGA.cham.forEach(([z0, z1], ci) => {
    megaSlab(-X, X, -3, 0, z0, z1, CONC_FLOOR);                                   // пол
    megaSlab(-X, X, H, H + 10, z0, z1);                                            // перекрытие
    [-1, 1].forEach(s => megaSlab(s < 0 ? -X - 12 : X, s < 0 ? -X : X + 12, 0, H, z0, z1));   // стены
    // колоннада во всю высоту + размывка света от напольных ламп по внутренней грани
    for (let z = z0 + 22; z < z1 - 12; z += 40) [-1, 1].forEach(s => {
      megaSlab(s * C - 5, s * C + 5, 0, H, z - 5, z + 5);
      washL.push({ p: V(s * (C - 5.05), 34, z), ry: Math.PI / 2, sx: 10, sy: 68, z });
      poolL.push({ p: V(s * (C - 14), 0.05, z), rx: -Math.PI / 2, sx: 30, sy: 30, z });
    });
    // ярусы галерей: тонкие плиты вдоль стен, перила и цепочки маленьких ламп — масштаб
    [130, 270, 390].forEach((y, k) => [-1, 1].forEach(s => {
      if ((ci + k) % 3 === 2 && s > 0) return;   // не на каждой стене: ритм, а не сетка
      megaSlab(s < 0 ? -X : X - 9, s < 0 ? -X + 9 : X, y - 1.6, y, z0 + 2, z1 - 2);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, z1 - z0 - 4), MAT.graphite); rail.position.set(s * (X - 9), y + 1.1, (z0 + z1) / 2); scene.add(rail);
      for (let z = z0 + 8; z < z1 - 4; z += 12) dotL.push({ p: V(s * (X - 8.6), y - 2.4, z), sx: 0.7, sy: 0.35, sz: 0.7, z });
      // фигуры людей у перил: 1,8 м на фоне стены в 480 м
      if ((ci * 7 + k * 3) % 4 === 0) for (let n = 0; n < 2; n++) { const f = new THREE.Mesh(figGeo, fig); f.position.set(s * (X - 6 - n * 1.2), y, z0 + 30 + ((ci * 37 + k * 53 + n * 3) % Math.max(10, z1 - z0 - 60))); f.castShadow = true; scene.add(f); }
    }));
    // косая световая шахта: окно высоко в стене, луч через весь зал, пятно на полу (настоящий свет с тенями — пул)
    const s = ci % 2 ? 1 : -1, zc = (z0 + z1) / 2, win = V(s * (X - 0.2), 400, zc - 30), spot = V(-s * 26, 0, zc + 26);
    winL.push({ p: win, ry: Math.PI / 2, sx: 16, sy: 54, z: zc });
    const dir = spot.clone().sub(win), len = dir.length();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 24, len, 4, 1, true), beamMat());
    beam.position.copy(win).addScaledVector(dir, 0.5); beam.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize().negate()); beam.rotateY(Math.PI / 4);
    beam.userData.noCull = true; scene.add(beam); MEGA.shafts.push({ beam, win, spot, z: zc });
    // фигуры на полу у границ светового пятна
    for (let n = 0; n < 3; n++) { const f = new THREE.Mesh(figGeo, fig); f.position.set(spot.x + (n - 1) * 3 + s * 8, 0, spot.z + 18 + n * 2); f.castShadow = true; scene.add(f); }
  });
  // переборки с порталом и рамка света по проёму; рамку видно и из дальних камер — коридор порталов в темноту
  G.forEach(g => {
    solid(megaSlab(-X, -gw, 0, H, g - T / 2, g + T / 2)); solid(megaSlab(gw, X, 0, H, g - T / 2, g + T / 2)); solid(megaSlab(-gw, gw, gh, H, g - T / 2, g + T / 2));
    [[-gw + 0.3, gh / 2, 0.6, gh], [gw - 0.3, gh / 2, 0.6, gh]].forEach(([x, y, w, h]) => stripL.push({ p: V(x, y, g - T / 2 - 0.1), sx: w, sy: h, sz: 0.4, z: g }));
    stripL.push({ p: V(0, gh - 0.3, g - T / 2 - 0.1), sx: gw * 2, sy: 0.6, sz: 0.4, z: g });
    MEGA.anchors.push({ p: V(0, gh - 10, g - 14), k: 1.0 });
  });
  // торцевая стена с логотипом: ряд напольных светильников размывает свет вверх по бетону — на отлёте видно, какая она огромная
  const endL = []; for (let x = -96; x <= 96; x += 48) { endL.push({ p: V(x, 110, W0 + 0.3), sx: 16, sy: 220, z: W0 + 1 }); poolL.push({ p: V(x, 0.05, W0 + 6), rx: -Math.PI / 2, sx: 22, sy: 14, z: W0 + 1 }); }
  const warm = new THREE.Color(0xffb27a);
  MEGA.wash = megaInst(new THREE.PlaneGeometry(1, 1), addMat(washTex), washL); MEGA.wash.userData.col = warm.clone().multiplyScalar(0.8);
  MEGA.endWash = megaInst(new THREE.PlaneGeometry(1, 1), addMat(washTex), endL); MEGA.endWash.userData.col = warm.clone().multiplyScalar(0.3);
  MEGA.pools = megaInst(new THREE.PlaneGeometry(1, 1), addMat(softDot), poolL); MEGA.pools.userData.col = warm.clone().multiplyScalar(0.35);
  MEGA.dots = megaInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), dotL); MEGA.dots.userData.col = new THREE.Color(0xffd2a0).multiplyScalar(2.2);
  MEGA.strips = megaInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), stripL); MEGA.strips.userData.col = new THREE.Color(0xfff1e0).multiplyScalar(2.6);
  MEGA.wins = megaInst(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), winL); MEGA.wins.userData.col = new THREE.Color(0xdfe6ff).multiplyScalar(2.4);
  // настоящий свет — пул из четырёх ламп и одной шахты с тенью; лампы садятся к ближайшим точкам у камеры, число источников постоянно (без перекомпиляции шейдеров)
  WORLD.forEach(w => MEGA.anchors.push({ p: w.F.clone().add(V(w.F.x < 0 ? 18 : -18, 26, -16)), k: 1.25 }));
  MEGA.anchors.push({ p: V(0, 60, W0 + 60), k: 1.4 }, { p: V(-70, 20, W0 + 120), k: 0.8 }, { p: V(70, 20, W0 + 120), k: 0.8 });
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc89a, 0, 170, 1); scene.add(l); MEGA.pool.push(l); }
  const sun = new THREE.SpotLight(0xcfd8ff, 0, 0, 0.16, 0.5, 0); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 60; sun.shadow.camera.far = 700; sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target); MEGA.sun = sun;
  // всё, что есть в сцене к этому моменту, кроме ламп и Искры, прячется вне соседних камер
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3();
  scene.traverse(o => { if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || o.userData.noCull || o === iskra || o.parent?.userData.noCull) return; b.setFromObject(o); if (b.isEmpty()) return; MEGA.cull.push({ o, z0: b.min.z - 20, z1: b.max.z + 20 }); });
  scene.traverse(o => { if (o.isMesh && !o.castShadow && o.material?.isMeshStandardMaterial) { o.castShadow = true; o.receiveShadow = true; } });
}
const chamberAt = z => { const c = MEGA.cham; for (let i = 0; i < c.length; i++) if (z < c[i][1]) return i; return c.length - 1; };
let megaCh = -1;
function updateMega(time, L) {
  const cz = camera.position.z, ci = chamberAt(cz);
  if (ci !== megaCh) {
    megaCh = ci; const c = MEGA.cham, lo = c[Math.max(0, ci - 1)][0], hi = c[Math.min(c.length - 1, ci + 1)][1];
    MEGA.cull.forEach(e => { e.o.visible = e.z1 >= lo && e.z0 <= hi; });
  }
  // включение света волной от логотипа: каждая лампа вспыхивает, мигнув, когда до неё доходит фронт
  if (L !== MEGA.L || (L > 0 && L < 1)) {
    MEGA.L = L; const front = L * L * (MEGA.end - W0 + 200), col = new THREE.Color();
    MEGA.lamps.forEach(im => { const base = im.userData.col; im.userData.list.forEach((l, i) => {
      const k = clamp01((front - (l.z - W0)) / 60), flick = k > 0 && k < 1 ? (Math.sin(time * 47 + i * 3.1) > 0.2 ? 1 : 0.15) : 1;
      im.setColorAt(i, col.copy(base).multiplyScalar(k * flick)); }); im.instanceColor.needsUpdate = true; });
  }
  // лампы пула — к ближайшим точкам; яркость гаснет с расстоянием, чтобы пересадка была незаметной
  const cp = camera.position, near = MEGA.anchors.map(a => ({ a, d: a.p.distanceTo(cp) })).sort((x, y) => x.d - y.d);
  MEGA.pool.forEach((l, i) => { const n = near[i]; l.position.copy(n.a.p); l.intensity = 40 * n.a.k * L * clamp01((420 - n.d) / 160); });
  // шахта с тенью — в камере зрителя
  const sh = MEGA.shafts[ci], lamp = clamp01((MEGA.L * (MEGA.end - W0 + 200) * MEGA.L - (sh.z - W0)) / 60);
  MEGA.sun.position.copy(sh.win); MEGA.sun.target.position.copy(sh.spot); MEGA.sun.intensity = 9 * lamp;
  MEGA.shafts.forEach(s => { s.beam.material.uniforms.uK.value = 0.16 * clamp01((MEGA.L * MEGA.L * (MEGA.end - W0 + 200) - (s.z - W0)) / 60); });
  hemi.intensity = 0.09 * L;
}

// ---------- атмосфера города по рефам ----------
// небо со звёздами и красным горизонтом, красный туман слоями, дождь, мокрый асфальт с отражениями неона,
// эстакады с граффити и поездом, провода со световыми коробами, неон в сетке, пожарные лестницы, кондиционеры,
// хромовые шипы y2k, светодиодные колонны данных, матовая колонна с силуэтом, разметка на асфальте, летающие машины
const FX = { blobs: [], rain: null, fog: [], mist: [], train: [], leds: [], sparks: [], fliers: [], holo: null, holoMix: null };
const CITY = { cells: [] };
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const softDot = canvasTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
const starFlare = canvasTex(128, 128, g => { g.translate(64, 64); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 18); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); g.fillStyle = 'rgba(255,255,255,.9)'; [0, Math.PI / 2].forEach(a => { g.save(); g.rotate(a); g.beginPath(); g.moveTo(-62, 0); g.lineTo(0, -2.2); g.lineTo(62, 0); g.lineTo(0, 2.2); g.closePath(); g.fill(); g.restore(); }); });
// реф 9 и пин: чёрное небо со звёздами, красный горизонт, дымная полоса
function skyStars() {
  const t = canvasTex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#010102'); gr.addColorStop(0.34, '#06030a'); gr.addColorStop(0.45, '#2c0407'); gr.addColorStop(0.5, '#9a070b'); gr.addColorStop(0.54, '#250406'); gr.addColorStop(1, '#040203');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry(9); for (let i = 0; i < 1600; i++) { const s = r() < 0.04 ? 2.6 : 1.2; g.fillStyle = `rgba(255,${225 + r() * 30 | 0},${205 + r() * 50 | 0},${0.3 + r() * 0.7})`; g.fillRect(r() * w, r() * h * 0.43, s, s); }
    for (let i = 0; i < 320; i++) { const x = r() * w, y = h * (0.37 + r() * 0.12), rr = 18 + r() * 80, cg = g.createRadialGradient(x, y, 0, x, y, rr); cg.addColorStop(0, 'rgba(6,2,3,.6)'); cg.addColorStop(1, 'rgba(6,2,3,0)'); g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  });
  t.mapping = THREE.EquirectangularReflectionMapping; return t;
}
// реф 1: граффити и расклейка на бетоне
function graffitiTex(seed, w = 1024, h = 256) {
  return canvasTex(w, h, (g) => {
    const r = mulberry(seed); g.fillStyle = '#26232a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 8); }
    const pal = ['#F40709', '#E1D9CF', '#3fe0c5', '#ff5fa2', '#111111', '#ff7a1a'];
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(225,217,207,${0.08 + r() * 0.1})`; const pw = 40 + r() * 70; g.fillRect(r() * w, r() * h * 0.6, pw, pw * 1.3); }   // ободранные афиши
    for (let i = 0; i < 26; i++) {   // теги
      g.strokeStyle = pal[(r() * pal.length) | 0]; g.lineWidth = 1.5 + r() * 4; g.beginPath(); let x = r() * w, y = 30 + r() * (h - 50); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.bezierCurveTo(x + r() * 40, y - 30 + r() * 60, x + r() * 60, y - 30 + r() * 60, x += 20 + r() * 40, y + (r() - 0.5) * 30);
      g.stroke();
    }
    const words = ['КИСЛОРОД', 'OXYGEN', '20_26', 'ИСКРА', 'ГОРИ'];
    for (let i = 0; i < 3; i++) {   // пузырьковые буквы
      const s = 60 + r() * 50; g.font = `italic 900 ${s}px TT, sans-serif`; const x = r() * (w - 300), y = h * 0.4 + r() * h * 0.5, word = words[(r() * words.length) | 0];
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#111'; g.strokeText(word, x, y); g.fillStyle = pal[(r() * 4) | 0]; g.fillText(word, x, y); g.lineWidth = 2; g.strokeStyle = '#E1D9CF'; g.strokeText(word, x, y);
      for (let d = 0; d < 6; d++) { g.fillStyle = g.strokeStyle; g.fillRect(x + r() * 250, y, 2, 6 + r() * 30); }
    }
  });
}
// реф 3 и 10: неон в сетке и вертикальные вывески с синим контуром
function neonTex(txt, vertical) {
  const W = vertical ? 160 : 512, H = vertical ? 640 : 320;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#0c0608'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(244,7,9,.14)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = vertical ? '#4d7cff' : '#F40709'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16);
    g.font = `700 ${vertical ? 112 : 150}px "Hiragino Sans","Apple SD Gothic Neo","Noto Sans CJK JP",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...txt], draw = (blur, col, lw) => { g.shadowColor = '#ff1a1a'; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; chars.forEach((ch, i) => vertical ? g.strokeText(ch, W / 2, 90 + i * 118) : g.strokeText(ch, W / 2 + (i - (chars.length - 1) / 2) * 160, H / 2)); };
    draw(26, '#ff2a2a', 9); draw(8, '#ffd6d6', 3);
  });
}
// реф 12: колонна данных — красные штрихи на чёрном, лента бежит вниз
function dataTex(seed) {
  const t = canvasTex(64, 512, (g) => { const r = mulberry(seed); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 512); for (let c = 0; c < 3; c++) for (let y = 0; y < 512; y += 6) if (r() < 0.62) { g.fillStyle = r() < 0.08 ? '#ff6a6a' : '#e0080b'; g.fillRect(4 + c * 20 + r() * 3, y, 4 + r() * 13, r() < 0.1 ? 9 : 3); } });
  t.wrapT = THREE.RepeatWrapping; return t;
}
// реф 11: хромовые шипы y2k — ветви из сужающихся конусов, шипы и звёздные блики на концах
function chromeThorn(seed, mat) {
  const r = mulberry(seed), g = new THREE.Group(), cone = new THREE.ConeGeometry(1, 1, 10, 1, true); cone.translate(0, 0.5, 0);
  const parts = [], o = new THREE.Object3D();   // все конусы дерева склеиваются в одну геометрию — один вызов отрисовки
  const seg = (a, b, r0) => { const d = b.clone().sub(a); o.position.copy(a); o.scale.set(r0, d.length(), r0); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); o.updateMatrix(); parts.push(cone.clone().applyMatrix4(o.matrix)); };
  const grow = (p, dir, len, rad, depth) => {
    let cur = p.clone(); const n = 5;
    for (let i = 0; i < n; i++) {
      dir = dir.clone().add(V((r() - 0.5) * 0.7, (r() - 0.2) * 0.4, (r() - 0.5) * 0.7)).normalize();
      const nx = cur.clone().add(dir.clone().multiplyScalar(len / n)); seg(cur, nx, rad * (1 - i / n) + 0.05); cur = nx;
      if (r() < 0.55) { const sd = V(r() - 0.5, r() - 0.3, r() - 0.5).normalize(), tip = cur.clone().add(sd.multiplyScalar(1.5 + r() * 4)); seg(cur, tip, rad * 0.35); if (r() < 0.6) FX.sparks.push({ p: tip, ph: r() * 6, s: 1.5 + r() * 2.5 }); }
    }
    if (depth > 0) for (let k = 0; k < 2; k++) grow(cur, dir.clone().add(V((r() - 0.5) * 1.4, 0.3, (r() - 0.5) * 1.4)).normalize(), len * 0.7, rad * 0.6, depth - 1);
    else FX.sparks.push({ p: cur, ph: r() * 6, s: 2 + r() * 3 });
  };
  grow(V(0, 0, 0), V(0, 1, 0), 22, 1.1, 2);
  g.add(new THREE.Mesh(mergeGeometries(parts), mat));
  return g;
}
function buildAtmosphere() {
  const r = mulberry(2026);
  // небо и туман: красный горизонт, туман густеет к земле
  scene.background = skyStars(); scene.fog = new THREE.FogExp2(0x1d0608, 0.0023);
  // отражения для хрома: тёмная комната с красными и белыми полосами света
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x040203);
  [[RED, 0, 6, -12, 30, 4], [0xffe0e0, 9, 2, -10, 4, 18], [RED, -10, -4, 8, 20, 3], [0xffffff, 0, 12, 10, 10, 8], [0xffd0d0, -12, 6, -4, 3, 20], [RED, 12, -8, 4, 16, 6]].forEach(([c, x, y, z, w, h]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); envScene.add(p); });
  const chromeEnv = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02).texture;
  MAT.chrome.envMap = chromeEnv; MAT.chrome.needsUpdate = true; const chrome = MAT.chrome;

  // реф 6 и 13: мокрый асфальт — гладкий металлизированный слой отражает красно-белую комнату, без второго рендера сцены
  CITY.ground.material = new THREE.MeshStandardMaterial({ color: 0x0b0a0d, roughness: 0.16, metalness: 0.85, envMap: chromeEnv, envMapIntensity: 0.45 });

  // реф 6, 7: дождь вокруг камеры
  const N = 1600, rp = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (r() - 0.5) * 140, y = r() * 110, z = (r() - 0.5) * 140; rp.set([x, y, z, x + 0.12, y - 1.8, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  FX.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffb0b0, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  FX.rain.frustumCulled = false; scene.add(FX.rain);

  // реф 4, 5: город плотнее — пожарные лестницы, кондиционеры, буквы на крышах, неон, колонны данных на фасадах у улицы
  const near = CITY.cells.filter(c => Math.abs(c.x) < 80 && c.z > -20 && c.z < 1200 && Math.abs(c.x) - c.w / 2 > 18);
  const fe = { plat: [], stair: [] }, dm = new THREE.Object3D();
  near.forEach((c, i) => {
    const side = Math.sign(c.x), fx = c.x - side * (c.w / 2 + 1.3), q = r();
    if (q < 0.1 && c.h > 30) { for (let y = 6; y < Math.min(c.h - 4, 60); y += 6) { fe.plat.push([fx, y, c.z, 0]); fe.stair.push([fx, y + 3, c.z + (y / 6 % 2 ? 1.6 : -1.6), y / 6 % 2 ? 1 : -1]); } }
    else if (q < 0.2) { const ld = dataTex(i), m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, Math.min(c.h * 0.7, 46)), new THREE.MeshBasicMaterial({ map: ld, toneMapped: false })); m.position.set(c.x - side * (c.w / 2 + 0.25), Math.min(c.h * 0.7, 46) / 2 + 6, c.z + (r() - 0.5) * c.d * 0.5); m.rotation.y = -side * Math.PI / 2; scene.add(m); FX.leds.push({ t: ld, k: 0.04 + r() * 0.08 }); }
    else if (q < 0.32) { const vert = r() < 0.5, words = ['九龍城', '眠らない', '酒場', 'パチンコ', '電脳', '夜市'], t = neonTex(words[i % words.length], vert), w = vert ? 3.2 : 10, h = vert ? 12.8 : 6.25;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.material.color.setScalar(1.15); m.position.set(c.x - side * (c.w / 2 + 1.6), 12 + r() * Math.min(28, c.h - 16), c.z + (r() - 0.5) * c.d * 0.5); m.rotation.y = -side * Math.PI / 2 + side * 0.35; scene.add(m);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ map: softDot, color: 0x7a0a0c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.set(m.position.x - side * 5, 0.06, m.position.z); scene.add(pool); }
    if (r() < 0.12 && c.h < 70) {   // реф 5: буквы на крыше
      const words = ['ОТЕЛЬ', 'КИСЛОРОД', '20_26', 'ИСКРА', 'НОЧЬ'], word = words[i % words.length];
      const t = canvasTex(1024, 220, (g) => { g.font = '520 190px TT, sans-serif'; g.textAlign = 'center'; g.shadowColor = '#ffcfa0'; g.shadowBlur = 18; g.fillStyle = '#f3e6d4'; g.fillText(word, 512, 186); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w * 1.2, c.w * 0.26), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide })); m.material.color.setScalar(0.9);
      m.position.set(c.x, c.h + c.w * 0.18, c.z); m.rotation.y = -side * 0.5 + Math.PI; scene.add(m);
    }
  });
  const inst = (geo, list, fn) => { const im = new THREE.InstancedMesh(geo, MAT.matte, list.length); list.forEach((a, i) => { fn(a); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); }); scene.add(im); };
  inst(new THREE.BoxGeometry(2.4, 0.25, 7), fe.plat, ([x, y, z]) => { dm.position.set(x, y, z); dm.rotation.set(0, 0, 0); });
  inst(new THREE.BoxGeometry(1.6, 0.2, 7.2), fe.stair, ([x, y, z, s]) => { dm.position.set(x, y, z); dm.rotation.set(s * 0.72, 0, 0); });
  inst(new THREE.BoxGeometry(0.12, 1.1, 7), fe.plat, ([x, y, z]) => { dm.position.set(x - Math.sign(x) * 1.15, y + 0.6, z); dm.rotation.set(0, 0, 0); });
  // кондиционеры и уличные мелочи — открытые модели poly haven (cc0)
  const props = (file, pick, list, k, place) => gltfLoader.loadAsync(`assets/models/props/${file}.glb`).then(gl => {
    const meshes = []; gl.scene.updateMatrixWorld(true); gl.scene.traverse(o => { if (o.isMesh && pick(o.name)) meshes.push(o); });
    meshes.forEach(src => { const im = new THREE.InstancedMesh(src.geometry, src.material, list.length); list.forEach((a, i) => { place(a, dm); dm.scale.setScalar(k); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix.clone().multiply(src.matrixWorld)); }); scene.add(im); });
  }).catch(e => console.warn(file, e));
  const ac = []; near.forEach(c => { const side = Math.sign(c.x); for (let y = 8; y < Math.min(c.h - 3, 44); y += 7 + r() * 6) if (r() < 0.12) ac.push([c.x - side * (c.w / 2 + 0.5), y, c.z + (r() - 0.5) * c.d * 0.7, side]); });
  props('exterior_aircon_unit', n => n === 'exterior_aircon_unit', ac, 2.4, ([x, y, z, s], d) => { d.position.set(x, y, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  const walk = []; for (let z = 40; z < TAIL.brief; z += 12 + r() * 16) { const side = r() < 0.5 ? -1 : 1, edge = z > 165 && z < TAIL.brief - 10 ? 39 : 18; walk.push([side * (edge - r() * 2), z, side, (r() * 3) | 0]); }
  props('metal_trash_can', n => !n.includes('rust'), walk.filter(w => w[3] === 0), 2.2, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, r() * 6, 0); });
  props('fire_hydrant', n => n === 'fire_hydrant' || n === 'fire_hydrant_cap_01', walk.filter(w => w[3] === 1), 2.4, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  props('utility_box_01', () => true, walk.filter(w => w[3] === 2), 2.6, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  // реф 3: подвесные лампы над тротуаром — абажур и пятно света под ним
  const lamps = []; for (let z = 60; z < TAIL.brief; z += 80) [-1, 1].forEach(s => lamps.push([s * (z > 165 && z < TAIL.brief - 10 ? 35 : 15), 13, z + s * 6]));
  props('hanging_industrial_lamp', () => true, lamps, 2.4, ([x, y, z], d) => { d.position.set(x, y, z); d.rotation.set(0, 0, 0); });
  const glowM = new THREE.SpriteMaterial({ map: softDot, color: 0x806048, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  lamps.forEach(([x, y, z]) => { const s = new THREE.Sprite(glowM); s.scale.setScalar(2.2); s.position.set(x, y - 0.6, z); scene.add(s); const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: softDot, color: 0x5a3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.07, z); scene.add(pool); });

  // реф 1 и пин: эстакады над проспектом — бетон в граффити, огни снизу, по верхней едет поезд
  const gapZ = (a, b) => (ZR[a][1] + ZR[b][0]) / 2;   // эстакады — в просветах между кварталами, над коридором btl и под коридором atl
  [[gapZ('asia', 'joint'), 34, 1], [gapZ('sport', 'event'), 34, 2]].forEach(([z, y, s]) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(260, 3, 14), [MAT.graphite, MAT.graphite, MAT.matte, MAT.matte, new THREE.MeshStandardMaterial({ map: graffitiTex(s), roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: graffitiTex(s + 7), roughness: 0.9 })]);
    deck.material[4].map.wrapS = deck.material[5].map.wrapS = THREE.RepeatWrapping; deck.material[4].map.repeat.x = deck.material[5].map.repeat.x = 4;
    deck.position.set(0, y, z); scene.add(deck);
    [-1, 1].forEach(side => { const p = new THREE.Mesh(new THREE.BoxGeometry(4, y - 1.5, 6), new THREE.MeshStandardMaterial({ map: graffitiTex(s * 10 + side + 3, 256, 512), roughness: 0.9 })); p.position.set(side * 43, (y - 1.5) / 2, z); scene.add(p); });
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 260, 12), MAT.chrome); rail.rotation.z = Math.PI / 2; rail.position.set(0, y + 2.1, z - 6.8); scene.add(rail);
    for (let x = -40; x <= 40; x += 10) { const l = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8b0).multiplyScalar(1.2), toneMapped: false })); l.rotation.x = Math.PI / 2; l.position.set(x, y - 1.55, z); scene.add(l); }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(18, 4.4, 1.2), [MAT.gloss, MAT.gloss, MAT.gloss, MAT.gloss, MAT.gloss, new THREE.MeshBasicMaterial({ map: canvasTex(1024, 250, (g) => { g.fillStyle = '#F40709'; g.fillRect(0, 0, 1024, 250); g.font = '520 150px TT, sans-serif'; g.fillStyle = '#111'; g.textAlign = 'center'; g.fillText(s === 1 ? 'кислород · 24' : 'топливо идей', 512, 180); }), toneMapped: false })]);
    sign.position.set(s === 1 ? -14 : 14, y - 4.6, z - 7.4); sign.rotation.y = Math.PI; scene.add(sign);
    if (s === 1) for (let k = 0; k < 6; k++) {   // поезд: шесть вагонов, окна светятся кремовым и бирюзой
      const t = canvasTex(512, 64, (g) => { g.fillStyle = '#0d0d10'; g.fillRect(0, 0, 512, 64); for (let x = 10; x < 500; x += 34) { g.fillStyle = (x / 34 | 0) % 5 === 0 ? '#3fe0c5' : '#ffd8b0'; g.fillRect(x, 14, 24, 22); } g.fillStyle = '#F40709'; g.fillRect(0, 48, 512, 5); });
      const car = new THREE.Mesh(new THREE.BoxGeometry(13, 3.4, 3.2), [MAT.matte, MAT.matte, MAT.graphite, MAT.matte, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })]);
      car.material[4].color.setScalar(0.9); scene.add(car); FX.train.push({ car, k, y: y + 3.2, z: z - 2 });
    }
  });

  // реф 8: разметка на асфальте — штриховка, стрелки и номера кварталов, как в ruiner
  const decal = (txt, w, h, x, z, ry = 0) => { const t = canvasTex(512, 256, (g) => { g.strokeStyle = 'rgba(244,7,9,.55)'; g.lineWidth = 14; for (let i = -256; i < 512; i += 46) { g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); } g.clearRect(40, 70, 432, 116); g.font = '520 86px TT, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(225,217,207,.5)'; g.fillText(txt, 256, 158); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.08, z); scene.add(m); };
  [['азия', 'asia'], ['спорт', 'sport'], ['ивент', 'event'], ['мерч', 'merch']].forEach(([t, k]) => decal('{04} ' + t, 16, 8, -12, ZR[k][0] - 52, Math.PI)); decal('{06} награды', 16, 8, 0, TAIL.awards - 40, Math.PI);

  // реф 11: хромовые шипы y2k на площади, на перекрёстке, у квартала мерча и над ai-кварталом
  [[-44, 0, 74, 1.3], [46, 0, 80, 1.1], [30, 0, ZR.merch[0] - 40, 0.9], [0, 132, (ZR.ai[0] + ZR.ai[1]) / 2, 1.0]].forEach(([x, y, z, k], i) => { const t = chromeThorn(31 + i, chrome); t.position.set(x, y, z); t.scale.setScalar(k); t.rotation.y = i; scene.add(t); t.updateMatrixWorld(true); FX.sparks.filter(s => !s.w).forEach(s => { s.w = s.p.clone().applyMatrix4(t.matrixWorld); }); });
  const sparkM = new THREE.SpriteMaterial({ map: starFlare, color: 0xffeaea, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  FX.sparks.forEach((s, i) => { if (i % 3) return; s.sp = new THREE.Sprite(sparkM); s.sp.position.copy(s.w); scene.add(s.sp); });

  // хромовые формы y2k в разных местах: над площадью, у перекрёстка, над кварталом мерча, среди ai-башен
  [[-46, 74, 56, 'knot', 6], [28, 40, ZR.merch[0] - 30, 'blob', 6], [-24, 112, ZR.ai[0], 'blob', 8], [26, 104, ZR.ai[1], 'torus', 7]].forEach(([x, y, z, kind, k], i) => {
    const geo = kind === 'knot' ? new THREE.TorusKnotGeometry(1, 0.32, 160, 24, 2, 3) : kind === 'torus' ? new THREE.TorusGeometry(1, 0.38, 32, 96) : new THREE.IcosahedronGeometry(1, 5);
    if (kind === 'blob') { const pa = geo.attributes.position, v = new THREE.Vector3(); for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j); const n = 1 + 0.22 * Math.sin(v.x * 4 + i) * Math.cos(v.y * 3) + 0.12 * Math.sin(v.z * 6); v.multiplyScalar(n); pa.setXYZ(j, v.x, v.y, v.z); } geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, chrome); m.position.set(x, y, z); m.scale.setScalar(k); scene.add(m); FX.blobs.push({ m, y, ph: i });
  });
  // реф 6, 15, 16 и пин: матовая красная колонна-голограмма, за стеклом танцует силуэт льва
  const holo = new THREE.Group(); holo.position.set(-112, 0, (ZR.sport[0] + ZR.sport[1]) / 2); scene.add(holo);
  const glassCol = new THREE.Mesh(new THREE.BoxGeometry(34, 120, 16), new THREE.MeshStandardMaterial({ color: 0xff3030, transparent: true, opacity: 0.68, roughness: 0.9, emissive: RED, emissiveIntensity: 0.35, depthWrite: false }));
  glassCol.position.y = 92; holo.add(glassCol);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(34, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.4), toneMapped: false })); back.position.set(0, 92, -7.5); holo.add(back);
  const base = new THREE.Mesh(new THREE.BoxGeometry(40, 32, 22), MAT.matte); base.position.y = 16; holo.add(base);
  holo.rotation.y = 0.6;
  gltfLoader.loadAsync('assets/models/lion-dance.glb').then(gl => { const m = gl.scene, bb = new THREE.Box3().setFromObject(m), k = 96 / (bb.max.y - bb.min.y); m.scale.setScalar(k); m.position.set(0, 36 - bb.min.y * k, -2); m.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x050102 }); o.frustumCulled = false; } }); holo.add(m); FX.holoMix = new THREE.AnimationMixer(m); gl.animations.forEach(a => FX.holoMix.clipAction(a).setEffectiveTimeScale(0.8).play()); });

  // реф 6, 7: летающие машины с фарами над кварталами
  const beamG = new THREE.ConeGeometry(2.6, 26, 16, 1, true); beamG.translate(0, -13, 0); beamG.rotateZ(Math.PI / 2);
  const beamM = new THREE.MeshBasicMaterial({ color: 0xffe0d0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 2.6), MAT.matte); f.add(b);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.3), MAT.graphite); fin.position.set(-2.4, 1.1, 0); f.add(fin);
    [-0.8, 0.8].forEach(zz => { const s = new THREE.Sprite(glowM); s.scale.setScalar(2.2); s.position.set(3.1, 0, zz); f.add(s); });
    const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); t.scale.setScalar(1.6); t.position.set(-3.1, 0, 0); f.add(t);
    const beam = new THREE.Mesh(beamG, beamM); beam.position.x = 3; beam.rotation.z = -0.25; f.add(beam);
    scene.add(f); FX.fliers.push({ f, y: 60 + r() * 90, z: 100 + r() * (TAIL.brief - 100), sp: (r() < 0.5 ? -1 : 1) * (14 + r() * 16), x0: (r() - 0.5) * 600 });
  }
}
function updateAtmosphere(time, dt) {
  if (FX.rain) {   // дождь едет вместе с камерой
    const a = FX.rain.geometry.attributes.position, p = a.array, cy = camera.position.y;
    for (let i = 0; i < p.length; i += 6) { p[i + 1] -= dt * 70; p[i + 4] -= dt * 70; if (p[i + 1] < cy - 55) { p[i + 1] += 110; p[i + 4] += 110; } else if (p[i + 1] > cy + 60) { p[i + 1] -= 110; p[i + 4] -= 110; } }
    a.needsUpdate = true; FX.rain.position.set(camera.position.x, 0, camera.position.z);
  }
  FX.leds.forEach(l => { l.t.offset.y = (time * l.k) % 1; });
  FX.sparks.forEach(s => { s.sp && s.sp.scale.setScalar(s.s * (0.6 + 0.5 * Math.max(0, Math.sin(time * 2.2 + s.ph)))); });
  FX.train.forEach(t => { t.car.position.set(((time * 26 + t.k * 13.4) % 520) - 260, t.y, t.z); });
  FX.fliers.forEach(f => { const x = ((f.x0 + time * f.sp) % 700 + 700) % 700 - 350; f.f.position.set(x, f.y, f.z); f.f.rotation.y = f.sp > 0 ? 0 : Math.PI; });
  FX.blobs.forEach(b => { b.m.rotation.set(time * 0.3 + b.ph, time * 0.4, 0); b.m.position.y = b.y + Math.sin(time * 0.7 + b.ph) * 1.5; });
  if (FX.holoMix) FX.holoMix.update(dt);
}

// ---------- сценарий скролла ----------
// p — доля прокрутки 0..1. Между ключами — плавная интерполяция, поэтому на каждом ключе камера как бы «присаживается»
// у каждой остановки равный отрезок скролла между развилкой и наградами: p — середина, a…b — окно рассказа
const P_START = 0.6, P_END = 0.925;
for (const r of ['btl', 'atl']) {
  const list = WORLD.filter(w => w.r === r), span = (P_END - P_START) / list.length;
  list.forEach((w, i) => { w.p = P_START + span * (i + 0.5); w.a = w.p - span * 0.5; w.b = w.p + span * 0.5; w.span = span; });
}
const firstOf = (zone, r) => WORLD.find(w => w.zone === zone && (!r || w.r === r)).p;
const GO = { reel: 0.48, cross: 0.57, btl: firstOf('asia'), atl: WORLD.find(w => w.r === 'atl').p, alley: firstOf('asia'), sport: firstOf('sport'), event: firstOf('event'), shops: firstOf('merch'), dixy: firstOf('dixy'), ai: firstOf('ai'), awards: 0.944, brief: 1 };
const FORK = 0.592;
let CAM = {}, ISK = [], route = null;
function buildTimeline() {
  const s = slotWorld;
  // интро: темнота → Искра летит к торцевой стене и подсвечивает её → встаёт в тусклое лого → свет включается волной → отлёт на весь объём
  const head = [
    { p: 0.00, pos: V(0, LOGO_Y + 6, W0 + 250), look: V(0, LOGO_Y, W0 + 100) },
    { p: 0.05, pos: V(0, LOGO_Y + 6, W0 + 250), look: V(0, LOGO_Y, W0 + 100) },
    { p: 0.17, pos: V(22, LOGO_Y + 16, W0 + 150), look: V(s.x * 0.5, LOGO_Y, W0) },
    { p: 0.31, pos: V(s.x + 8, s.y + 10, s.z + 62), look: s },
    { p: 0.37, pos: V(0, s.y - 2, s.z + 92), look: V(0, s.y - 6, W0) },
    { p: 0.43, pos: V(70, 250, W0 + 340), look: V(0, 150, W0) },
    { p: 0.48, pos: V(0, 30, W0 + 92), look: V(0, 30, W0) },
    { p: 0.502, pos: V(0, 30, W0 + 96), look: V(0, 30, W0) },
    { p: 0.518, pos: V(0, 34, W0 + 130), look: V(-220, 60, W0 + 140) },
    { p: 0.54, pos: V(0, 30, W0 + 190), look: V(0, 70, 190) },
    { p: 0.56, pos: V(0, 20, 60), look: V(0, 40, 190) },
    { p: 0.572, pos: V(0, 15, 115), look: V(0, 20, 165) },
    { p: 0.585, pos: V(0, 15, 117), look: V(0, 20, 165) },
  ];
  const tail = [
    { p: 0.94, pos: V(0, 10, TAIL.awards - 35), look: V(19, 16, TAIL.awards) },
    { p: 0.948, pos: V(0, 10, TAIL.awards - 30), look: V(19, 16, TAIL.awards) },
    { p: 0.988, pos: V(0, 14, TAIL.brief - 60), look: V(0, 20, TAIL.brief) },
    { p: 1.00, pos: V(0, 14, TAIL.brief - 52), look: V(0, 20, TAIL.brief) },
  ];
  // на остановке камера присаживается и чуть подаётся вперёд, между остановками летит по коридору маршрута
  const stops = r => WORLD.filter(w => w.r === r).flatMap(w => w.keys ? w.keys.map(([t, pos, look]) => ({ p: w.p + t * w.span, pos, look })) : [{ p: w.p - w.span * 0.2, pos: w.cam, look: w.look }, { p: w.p + w.span * 0.22, pos: w.cam.clone().add(V(0, 0, 3)), look: w.look }]);
  CAM.btl = [...head, { p: 0.596, pos: V(10, 13, 150), look: V(-4, 9, 230) }, ...stops('btl'), ...tail];
  CAM.atl = [...head, { p: 0.596, pos: V(0, 42, 150), look: V(-30, 66, 240) }, ...stops('atl'), { p: 0.93, pos: V(0, 40, TAIL.awards - 80), look: V(19, 16, TAIL.awards) }, ...tail];
  // камера летит по сплайну через ключи: без остановки на каждом, тормозит только там, где ключи стоят рядом
  for (const r of ['btl', 'atl']) {
    const k = CAM[r];
    k.pos = new THREE.CatmullRomCurve3(k.map(x => x.pos), false, 'centripetal');
    k.look = new THREE.CatmullRomCurve3(k.map(x => x.look), false, 'centripetal');
  }
  const sl = iskra.userData.slotScale;
  const narrow = innerWidth < 760, heroY = narrow ? 412 : 398, heroK = narrow ? 2.2 : 3.2;
  ISK = [
    { p: 0.00, pos: V(0, LOGO_Y + heroY - 400, W0 + 150), scale: sl * heroK, spin: 0 },
    { p: 0.05, pos: V(0, LOGO_Y + heroY - 400, W0 + 150), scale: sl * heroK, spin: 1.2 },
    { p: 0.19, pos: V(-14, LOGO_Y + 12, W0 + 70), scale: sl * 2.0, spin: 7 },
    { p: 0.31, pos: V(s.x, s.y + 6, s.z + 26), scale: sl * 1.2, spin: 11.6 },
    { p: 0.35, pos: s.clone(), scale: sl, spin: 4 * Math.PI },
    { p: 1.00, pos: s.clone(), scale: sl, spin: 4 * Math.PI },
  ];
}
function sample(keys, p, fn) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i], b = keys[i + 1], t = smooth(clamp01((p - a.p) / (b.p - a.p || 1)));
  return fn(a, b, t);
}

// ---------- рассказ о кейсе на каждой остановке ----------
// вместо навигации по кварталам: что за задача, что придумали, что получилось. «другие кейсы квартала» — в навигации
const MORE = {
  asia: { t: 'азиатские кейсы', ids: ['fandom', 'tbank', 'treschnutye', 'izhora'] },
  sport: { t: 'спортивные кейсы', ids: ['izhora', 'lion', 'ironstar', 'gdrive', 'baltika7', 'avangard'] },
  event: { t: 'другие ивент-кейсы', ids: ['baltikaPlant', 'megafon', 'mice', 'megafonTravel'] },
  merch: { t: 'другие кейсы с мерчем', ids: ['gdriveMerch', 'oxygenSet', 'lionMerch'] },
  dixy: { t: 'другие кейсы «дикси»', ids: ['treschnutye', 'zaklinateli', 'dino'] },
  ai: { t: 'другие ai-ролики', ids: ['aiFonbet', 'aiMango', 'aiLavka', 'aiAlfa', 'ai'] },
};
// рассказы строятся из таблицы мира: окно — отрезок остановки, сторона — напротив носителя в кадре
const STORIES = WORLD.map(w => [w.id, w.a, w.b, w.r, w.story, [ZONES[w.zone].more, ...(w.also || [])].filter(Boolean), w.orbit]);
STORIES.forEach(([id, a, b, r, side, more, orbitBtn]) => {
  const c = CASES[id], el = document.createElement('section'), w = WORLD.find(w => w.id === id);
  if (w.moment) {
    // у момента вместо окна — титр: заходит после пролёта камеры, всё остальное в «кейс целиком»
    const res = c.result.filter(x => x[0] !== '—')[0];
    el.className = 'ov left flex'; el.dataset.a = w.p - w.span * 0.12; el.dataset.b = b; el.dataset.f = 0.004; el.dataset.route = r;
    el.innerHTML = `<span class="t">${r === 'btl' ? '{04} btl' : '{05} atl'} · ${c.pass.клиент}</span><h2>${c.title}</h2><p class="idea">${c.idea}</p>
      ${res ? `<div class="hit"><b>${res[0]}</b><span class="t">${res[1]}</span></div>` : ''}<button class="btn" data-case="${id}">кейс целиком</button>`;
    return document.body.insertBefore(el, document.getElementById('orbitUi'));
  }
  el.className = `ov ${side} panel`; el.dataset.a = a; el.dataset.b = b; el.dataset.f = 0.005; el.dataset.route = r; el.style.maxWidth = '460px';
  const res = c.result.filter(x => x[0] !== '—').slice(0, 3);
  el.innerHTML = `<span class="t">${r === 'btl' ? '{04} btl' : '{05} atl'} · ${c.pass.клиент} · ${c.pass.год}${c.awards[0] ? ' · ' + c.awards[0] : ''}</span>
    <h2 style="font-size:40px;margin:8px 0 12px">${c.title}</h2>
    <p style="font-size:16px"><span class="t">задача</span> ${c.task}</p>
    <p style="font-size:16px;margin-top:6px"><span class="t">идея</span> ${c.idea}</p>
    ${c.steps ? `<div class="steps">${c.steps.slice(0, 4).map((x, n) => `<div><span class="t">{0${n + 1}}</span><span><b>${x[0]}</b> <span class="d">${x[1]}</span></span></div>`).join('')}</div>` : ''}
    ${res.length ? `<div class="nums" style="grid-template-columns:repeat(${res.length},1fr)">${res.map(x => `<div><b>${x[0]}</b><span class="t">${x[1]}</span></div>`).join('')}</div>` : ''}
    <button class="btn" data-case="${id}">кейс целиком</button>${orbitBtn ? ' <button class="btn ghost" id="openOrbit">покрутить в 3D ↻</button>' : ''}
    ${c.formats ? `<div class="chips">${c.formats.map(f => `<span>${f[0]}</span>`).join('')}</div>` : ''}
    ${(more || []).map(m => `<p class="t" style="margin-top:8px"><a href="#" data-more="${m}" style="color:inherit">${MORE[m].t} →</a></p>`).join('')}`;
  document.body.insertBefore(el, document.getElementById('orbitUi'));
});
MODALS.more = key => `<span class="t">{кейсы}</span><h1>${MORE[key].t.replace('другие ', '')}</h1><div class="list" style="max-width:720px">${MORE[key].ids.map(id => `<button data-case="${id}"><span>${CASES[id].title} · ${CASES[id].pass.клиент}</span><span class="t">${CASES[id].dir} · ${CASES[id].pass.год}</span></button>`).join('')}</div>`;

// ---------- HTML-слой ----------
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, r: el.dataset.route, f: +el.dataset.f || 0.012 }));
const STAGES = [[0, '{00} вход'], [0.1, '{01} искра'], [0.35, '{01} кислород'], [0.45, '{02} шоурил'], [0.53, '{03} перекрёсток'],
  ...Object.keys(ZONES).map(k => { const w = WORLD.find(w => w.zone === k); return [w.a, `${w.r === 'btl' ? '{04} btl' : '{05} atl'} · ${ZONES[k].t}`, w.r]; }), [0.93, '{06} награды'], [0.975, '{07} бриф']].sort((a, b) => a[0] - b[0]);
const hudPct = document.getElementById('hudPct'), hudStage = document.getElementById('hudStage');
function updateOverlay(p) {
  ovs.forEach(o => {
    const f = o.f, op = (o.r && o.r !== route) || (o.el.id === 'fork' && route) ? 0 : clamp01(Math.min(o.a === 0 ? 1 : (p - o.a) / f, (o.b - p) / f));
    o.el.style.opacity = op; o.el.classList.toggle('on', op > 0.5);
    o.el.style.translate = `0 ${(1 - op) * 18}px`;
  });
  hudPct.textContent = String(Math.round(p * 100)).padStart(3, '0');
  hudStage.textContent = STAGES.filter(s => p >= s[0] && (!s[2] || s[2] === route)).pop()[1];
  routeBtn.style.display = route ? '' : 'none'; routeBtn.textContent = `маршрут: ${route} · сменить ↺`;
  micro.classList.toggle('dim', ovs.some(o => o.el.classList.contains('right') && o.el.classList.contains('panel') && o.el.classList.contains('on')));
}
const modal = document.getElementById('modal'), modalBody = document.getElementById('modalBody');
const openModal = html => { modalBody.innerHTML = html; modal.classList.add('on'); modal.scrollTop = 0; };
const closeModal = () => modal.classList.remove('on');
document.getElementById('modalClose').addEventListener('click', closeModal);
const routeBtn = document.getElementById('routeBtn');
const WORD = { reel: 'фильм', cross: 'развилка', btl: 'btl', alley: 'азиатский квартал', sport: 'спорт', event: 'ивент', shops: 'мерч', dixy: 'дикси', ai: 'ai-продакшн', atl: 'atl', awards: 'награды', about: 'о нас', brief: 'бриф' };
const curtain = document.getElementById('curtain'), curtainWord = document.getElementById('curtainWord');
const goTo = key => {
  closeModal(); if (orbitOn) closeOrbit();
  if (key === 'btl' || key === 'atl') route = key;
  else if (key === 'cross') route = null;
  else if (GO[key] > FORK && !route) route = 'btl';
  const max = document.documentElement.scrollHeight - innerHeight, target = GO[key];
  if (Math.abs(target - pSm) < 0.12) return scrollTo({ top: target * max, behavior: 'smooth' });
  // далеко: не тащим камеру через весь город, а закрываем шторкой и переставляем
  curtainWord.textContent = WORD[key] || key; curtain.className = 'in';
  setTimeout(() => { scrollTo(0, target * max); pSm = target; curtain.className = 'out'; }, 380);
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-case],[data-modal],[data-brief],[data-more],#caseOrbit,#openOrbit');
  if (!el || el.disabled) return;
  e.preventDefault();
  if (el.id === 'openOrbit') return openOrbit();
  if (el.dataset.more) return openModal(MODALS.more(el.dataset.more));
  if (el.id === 'caseOrbit') { closeModal(); route = 'btl'; scrollTo(0, GO.alley * (document.documentElement.scrollHeight - innerHeight)); pSm = GO.alley; openOrbit(); return; }
  if (el.dataset.case) return openModal(renderCase(el.dataset.case));
  if (el.dataset.modal) return openModal(MODALS[el.dataset.modal]);
  if (el.dataset.brief) {   // бриф открывается с подставленным направлением или кейсом
    document.getElementById('briefDir').value = el.dataset.brief;
    const bc = document.getElementById('briefCase');
    if (el.dataset.briefCase) { bc.style.display = ''; bc.value = 'по мотивам кейса «' + el.dataset.briefCase + '»'; }
    return goTo('brief');
  }
  goTo(el.dataset.go);
});

// клик по экрану в 3D открывает кейс
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function hit(e) {
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const h = ray.intersectObjects(clickable, true)[0]; if (!h) return null;
  let o = h.object; while (o && !o.userData.case && !o.userData.modal && !o.userData.go) o = o.parent; return o;
}
canvas.addEventListener('click', e => { if (orbitOn) return; const o = hit(e); if (!o) return; if (o.userData.go) return goTo(o.userData.go); o.userData.case ? openModal(renderCase(o.userData.case)) : openModal(MODALS[o.userData.modal]); });
canvas.addEventListener('pointermove', e => { if (!orbitOn) canvas.style.cursor = hit(e) ? 'pointer' : ''; });

// ---------- 2D-слой: микротекст, простые формы по сетке, вайп заголовка ----------
const micro = document.getElementById('micro'), microL = document.getElementById('microL'), wipe = document.getElementById('wipe');
const sqs = [...document.querySelectorAll('.sq')];
const INDEX = [['{00}', 'вход', 0], ['{01}', 'искра', 0.1], ['{02}', 'фильм', 0.45], ['{03}', 'развилка', 0.53],
  ...WORLD.map(w => [w.r === 'btl' ? '{04}' : '{05}', w.nav, w.p, w.r]), ['{06}', 'награды', 0.93], ['{07}', 'бриф', 0.975]];
// пункт навигации кликабелен: прыжок к остановке, маршрут подставляется сам
const jumpTo = (p, r) => {
  closeModal(); if (orbitOn) closeOrbit(); if (r) route = r; else if (p > FORK && !route) route = 'btl';
  const max = document.documentElement.scrollHeight - innerHeight, t = p;
  if (Math.abs(t - pSm) < 0.08) return scrollTo({ top: t * max, behavior: 'smooth' });
  curtainWord.textContent = WORD_OF(p); curtain.className = 'in';
  setTimeout(() => { scrollTo(0, t * max); pSm = t; curtain.className = 'out'; }, 380);
};
const WORD_OF = p => (INDEX.filter(s => Math.abs(s[2] - p) < 1e-6)[0] || [, ''])[1];
micro.addEventListener('click', e => { const d = e.target.closest('[data-j]'); if (!d) return; e.preventDefault(); jumpTo(+d.dataset.j, d.dataset.r || null); });
let lastStage = '', sqT = 0, frameN = 0;
function hud2d(p, time) {
  frameN++;
  const cur = INDEX.filter(s => p >= s[2] && (!s[3] || s[3] === route)).pop();
  const stop = route && p > FORK && p < 0.93 ? WORLD.filter(w => w.r === route && p >= w.a).pop() : null, moreKey = stop && ZONES[stop.zone].more;
  const html = INDEX.filter(s => !s[3] || !route || s[3] === route).map(s => `<div class="${s === cur ? 'on' : ''}" data-j="${s[2]}"${s[3] ? ` data-r="${s[3]}"` : ''}>${s[0]} ${s[1]}${s === cur ? ' ←' : ''}</div>`).join('') + (moreKey ? `<div style="margin-top:8px;pointer-events:auto"><a href="#" data-more="${moreKey}" style="color:var(--cream)">${MORE[moreKey].t} →</a></div>` : '');
  if (html !== micro._h) { micro.innerHTML = html; micro._h = html; }
  if (frameN % 6 === 0) microL.innerHTML = `cam ${camera.position.x.toFixed(1)} · ${camera.position.y.toFixed(1)} · ${camera.position.z.toFixed(1)}<br>fov ${camera.fov} · f ${String(frameN).padStart(6, '0')}<br>маршрут ${route || '—'} · p ${p.toFixed(3)}`;
  if (time - sqT > 1.1) {   // квадраты перескакивают по узлам сетки
    sqT = time; const cell = innerWidth / 12;
    sqs.forEach((q, i) => { q.style.left = (Math.round(Math.random() * 12) * cell - 3) + 'px'; q.style.top = (Math.round(Math.random() * innerHeight / cell) * cell - 3) + 'px'; });
  }
  if (cur && cur[1] !== lastStage) {
    if (lastStage && p < 0.59) { wipe.textContent = cur[1] + ' ' + cur[0]; wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go'); }
    lastStage = cur[1];
  }
}

// ---------- режим «покрутить зону» ----------
let orbit = null, orbitOn = false, savedScroll = 0;
function openOrbit() {
  savedScroll = scrollY; orbitOn = true; document.body.classList.add('orbit');
  const c = new THREE.Vector3(); diorama.localToWorld(c.set(0, 6, 0));
  orbit = new OrbitControls(camera, canvas); orbit.target.copy(c); orbit.enableDamping = true;
  orbit.minDistance = 18; orbit.maxDistance = 80; orbit.maxPolarAngle = Math.PI * 0.48;
  camera.position.set(c.x + 30, c.y + 18, c.z + 34); orbit.update();
}
function closeOrbit() {
  orbitOn = false; orbit.dispose(); orbit = null; document.body.classList.remove('orbit');
  requestAnimationFrame(() => scrollTo(0, savedScroll));
}
document.getElementById('closeOrbit').addEventListener('click', closeOrbit);

// ---------- временные обзорные виды на кварталы: камера отдельно от скролла, крутится мышью ----------
const VIEWS = Object.fromEntries(Object.keys(ZONES).map(k => { const [z0, z1] = ZR[k], air = !!ZONES[k].over;
  return [k, { t: V(air ? -10 : -8, air ? 62 : 8, (z0 + z1) / 2), p: V(30, air ? 140 : 70, z0 - 110) }]; }));
let viewKey = null; const viewInfo = document.getElementById('viewInfo');
function openView(key) {
  if (orbitOn && !viewKey) closeOrbit();
  if (!viewKey) savedScroll = scrollY;
  viewKey = key; orbitOn = true; document.body.classList.add('qview');
  orbit?.dispose(); orbit = new OrbitControls(camera, canvas); orbit.enableDamping = true;
  orbit.minDistance = 10; orbit.maxDistance = 260; orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.copy(VIEWS[key].t); camera.position.copy(VIEWS[key].p); orbit.update();
  document.querySelectorAll('#views [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === key));
  const grp = { t: ZONES[key].t, ids: WORLD.filter(w => w.zone === key).map(w => w.id) };
  viewInfo.innerHTML = `<span class="t">{обзор} · ${grp.t.replace('другие ', '')}</span>${grp.ids.map(id => `<button data-case="${id}"><b>${CASES[id].title}</b><span class="t">${CASES[id].pass.клиент} · ${CASES[id].pass.год}</span><span class="d">${CASES[id].task}</span></button>`).join('')}`; viewInfo.style.display = 'block';
}
function closeView() {
  if (!viewKey) return; viewKey = null; viewInfo.style.display = 'none'; orbitOn = false; orbit.dispose(); orbit = null; document.body.classList.remove('qview');
  document.querySelectorAll('#views [data-view]').forEach(b => b.classList.remove('on'));
  requestAnimationFrame(() => scrollTo(0, savedScroll));
}
document.getElementById('views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; b.dataset.view === 'off' ? closeView() : openView(b.dataset.view); });

const ISK_RED = new THREE.Color(RED), ISK_BLACK = new THREE.Color(0x0d0d0f), LOGO_DARK = new THREE.Color(0x1a0707);
// ---------- цикл ----------
let pSm = 0, mouse = new THREE.Vector2(), mouseSm = new THREE.Vector2();
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5));
const clock = new THREE.Clock(), look = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const max = document.documentElement.scrollHeight - innerHeight;
  let p = max > 0 ? clamp01(scrollY / max) : 0;
  // развилка: пока направление не выбрано, дальше перекрёстка не листается
  if (!route && !orbitOn && p > FORK) { scrollTo(0, FORK * max); p = FORK; const f = document.getElementById('fork'); if (!f.classList.contains('pulse')) { f.classList.add('pulse'); setTimeout(() => f.classList.remove('pulse'), 1100); } }
  pSm += (p - pSm) * (1 - Math.exp(-dt * 2.6));   // инерция скролла

  if (orbitOn) { orbit.update(); }
  else {
    const k = CAM[route || 'btl'];
    let i = 0; while (i < k.length - 2 && pSm > k[i + 1].p) i++;
    const u = (i + clamp01((pSm - k[i].p) / (k[i + 1].p - k[i].p))) / (k.length - 1);
    k.pos.getPoint(u, camera.position); k.look.getPoint(u, look);
    mouseSm.lerp(mouse, Math.min(1, dt * 3));
    camera.position.x += mouseSm.x * 4; camera.position.y -= mouseSm.y * 2.5;
    camera.lookAt(look);
  }
  // Искра: вращается только она, к посадке разворачивается лицом и замирает
  sample(ISK, pSm, (a, b, t) => {
    iskra.position.lerpVectors(a.pos, b.pos, t);
    iskra.scale.setScalar(a.scale + (b.scale - a.scale) * t);
    iskra.rotation.set(0, 0, a.spin + (b.spin - a.spin) * t);
  });
  const landed = clamp01((pSm - 0.345) / 0.03);
  if (pSm < 0.05) iskra.rotation.y = Math.sin(time * 0.8) * 0.5;
  else iskra.rotation.y = (1 - landed) * Math.sin(time * 2) * 0.6;
  iskra.position.y += (1 - landed) * Math.sin(time * 1.4) * 1.2;
  iskra.userData.key.position.copy(iskra.position).add(new THREE.Vector3(0, 0, 5));
  iskra.userData.key.intensity = 240 * (1 - landed) * (0.92 + 0.08 * Math.sin(time * 13));   // живое мерцание огня
  const L = clamp01((pSm - 0.345) / 0.09);   // свет мегаструктуры включается после посадки Искры

  // неон загорается с миганием, вентиляторы раздувают
  // после посадки свечение Искры гаснет до уровня логотипа: она становится его частью
  iskra.material.emissiveIntensity = 0.4 * (1 - landed);
  logo.mat.emissiveIntensity = landed * 1.1;
  logo.mat.color.copy(LOGO_DARK).lerp(ISK_RED, landed); logo.mat.roughness = 0.75 - 0.55 * landed; logo.mat.clearcoat = 0.15 + 0.85 * landed;
  iskra.material.color.copy(ISK_RED).lerp(ISK_BLACK, landed);
  logo.glow.intensity = 300 * landed;
  if (promo.rim) promo.rim.visible = L > 0.4;   // рамка шоурила загорается вместе со светом, не раньше

  updateWebtoon(time);
  updateWorld(time);
  updateMega(time, L);
  if (promo.v && !promo.started && pSm > 0.3) { promo.started = true; promo.v.play().catch(() => addEventListener('pointerdown', () => promo.v.play(), { once: true })); }
  hud2d(pSm, time);
  updateOverlay(pSm);
  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- старт ----------
history.scrollRestoration = 'manual'; scrollTo(0, 0);
await Promise.all([document.fonts.load('520 100px TT'), document.fonts.load('20px AP')]);
await buildLogo(); buildSections(); buildMega(); buildTimeline();
window.__three = { renderer, scene, CAM, THREE, WORLD, checkPath, go: (p, r) => { route = r; scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)); pSm = p; } };   // для отладки
if (location.search.includes('dev')) checkPath();   // для отладки производительности
// ?at=lion:-0.3 — сразу встать на остановку кейса (для скриншотов)
const AT = new URLSearchParams(location.search).get('at');
if (AT) { const [id, t] = AT.split(':'), w = WORLD.find(w => w.id === id); window.__three.go(w.p + w.span * (+t || 0), w.r); }
frame();
// прелоадер — та же Искра: пока грузятся модели и текстуры, она висит в темноте; скролл открывается, когда загружено всё
await new Promise(res => { const t0 = performance.now(); let calm = 0;
  const tick = () => { const done = LOAD.total === LOAD.loaded; calm = done ? calm + 1 : 0; if (calm > 3 || performance.now() - t0 > 30000) return res(); setTimeout(tick, 150); }; tick(); });
document.getElementById('loader').classList.add('done'); document.documentElement.classList.remove('lock');
