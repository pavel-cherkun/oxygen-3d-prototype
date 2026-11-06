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

// ---------- рендер ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a1f2e, 0.0026);
scene.background = skyTexture();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2500);

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
scene.add(new THREE.HemisphereLight(0x8a5060, 0x1a0a0c, 0.95));
const moon = new THREE.DirectionalLight(0x8090c0, 0.7); moon.position.set(-200, 400, 300); scene.add(moon);

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

const texLoader = new THREE.TextureLoader();
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
    const tex = windowsTexture(100 + i, share); tex.repeat.set(2, 3);
    return new THREE.MeshStandardMaterial({ color: 0x3a3b42, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.9, metalness: 0.05 });
  });
  const cells = [];
  for (let x = -330; x <= 330; x += 26) for (let z = -330; z <= 1060; z += 26) {
    if (Math.abs(x) < 20 && z > -20) continue;               // улица
    if (Math.abs(x) < 62 && Math.abs(z) < 42) continue;      // площадь у башни
    if (Math.abs(z - 150) < 15) continue;                    // перекрёсток
    if (Math.abs(x) < 40 && z > 165 && z < 716) continue;    // кварталы: тротуары шире под зоны
    if (x < -22 && x > -80 && z > 198 && z < 432) continue;   // три башни дикси
    if (Math.abs(x) > 22 && Math.abs(x) < 70 && AI_TOWERS.some(([, , sd, zz]) => Math.sign(x) === sd && Math.abs(z - zz) < 22)) continue; // башни ai
    if (Math.abs(x) < 20 && z > 930) continue;               // торец проспекта под бриф
    if (Math.abs(x) > 22 && Math.abs(x) < 80 && ATL_SCREENS.some(([, sd, zz]) => Math.sign(x) === sd && Math.abs(z - zz) < 28)) continue; // небоскрёбы atl
    if (rand() < 0.12) continue;
    const dist = Math.hypot(x, z * 0.8), near = Math.abs(x) < 50 && z > 0;
    const h = near ? 30 + rand() * 70 : 25 + rand() * (60 + Math.min(dist, 380) * 0.35);
    cells.push({ x: x + (rand() - .5) * 4, z: z + (rand() - .5) * 4, w: 14 + rand() * 8, d: 14 + rand() * 8, h, m: (rand() * 4) | 0 });
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
  cells.filter(c => Math.abs(c.x) < 60 && c.z > -10 && c.z < 920).forEach((c, i) => {
    if (rand() < 0.45) return;
    const tw = 7 + rand() * 6, th = tw * (rand() < .5 ? 0.62 : 1.6);
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
  for (let i = 0; i < 50; i++) {
    const c = cells[(rand() * cells.length) | 0]; if (Math.abs(c.x) > 120) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6 + rand() * 18, 0.6), neonMat);
    m.position.set(c.x + c.w / 2 * (rand() < .5 ? 1 : -1), 8 + rand() * c.h * 0.7, c.z + c.d / 2);
    scene.add(m);
  }
  // мокрая улица
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.04 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground); CITY.ground = ground;
  for (let z = 50; z < 930; z += 12) {
    if (z > 292 && z < 712) continue;   // в спортивном квартале — беговые дорожки
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: 0x3a3a44 }));
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
  }
  [80, 760, 830, 900].forEach((z, i) => {
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
  logo.mat = new THREE.MeshPhysicalMaterial({ color: 0x1a0707, emissive: RED, emissiveIntensity: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, logo.mat);
  logo.group = new THREE.Group(); logo.group.add(mesh);
  logo.group.scale.set(S, -S, S);
  logo.group.position.set(0, TOWER.h - 22, TOWER.d / 2 + 0.6);
  scene.add(logo.group);
  // подложка, чтобы неон читался
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(TOWER.w - 2, 30), new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.9 }));
  plate.position.set(0, TOWER.h - 22, TOWER.d / 2 + 0.3); scene.add(plate);

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
  const key = new THREE.PointLight(0xffe0d0, 260, 0, 1.2); scene.add(key); iskra.userData.key = key;
  logo.group.updateMatrixWorld(true);
  slotWorld.set(icx - cx, icy - cy, depth / 2).applyMatrix4(logo.group.matrixWorld);
  const glow = new THREE.PointLight(0xffe8dc, 0, 260, 1.2); glow.position.copy(slotWorld).add(new THREE.Vector3(0, -14, 120)); scene.add(glow); logo.glow = glow;
}

// ---------- разделы на улице ----------
// проспект (z растёт от башни): площадь с шоурилом → перекрёсток btl/atl → btl на земле → atl «в эфире» на небоскрёбах → награды → о нас → бриф
const BTL_Z = 215;
const diorama = new THREE.Group();
const clickable = [];
const ATL_SCREENS = [['izhora', 1, 282], ['derbent', 1, 500], ['tevredens', -1, 545]];
// носители: плоский экран и красная рамка вокруг него
const board = (tex, w, h, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.copy(pos); m.rotation.y = ry; scene.add(m); return m; };
const rim = (w, h, pos, ry) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.6, h + 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2.5), toneMapped: false })); g.position.copy(pos); g.rotation.y = ry; g.translateZ(-0.05); scene.add(g); };
function buildSections() {

  // площадь: экран шоурила
  const video = Object.assign(document.createElement('video'), { src: 'assets/oxygen_promo_v2.mp4', muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: 'anonymous' });
  video.play().catch(() => addEventListener('pointerdown', () => video.play(), { once: true }));
  const vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
  const reelPos = V(0, 30, TOWER.d / 2 + 0.8);
  rim(64, 36, reelPos, 0);
  const reel = board(vtex, 64, 36, reelPos, 0); reel.position.z += 0.1; reel.userData.modal = 'reel'; clickable.push(reel);

  // перекрёсток: развилка
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 1.4), MAT.chrome); gantry.position.set(0, 27, 150); scene.add(gantry);
  [-22, 22].forEach(x => { const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 27, 1.2), gantry.material); post.position.set(x, 13.5, 150); scene.add(post); });

  // btl: бренд-зона ozon
  const floor = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5, metalness: 0.4 }));
  floor.position.y = 0.6; diorama.add(floor);
  const wall = (url, w, h, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: caseTexture(url, false), emissiveMap: caseTexture(url, false), emissive: 0xffffff, emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 0.7 }));
    m.position.set(x, h / 2 + 1.2, z); m.rotation.y = ry; diorama.add(m);
  };
  wall('assets/cases/ozon-fandom-real-2.jpg', 36, 15, 0, -12, 0);
  wall('assets/cases/ozon-fandom-kv-1.jpg', 24, 15, -18, 0, Math.PI / 2);
  const spot = new THREE.SpotLight(0xffffff, 3000, 80, 0.7, 0.5); spot.position.set(10, 30, 20); spot.target = floor; diorama.add(spot);
  const zl = new THREE.PointLight(0xffe8dc, 420, 45, 2); zl.position.set(10, 16, 6); diorama.add(zl); diorama.userData.case = 'fandom'; scene.add(diorama); clickable.push(diorama);
  // если рядом лежит модель зоны (glb), она заменяет коллаж из кадров
  gltfLoader.loadAsync('assets/models/ozon-corp.min.glb').then(gltf => {
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0; } });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(26 / Math.max(size.x, size.z));
    box.setFromObject(model); const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, 1.2 - box.min.y, -c.z);
    diorama.children.forEach(ch => { if (ch !== floor && !ch.isLight) ch.visible = false; });
    diorama.add(model);
  }).catch(() => {});

  buildQuarters();

  // atl: эфир над городом — экраны на кронштейнах у небоскрёбов, развёрнуты к камере
  const tmat = new THREE.MeshStandardMaterial({ color: 0x6a6c78, map: windowsTexture(55, 0.06), emissiveMap: windowsTexture(55, 0.06), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.7 });
  tmat.map.repeat.set(2, 4); tmat.emissiveMap.repeat.set(2, 4);
  ATL_SCREENS.forEach(([id, side, z]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(44, 150, 34), tmat); t.position.set(side * 54, 75, z); scene.add(t);
    const cam = atlCam(side, z), pos = V(side * 20, 95, z);
    [113, 77].forEach(y => { const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 0.9, 0.9), MAT.graphite); arm.position.set(side * 26, y, z); scene.add(arm); });
    if (id === 'izhora') {
      // ижора — вертикальный вебтун: семь полотен по порядку, лента листается от панели к панели
      const { m } = screenAt(null, 20, 34.6, pos, cam, id); webtoonInto(m.material, 20 / 34.6);
      tagAt(CASES[id].title, 'вебтун · 100 лет «зениту»', V(side * 20, 116, z), cam, 20); return;
    }
    const src = `assets/cases/${CASES[id].how[0][0].split('/').pop()}`;
    if (id === 'tevredens') {   // у tevredens на экране ролик из кейса
      const v = Object.assign(document.createElement('video'), { src: 'assets/tevredens.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
      const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace;
      const { g } = screenAt(vt, 28, 15.75, pos, cam, id); aiClips.push({ g, v, y: g.position.y, ph: 0, still: true });
    } else screenAt(caseTexture(src, false, 1024, 614), 28, 16.8, pos, cam, id);
    tagAt(CASES[id].title, CASES[id].pass.клиент, V(side * 20, 107.5, z), cam, 22);
  });
  buildDixyTowers(); buildAiTowers();

  // награды
  board(textTexture(['16', 'металл: gold · silver · bronze'], { label: '{06} · награды', accent: 0 }), 44, 22, V(19.5, 18, 780), -Math.PI / 2);

  // бриф
  board(textTexture(['бриф', 'ответим за рабочий день'], { label: '{08} · oxygen', bg: '#F40709', color: '#111111', accent: -1 }), 50, 25, V(0, 22, 940), Math.PI);
}

// витрина квартала мерча: подиум, рамка из глянца, стеклянный короб, лайтбокс с кадром кейса на задней стенке, внутри — предмет
const MERCH = [['selekt', 'ozon-select-1', 1, 622, 'ring'], ['gdriveMerch', 'gdrive-capsule-1', -1, 648, 'tees'], ['oxygenSet', 'oxygen-set-1', 1, 674, 'boxes'], ['lionMerch', '../dp/lion-cover', -1, 700, 'lion']];
const vtCam = (side, z) => V(-side * 2, 11, z - 30);
function vitrine(id, img, side, z, prop) {
  const g = new THREE.Group(); g.position.set(side * 13, 0, z); aim(g, vtCam(side, z)); scene.add(g);
  const add = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); g.add(o); return o; };
  add(new THREE.BoxGeometry(15, 1.2, 10), MAT.graphite, 0, 0.6, 0);
  [[-7, -4.6], [7, -4.6], [-7, 4.6], [7, 4.6]].forEach(([x, zz]) => add(new THREE.CylinderGeometry(0.22, 0.22, 13, 16), MAT.chrome, x, 7.7, zz));
  add(new THREE.BoxGeometry(15.4, 1.4, 10.2), MAT.matte, 0, 14.7, 0);
  add(new THREE.BoxGeometry(14, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8b0).multiplyScalar(1.3), toneMapped: false }), 0, 13.9, 4.5);
  add(new THREE.BoxGeometry(14.4, 11.6, 0.6), MAT.matte, 0, 7.6, -4.9);
  const pic = add(new THREE.PlaneGeometry(13, 8.1), new THREE.MeshBasicMaterial({ map: caseTexture(`assets/cases/${img}.jpg`, false, 1024, 640) }), 0, 8.4, -4.55); pic.material.color.setScalar(0.8);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, clearcoat: 1, depthWrite: false });
  add(new THREE.BoxGeometry(14, 12.4, 0.1), glass, 0, 7.4, 4.6); [-7, 7].forEach(x => add(new THREE.BoxGeometry(0.1, 12.4, 9.2), glass, x, 7.4, 0));
  const c = CASES[id]; const lab = add(new THREE.PlaneGeometry(13, 2.03), new THREE.MeshBasicMaterial({ map: labelTex(c.title, c.pass.клиент) }), 0, 16.6, 0.2);
  const p = new THREE.Group(); p.position.set(0, 1.2, 0.5); g.add(p);
  if (prop === 'ring') {   // кольцевой свет и модули стены
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe8f0).multiplyScalar(1.3), toneMapped: false })); ring.position.y = 5.4; p.add(ring);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), MAT.graphite); st.position.y = 1.5; p.add(st);
    [[-4.4, 0], [4.4, 0], [-4.4, 2.6], [4.4, 2.6]].forEach(([x, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1), y ? MAT.graphite : MAT.glassO); b.position.set(x, 1.3 + y, -1.5); p.add(b); });
  } else if (prop === 'tees') {   // рейл с футболками капсулы
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 10), MAT.chrome); rail.rotation.z = Math.PI / 2; rail.position.y = 8.2; p.add(rail);
    const tee = teeGeometry(); [MAT.matte, new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.8 }), MAT.graphite].forEach((m, i) => { const t = new THREE.Mesh(tee, m); t.scale.setScalar(1.35); t.position.set(-3 + i * 3, 3.3, i * 0.2); p.add(t); swing.push({ o: t, k: 'tee', ph: i }); });
  } else if (prop === 'boxes') {   // набор «100% креатора»
    [[MAT.gloss, 5, 2.4, 4, 0, 1.2], [MAT.matte, 4, 1.6, 3.4, 0.2, 3.2], [MAT.glassO, 2.6, 1.4, 2.4, -0.3, 4.7]].forEach(([m, w, h, d, x, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, 0); b.rotation.y = x * 0.6; p.add(b); });
    spinners.push({ o: p.children[2], k: 0.4 });
  } else {   // мерч льва: худи цвета гривы и панама
    const t = new THREE.Mesh(teeGeometry(), new THREE.MeshStandardMaterial({ color: 0x1f4fd8, roughness: 0.9 })); t.scale.setScalar(1.5); t.position.set(-1.8, 2.4, 0); p.add(t);
    const hat = new THREE.Group(); const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1, 24), new THREE.MeshStandardMaterial({ color: 0x8fb3ff, roughness: 0.9 })); hat.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 32), crown.material); brim.position.y = -0.45; hat.add(brim); hat.position.set(3.4, 1.2, 0.8); p.add(hat);
  }
  g.userData.case = id; clickable.push(g);
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
function stand(id, imgs, z, { x = 0, big = 1 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; scene.add(g);   // лицом к камере, которая едет по +z
  const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
  const HW = 17 * big, HH = HW / 1.6, rest = imgs.slice(1), tw = 7.4 * big, th = tw / 1.6, gap = 0.8;
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
  return g;
}
// shelby: минимальный фастбэк по рефу 1 — чёрный кузов-плита, двойные красные полосы, тёмное стекло
function muscleCar(body = MAT.matte, stripe = MAT.gloss) {
  const car = new THREE.Group(), s = new THREE.Shape();
  s.moveTo(-2.4, 0.35); s.lineTo(2.45, 0.35); s.lineTo(2.5, 0.8); s.lineTo(2.2, 0.95); s.lineTo(0.75, 1.02); s.lineTo(0.05, 1.42); s.lineTo(-0.9, 1.42); s.lineTo(-2.2, 1.0); s.lineTo(-2.45, 0.95); s.lineTo(-2.45, 0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }); geo.translate(0, 0, -0.92);
  car.add(new THREE.Mesh(geo, body));
  const ws = new THREE.Shape(); ws.moveTo(0.62, 1.05); ws.lineTo(0.03, 1.37); ws.lineTo(-0.86, 1.37); ws.lineTo(-1.95, 1.04); ws.lineTo(0.62, 1.05);
  const wg = new THREE.ExtrudeGeometry(ws, { depth: 1.98, bevelEnabled: false }); wg.translate(0, 0, -0.99);
  car.add(new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.05, metalness: 0.3, clearcoat: 1 })));
  [-0.22, 0.22].forEach(z => [[1.5, 1.0, 1.5, -0.05], [-0.42, 1.44, 0.95, 0], [-1.55, 1.22, 1.37, 0.31]].forEach(([x, y, l, r]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(l, 0.03, 0.22), stripe); b.position.set(x, y, z); b.rotation.z = r; car.add(b); }));
  const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 24); tire.rotateX(Math.PI / 2); const rimG = new THREE.CylinderGeometry(0.25, 0.25, 0.34, 16); rimG.rotateX(Math.PI / 2);
  [[1.55, 0.86], [1.55, -0.86], [-1.55, 0.86], [-1.55, -0.86]].forEach(([x, z]) => { const t = new THREE.Mesh(tire, MAT.matte); t.position.set(x, 0.42, z); car.add(t); const r = new THREE.Mesh(rimG, MAT.chrome); r.position.copy(t.position); car.add(r); });
  const hl = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0b8).multiplyScalar(0.9), toneMapped: false }), tl = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2), toneMapped: false });
  [-0.62, 0.62].forEach(z => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.36), hl); h.position.set(2.52, 0.74, z); car.add(h); });
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 1.5), tl); t.position.set(-2.48, 0.82, 0); car.add(t);
  return car;
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
function brandedMustang() {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xff5f0a, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 });
  const s = new THREE.Shape();   // профиль кабриолета: линия борта без крыши
  s.moveTo(-2.4, 0.35); s.lineTo(2.45, 0.35); s.lineTo(2.5, 0.8); s.lineTo(2.2, 0.95); s.lineTo(0.75, 1.03); s.lineTo(-2.05, 1.06); s.lineTo(-2.45, 0.95); s.lineTo(-2.45, 0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }); geo.translate(0, 0, -0.92);
  car.add(new THREE.Mesh(geo, paint));
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); car.add(o); return o; };
  // салон: чёрные кресла
  const seat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
  [[0.05, 0.42], [0.05, -0.42], [-1.05, 0.4], [-1.05, -0.4]].forEach(([x, z]) => { add(new THREE.BoxGeometry(0.5, 0.12, 0.62), seat, x, 1.08, z); add(new THREE.BoxGeometry(0.14, 0.62, 0.6), seat, x - 0.3, 1.36, z, 0, 0, 0.18); });
  // лобовое: тёмное стекло и белая полоса с g-drive
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.05, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.85 });
  const ws = add(new THREE.PlaneGeometry(0.62, 1.78), glassM, 0.52, 1.28, 0, 0, Math.PI / 2, 0); ws.rotation.set(0, Math.PI / 2, 0); ws.rotateX(-0.85);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 0.16), new THREE.MeshBasicMaterial({ map: decalTex(512, 46, (g, w, h) => { g.fillStyle = '#f2efe9'; g.fillRect(0, 0, w, h); gdrive(g, 170, 38, 36, '#ff5f0a'); }) }));
  band.position.set(0.31, 1.52, 0); band.rotation.set(0, Math.PI / 2, 0); band.rotateX(-0.85); car.add(band);
  // наклейки по бортам: на двери «g | iron star», на крыле iron star, сзади g-drive
  const door = decalTex(512, 220, (g) => { g.fillStyle = '#fff'; g.font = 'italic 800 150px TT, sans-serif'; g.fillText('G', 40, 150); gdrive(g, 30, 200, 34); g.fillRect(218, 40, 5, 160); ironstar(g, 245, 120, 78); });
  const fender = decalTex(512, 110, (g) => ironstar(g, 20, 86, 74));
  const rear = decalTex(512, 90, (g) => gdrive(g, 20, 70, 66));
  const dm = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  [1, -1].forEach(sd => {
    const ry = sd > 0 ? 0 : Math.PI, z = sd * 0.995;
    add(new THREE.PlaneGeometry(1.3, 0.56), dm(door), 0.05, 0.64, z, 0, ry);
    add(new THREE.PlaneGeometry(0.95, 0.2), dm(fender), 1.62, 0.84, z, 0, ry);
    add(new THREE.PlaneGeometry(0.9, 0.16), dm(rear), -1.75, 0.86, z, 0, ry);
  });
  [-0.5, 0.5].forEach(z => add(new THREE.PlaneGeometry(0.62, 0.11), dm(rear), -2.515, 0.62, z, 0, -Math.PI / 2));
  add(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: decalTex(256, 80, (g) => { g.fillStyle = '#16171b'; g.fillRect(0, 0, 256, 80); ironstar(g, 26, 56, 40, '#f2c200'); }) }), -2.515, 0.6, 0, 0, -Math.PI / 2);
  // капот: крупная белая «g»-графика, как на машине кейса
  add(new THREE.PlaneGeometry(1.3, 1.2), dm(decalTex(256, 256, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(20, 40); g.lineTo(236, 40); g.lineTo(200, 110); g.lineTo(120, 110); g.lineTo(150, 170); g.lineTo(236, 170); g.lineTo(200, 230); g.lineTo(20, 230); g.closePath(); g.fill(); })), 1.55, 1.005, 0, -Math.PI / 2, 0, Math.PI / 2);
  // табло со временем гонки над задними сиденьями
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; ledTimer.c = c; ledTimer.g = c.getContext('2d');
  ledTimer.t = new THREE.CanvasTexture(c); ledTimer.t.colorSpace = THREE.SRGBColorSpace; drawTimer(3738);
  add(new THREE.BoxGeometry(0.08, 0.36, 1.4), MAT.matte, -1.5, 1.95, 0);
  add(new THREE.PlaneGeometry(1.36, 0.32), new THREE.MeshBasicMaterial({ map: ledTimer.t, toneMapped: false }), -1.545, 1.95, 0, 0, -Math.PI / 2);
  [-0.5, 0.5].forEach(z => add(new THREE.BoxGeometry(0.05, 0.75, 0.05), MAT.matte, -1.5, 1.42, z));
  // колёса, фары, фонари
  const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 24); tire.rotateX(Math.PI / 2); const rimG = new THREE.CylinderGeometry(0.27, 0.27, 0.34, 16); rimG.rotateX(Math.PI / 2);
  [[1.55, 0.86], [1.55, -0.86], [-1.55, 0.86], [-1.55, -0.86]].forEach(([x, z]) => { add(tire, MAT.matte, x, 0.42, z); add(rimG, MAT.chrome, x, 0.42, z); });
  const hl = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0b8).multiplyScalar(0.9), toneMapped: false }), tl = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.8), toneMapped: false });
  [-0.62, 0.62].forEach(z => add(new THREE.BoxGeometry(0.06, 0.12, 0.36), hl, 2.52, 0.76, z));
  [-0.6, -0.48, -0.36, 0.36, 0.48, 0.6].forEach(z => add(new THREE.BoxGeometry(0.05, 0.16, 0.06), tl, -2.49, 0.84, z));
  add(new THREE.BoxGeometry(0.06, 0.2, 2.0), MAT.matte, -2.47, 0.45, 0);   // диффузор
  return car;
}
function drawTimer(sec) {
  const g = ledTimer.g, w = 512, h = 128; g.fillStyle = '#1a0606'; g.fillRect(0, 0, w, h);
  const txt = `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  g.font = '700 104px AP, monospace'; g.fillStyle = '#ff3a1a'; g.textAlign = 'center'; g.fillText(txt, w / 2, 102);
  g.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);   // точки светодиодной матрицы
  ledTimer.t && (ledTimer.t.needsUpdate = true);
}
// chery tiggo 8 пресс-кара «шёлкового пути»: тёмно-синий кузов, оранжевый капот с g-drive, надписи на дверях, раллийный номер
const tiggoTex = {};
function tiggo(n = 13) {
  const car = new THREE.Group(), add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); car.add(o); return o; };
  const paint = tiggoTex.paint ||= new THREE.MeshPhysicalMaterial({ color: 0x141a2a, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 });
  const orange = tiggoTex.orange ||= new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.6 });
  const s = new THREE.Shape();
  s.moveTo(-2.35, 0.35); s.lineTo(2.35, 0.35); s.lineTo(2.42, 0.85); s.lineTo(2.12, 1.06); s.lineTo(1.0, 1.16); s.lineTo(0.36, 1.68); s.lineTo(-1.9, 1.73); s.lineTo(-2.3, 1.46); s.lineTo(-2.38, 0.9); s.lineTo(-2.35, 0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }); geo.translate(0, 0, -0.93);
  car.add(new THREE.Mesh(geo, paint));
  const w = new THREE.Shape(); w.moveTo(0.95, 1.19); w.lineTo(0.39, 1.63); w.lineTo(-1.86, 1.67); w.lineTo(-2.23, 1.42); w.lineTo(-2.2, 1.2); w.lineTo(0.95, 1.19);
  const wg = new THREE.ExtrudeGeometry(w, { depth: 2.0, bevelEnabled: false }); wg.translate(0, 0, -1.0);
  car.add(new THREE.Mesh(wg, tiggoTex.glass ||= new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.05, metalness: 0.3, clearcoat: 1 })));
  // оранжевый капот с белой надписью
  tiggoTex.hood ||= decalTex(512, 400, (g, W, H) => { g.fillStyle = '#ff6a10'; g.fillRect(0, 0, W, H); g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 2); gdrive(g, -150, 30, 78); g.restore(); });
  add(new THREE.BoxGeometry(1.16, 0.03, 1.9), [orange, orange, new THREE.MeshStandardMaterial({ map: tiggoTex.hood, roughness: 0.6 }), orange, orange, orange], 1.56, 1.19, 0, 0, 0, -0.09);
  // борта: g-drive на передней двери, раллийная табличка на задней, оранжевая полоса по низу
  tiggoTex.door ||= decalTex(512, 120, (g) => gdrive(g, 20, 92, 92, '#ff6a10'));
  tiggoTex.plate ||= decalTex(200, 240, (g) => { g.fillStyle = '#f2efe9'; g.fillRect(0, 0, 200, 240); g.fillStyle = '#ff6a10'; g.fillRect(0, 0, 200, 46); g.fillStyle = '#111'; g.font = '800 92px TT, sans-serif'; g.textAlign = 'center'; g.fillText(String(n), 100, 160); g.font = '22px AP, monospace'; g.fillText('MEDIA', 100, 210); });
  const dm = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  [1, -1].forEach(sd => {
    const ry = sd > 0 ? 0 : Math.PI, z = sd * 1.0;
    add(new THREE.PlaneGeometry(1.1, 0.26), dm(tiggoTex.door), 0.45, 0.78, z, 0, ry);
    add(new THREE.PlaneGeometry(0.42, 0.5), dm(tiggoTex.plate), -0.9, 0.85, z, 0, ry);
    add(new THREE.BoxGeometry(3.6, 0.1, 0.02), orange, -0.1, 0.45, z);
    add(new THREE.BoxGeometry(0.16, 0.1, 0.1), orange, 0.85, 1.22, sd * 1.02);   // зеркала
  });
  add(new THREE.BoxGeometry(0.3, 0.03, 1.9), orange, 0.42, 1.68, 0, 0, 0, 0.66);  // полоса над лобовым
  [-0.75, 0.75].forEach(z => add(new THREE.BoxGeometry(2.0, 0.05, 0.06), MAT.graphite, -0.8, 1.79, z));  // рейлинги
  const tire = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 24); tire.rotateX(Math.PI / 2); const rimG = new THREE.CylinderGeometry(0.28, 0.28, 0.36, 16); rimG.rotateX(Math.PI / 2);
  [[1.5, 0.88], [1.5, -0.88], [-1.5, 0.88], [-1.5, -0.88]].forEach(([x, z]) => { add(tire, MAT.matte, x, 0.44, z); add(rimG, MAT.chrome, x, 0.44, z); });
  const hl = tiggoTex.hl ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe8cc).multiplyScalar(0.9), toneMapped: false }), tl = tiggoTex.tl ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false });
  add(new THREE.BoxGeometry(0.04, 0.05, 1.7), hl, 2.44, 0.92, 0); add(new THREE.BoxGeometry(0.04, 0.32, 1.1), MAT.matte, 2.45, 0.62, 0);   // дневные огни и решётка
  add(new THREE.BoxGeometry(0.04, 0.06, 1.7), tl, -2.39, 1.12, 0);
  return car;
}
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
  const g = new THREE.Group(), b = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.85 }), beak = new THREE.MeshStandardMaterial({ color: 0xff7a10, roughness: 0.5 });
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
const atlCam = (side, z) => V(-side * 2, 94, z - 44);

// ---------- кварталы на одной улице: азиатский → стык (хроники ижоры) → спортивный ----------
// у каждого квартала лаконичное, но яркое оформление: несколько крупных узнаваемых форм, а не мелкий декор
const Q = { asia: [168, 268], joint: 282, sport: [292, 470], event: [482, 590], shops: [604, 716] };
// остановки btl: кейсы стоят посреди улицы
const Z = { tb: 248, lion: 320, iron: 356, silk: 400, foot: 446, goose: 492, mega: 532, mice: 572 };
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
function buildQuarters() {
  // ===== азиатский квартал: оформление на всю высоту проёма — гирлянды фонарей в четыре яруса, провода,
  // вертикальные вывески по обоим фасадам снизу доверху и световые ленты поперёк улицы наверху
  const gate = new THREE.Group();
  [-21, 21].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 24, 20), MAT.gloss); p.position.set(x, 12, 0); gate.add(p); });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(52, 2, 2.4), MAT.matte); t1.position.y = 24.6; gate.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 1.6), MAT.gloss); t2.position.y = 21; gate.add(t2);
  const t3 = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.6), MAT.cream); t3.position.y = 22.8; gate.add(t3);
  gate.position.set(0, 0, Q.asia[0] + 6); scene.add(gate);
  const lantGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12), capGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12);
  const lantMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.9 }), lantCream = new THREE.MeshStandardMaterial({ color: CREAM, emissive: 0xffd8b0, emissiveIntensity: 0.55 });
  const wire = new THREE.LineBasicMaterial({ color: 0x2a2a30 });
  const lr = [], lc = [], caps = [];
  [[25, 13, 8.5], [44, 19, 10], [63, 23, 12], [82, 29, 14]].forEach(([yb, step, dx], tier) => {
    for (let z = Q.asia[0] + 14 + tier * 4; z < Q.asia[1]; z += step) {
      const n = Math.round(76 / dx), pts = [];
      for (let i = 0; i <= n; i++) { const x = -38 + i * (76 / n), y = yb - Math.sin(i / n * Math.PI) * (3 + tier); pts.push(V(x, y, z + Math.sin(i) * 0.5)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
      pts.slice(1, -1).forEach((p, i) => { ((i + tier) % 4 === 0 ? lc : lr).push([p.x, p.y - 1.4, p.z]); caps.push([p.x, p.y - 0.45, p.z], [p.x, p.y - 2.35, p.z]); });
    }
  });
  const inst = (geo, mat, list) => { const im = new THREE.InstancedMesh(geo, mat, list.length), d = new THREE.Object3D(); list.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); scene.add(im); };
  inst(lantGeo, lantMat, lr); inst(lantGeo, lantCream, lc); inst(capGeo, MAT.matte, caps);
  // вывески по фасадам: разные высоты и размеры, до самого верха
  const SIGNS = ['いらっしゃい', 'オゾン社', '漫画喫茶', 'ガチャ', '連続', '居酒屋', 'ラーメン', '本日開店', 'カラオケ', '占い', '薬局', 'ゲーム', '酒場', '電気街'];
  const sr = mulberry(77);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, z = Q.asia[0] + 8 + sr() * (Q.asia[1] - Q.asia[0] - 14), y = 10 + sr() * 70, w = 2.4 + sr() * 2.8;
    const pal = sr(); const [col, bg] = pal < 0.45 ? ['#F40709', '#111111'] : pal < 0.7 ? ['#E1D9CF', '#F40709'] : ['#E1D9CF', '#111111'];
    vsign(SIGNS[i % SIGNS.length], side * 39.6, y, z, col, bg, w);
  }
  // световые ленты поперёк проёма у самого верха
  const lightBand = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false });
  [190, 222, 252].forEach((z, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(78, 0.5, 0.5), lightBand); b.position.set(0, 92 + i * 4, z); scene.add(b); });
  // ozon corp — на правом тротуаре (в кадре слева), лицом к проспекту
  diorama.position.set(24, 0, 214); diorama.rotation.y = 1.94;
  const al = new THREE.PointLight(0xff3a2a, 140, 45, 2); al.position.set(-10, 14, 225); scene.add(al);
  const al2 = new THREE.PointLight(0xffe8dc, 160, 40, 2); al2.position.set(10, 16, 205); scene.add(al2);

  // ===== спортивный квартал: беговые дорожки на асфальте, мачты прожекторов, финишная арка, табло, пьедестал, купола
  const lane = new THREE.MeshBasicMaterial({ color: 0x5a554f }), laneR = new THREE.MeshBasicMaterial({ color: RED });
  for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.35, Q.sport[1] - Q.sport[0]), i === 0 ? laneR : lane); l.rotation.x = -Math.PI / 2; l.position.set(i * 4.5, 0.06, (Q.sport[0] + Q.sport[1]) / 2); scene.add(l); }
  for (let i = -3; i < 3; i++) { const n = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: textTexture([String(i + 4)], { w: 256, h: 256, bg: '#0c0d12' }), transparent: true })); n.rotation.x = -Math.PI / 2; n.position.set(i * 4.5 + 2.25, 0.07, Q.sport[0] + 4); scene.add(n); }
  // финишная арка: две стойки и шахматная лента
  const ck = document.createElement('canvas'); ck.width = 512; ck.height = 64; const cg = ck.getContext('2d');
  for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#E1D9CF'; cg.fillRect(x * 16, y * 16, 16, 16); }
  const ckt = new THREE.CanvasTexture(ck); ckt.colorSpace = THREE.SRGBColorSpace;
  const arch = new THREE.Group();
  [-17, 17].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 18, 2.4), MAT.gloss); p.position.set(x, 9, 0); arch.add(p); });
  const band = new THREE.Mesh(new THREE.BoxGeometry(36.8, 3.2, 1.6), [MAT.matte, MAT.matte, MAT.matte, MAT.matte, new THREE.MeshBasicMaterial({ map: ckt }), new THREE.MeshBasicMaterial({ map: ckt })]); band.position.y = 19.6; arch.add(band);
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.2), new THREE.MeshBasicMaterial({ map: textTexture(['финиш'], { w: 1024, h: 230, bg: '#F40709', color: '#111111', accent: -1 }), toneMapped: false })); fin.position.set(0, 23.2, -0.85); fin.rotation.y = Math.PI; arch.add(fin);
  arch.position.set(0, 0, Q.sport[0] + 8); scene.add(arch);
  // мачты прожекторов
  for (let z = Q.sport[0] + 20; z < Q.sport[1]; z += 34) [-34, 34].forEach(x => {
    const m = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1, 42, 1), MAT.matte); pole.position.y = 21; m.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 1), MAT.matte); head.position.set(0, 43, 0); m.add(head);
    const lamps = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc890).multiplyScalar(1.1), toneMapped: false })); lamps.position.set(0, 43, 0.55); m.add(lamps);
    m.position.set(x, 0, z); m.rotation.y = x > 0 ? -Math.PI / 2 - 0.3 : Math.PI / 2 + 0.3; m.lookAt(0, 43, z + 20); scene.add(m);
  });
  // синегривый лев: маскот танцует прямо посреди улицы, без баннера — круглая сцена, синий нимб, свет сверху
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.2, 48), MAT.graphite); disc.position.set(0, 0.6, Z.lion); scene.add(disc);
  const blueM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a6bff).multiplyScalar(1.6), toneMapped: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.14, 8, 96), blueM); halo.rotation.x = Math.PI / 2; halo.position.set(0, 1.25, Z.lion); scene.add(halo);
  const ls = new THREE.SpotLight(0xdde6ff, 700, 70, 0.5, 0.6); ls.position.set(-6, 34, Z.lion - 16); ls.target.position.set(0, 6, Z.lion); scene.add(ls, ls.target);
  gltfLoader.loadAsync('assets/models/lion-dance.glb').then(gltf => {
    const m = gltf.scene, bb = new THREE.Box3().setFromObject(m), k = 16 / (bb.max.y - bb.min.y); m.scale.setScalar(k); m.position.set(0, 1.2 - bb.min.y * k, Z.lion); m.rotation.y = Math.PI;
    // мех: бархатный отлив (sheen) поверх цвета — грива и шкура читаются пушистыми, а не пластиковыми
    m.traverse(o => { if (!o.isMesh) return; const s = o.material; o.frustumCulled = false;
      o.material = new THREE.MeshPhysicalMaterial({ color: s.color, map: s.map, normalMap: s.normalMap, roughness: Math.max(0.6, s.roughness), sheen: 1, sheenColor: new THREE.Color(0x7d9cff), sheenRoughness: 0.5 }); });
    m.userData.case = 'lion'; scene.add(m); clickable.push(m);
    lionDance.mixer = new THREE.AnimationMixer(m); gltf.animations.forEach(a => lionDance.mixer.clipAction(a).play());
  }).catch(e => console.warn('lion', e));

  // ironstar: брендированный mustang g-drive на поворотном круге посреди улицы и стенд с кадром
  const tt = new THREE.Group(); tt.position.set(0, 0, Z.iron - 12); scene.add(tt);
  const ttb = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.8, 0.8, 64), MAT.matte); ttb.position.y = 0.4; tt.add(ttb);
  const redM = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false });
  const ttr = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.14, 8, 96), redM); ttr.rotation.x = Math.PI / 2; ttr.position.y = 0.85; tt.add(ttr);
  const shelby = mustangIronStar(); shelby.scale.setScalar(2.1); shelby.position.y = 0.8; tt.add(shelby); spinners.push({ o: shelby, k: 0.25 });
  shelby.userData.case = 'ironstar'; clickable.push(shelby);
  const cl = new THREE.SpotLight(0xffe8dc, 2400, 60, 0.55, 0.6); cl.position.set(6, 26, Z.iron - 18); cl.target = tt; scene.add(cl);
  stand('ironstar', ['gdrive-ironstar-1'], Z.iron + 4, { x: -15 });
  const cfl = new THREE.PointLight(0xffe8dc, 140, 26, 2); cfl.position.set(5, 12, Z.iron - 2); scene.add(cfl);

  // шёлковый путь — вау-момент: арка маршрута над улицей, полукольцо-панорама из четырёх кадров, пресс-кары chery tiggo 8 в брендинге g-drive кружат перед ней
  const arc = new THREE.Mesh(new THREE.TorusGeometry(27, 0.9, 16, 96, Math.PI), MAT.chrome); arc.position.set(0, 0, Z.silk - 24); scene.add(arc);
  const arcL = new THREE.Mesh(new THREE.TorusGeometry(27, 0.22, 8, 96, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(1.8), toneMapped: false })); arcL.position.set(0, 0, Z.silk - 23.1); scene.add(arcL);
  const km = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.43), new THREE.MeshBasicMaterial({ map: labelTex('4 500 км · 10 дней', 'g-drive · ралли «шёлковый путь» · 2022') })); km.position.set(0, 23, Z.silk - 24.8); km.rotation.y = Math.PI; scene.add(km);
  const pano = new THREE.Group(); pano.position.set(-8, 0, Z.silk); pano.rotation.y = Math.PI; scene.add(pano);
  ['gdrive-silk-1', 'gdrive-silk-road-1', 'gdrive-silk-road-2', 'gdrive-finish-1'].forEach((n, i) => {
    const a = (i - 1.5) * 0.72, R = 19, pg = new THREE.Group(); pg.position.set(Math.sin(a) * R, 0, 10 - Math.cos(a) * R); pg.rotation.y = -a; pano.add(pg);
    const back = new THREE.Mesh(new THREE.BoxGeometry(14.4, 9.5, 0.6), MAT.matte); back.position.set(0, 9.5, -0.4); pg.add(back);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 0.8), MAT.graphite); leg.position.set(0, 2.5, -0.4); pg.add(leg);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(13, 8.1), new THREE.MeshBasicMaterial({ map: caseTexture(`assets/cases/${n}.jpg`, false, 1024, 640) })); pic.material.color.setScalar(0.8); pic.position.y = 9.5; pg.add(pic);
    pic.userData.case = 'gdrive'; clickable.push(pic);
  });
  const track = new THREE.Mesh(new THREE.RingGeometry(10.6, 11.2, 96), new THREE.MeshBasicMaterial({ color: 0x6a2410 })); track.rotation.x = -Math.PI / 2; track.scale.set(1.3, 0.6, 1); track.position.set(0, 0.07, Z.silk - 2); scene.add(track);
  for (let i = 0; i < 5; i++) { const c = tiggoPress(11 + i); c.scale.setScalar(1.25); c.userData.case = 'gdrive'; clickable.push(c); scene.add(c); rally.push({ c, ph: i / 5 * Math.PI * 2 }); }   // 5 экипажей пресс-тура
  const sl2 = new THREE.PointLight(0xffd8b0, 700, 50, 1.6); sl2.position.set(0, 12, Z.silk - 4); scene.add(sl2);
  plate('assets/cases/avangard-1.jpg', 16, 22, V(-36.4, 15, 424), Math.PI / 2 + 0.6, 'avangard');

  // #футболеем всей страной: купола промозоны и стенд из четырёх кадров; без пересвета
  const domes = new THREE.Group();
  [[-7, 0, 6, MAT.graphite], [6, -3, 5, MAT.gloss], [2, 8, 4, MAT.graphite]].forEach(([x, z, r, m]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m); d.position.set(x, 0, z); domes.add(d); });
  domes.position.set(30, 0, Z.foot + 4); domes.userData.case = 'baltika7'; scene.add(domes); clickable.push(domes);
  stand('baltika7', ['baltika7-1', 'baltika7-zone-1', 'baltika7-zone-2', 'baltika7-prizes-1'], Z.foot, { x: -15 });

  // ===== ивент-квартал: ферма поперёк улицы, лучи прожекторов, лапки гуся; три кейса — стенды посреди улицы
  const truss = new THREE.Group();
  const bar = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.matte); b.position.set(x, y, z); truss.add(b); };
  [-20, 20].forEach(x => { bar(1.4, 22, 1.4, x, 11, -1); bar(1.4, 22, 1.4, x, 11, 1); });
  bar(42, 1.4, 1.4, 0, 22, -1); bar(42, 1.4, 1.4, 0, 22, 1); bar(42, 1.4, 1.4, 0, 19, 0);
  for (let x = -19; x <= 19; x += 2.6) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), MAT.graphite); d.position.set(x, 20.5, 0); d.rotation.z = (x % 5.2 > 0 ? 1 : -1) * 0.6; truss.add(d); }
  truss.position.set(0, 0, Q.event[0]); scene.add(truss);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  [-16, -6, 6, 16].forEach((x, i) => { const c = new THREE.Mesh(new THREE.ConeGeometry(5, 21, 24, 1, true), beamMat); c.position.set(x, 10.5, Q.event[0] + 0.5); c.rotation.z = (i % 2 ? 1 : -1) * 0.25; scene.add(c); });
  // гусь «балтики»: объёмный гусь из простых форм рядом со стендом
  const gs = goose(); gs.scale.setScalar(1.2); gs.position.set(4, 0, Z.goose - 12); gs.rotation.y = 2.6; scene.add(gs); swing.push({ o: gs, k: 'waddle' });
  gs.userData.case = 'baltikaPlant'; clickable.push(gs);
  stand('baltikaPlant', ['baltika-plant-1', 'baltika-plant-mock-1', 'baltika-plant-mock-2', 'baltika-plant-ruby-1'], Z.goose, { x: -15 });
  // мегафон: кольцо камер bullet time вокруг застывшего в прыжке гостя
  const bt = new THREE.Group(); bt.position.set(1, 0, Z.mega - 12); bt.scale.setScalar(1.15); scene.add(bt);
  const tally = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00b956).multiplyScalar(1.6), toneMapped: false });
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 0.62 + i / 13 * Math.PI * 1.76, px = Math.cos(a) * 6.5, pz = Math.sin(a) * 6.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.4, 0.25), MAT.graphite); post.position.set(px, 2.2, pz); bt.add(post);
    const cm = new THREE.Group(); cm.position.set(px, 4.7, pz);
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.1), MAT.matte); cm.add(cb);
    const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 12), MAT.gloss); ln.rotation.x = Math.PI / 2; ln.position.z = 0.7; cm.add(ln);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), tally); tl.position.set(0, 0.36, 0.3); cm.add(tl);
    cm.lookAt(bt.position.x, 4, bt.position.z); bt.add(cm);
  }
  const jumper = new THREE.Group(); const jb = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2, 6, 12), MAT.graphite); jumper.add(jb);
  const jh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), MAT.graphite); jh.position.y = 1.9; jumper.add(jh);
  [-1, 1].forEach(s => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.5, 4, 8), MAT.graphite); a.position.set(s * 1, 1, 0); a.rotation.z = s * 2.3; jumper.add(a); const l = a.clone(); l.position.set(s * 0.5, -1.7, 0.3); l.rotation.set(s * 0.6, 0, s * 0.3); jumper.add(l); });
  jumper.position.y = 5; bt.add(jumper); spinners.push({ o: jumper, k: 0.5 });
  bt.userData.case = 'megafon'; clickable.push(bt);
  stand('megafon', ['megafon-1', 'megafon-zone-1', 'megafon-zone-2', 'megafon-bullet-1'], Z.mega, { x: -15 });
  stand('mice', ['mice-1', 'mice-details-1', 'mice-details-2', 'mice-out-1'], Z.mice, { x: -15 });
  // лапки гуся: как на заводе «балтики», ведут вдоль квартала
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d'); pg.fillStyle = '#F40709';
  pg.beginPath(); pg.moveTo(64, 120); pg.lineTo(14, 30); pg.lineTo(40, 22); pg.lineTo(64, 60); pg.lineTo(88, 22); pg.lineTo(114, 30); pg.closePath(); pg.fill();
  const pt = new THREE.CanvasTexture(pc); const pm = new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false });
  for (let z = Q.event[0] + 6, k = 0; z < Q.event[1]; z += 4, k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), pm); p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI; p.position.set((k % 2 ? 1.2 : -1.2) + Math.sin(z * 0.08) * 6 + 14, 0.07, z); scene.add(p); }
  plate('assets/cases/megafon-travel-1.jpg', 14, 18, V(36.4, 12, 590), -Math.PI / 2 - 0.6, 'megafonTravel');

  // т-банк «чёрный пояс по it» — в азиатском квартале: заглушка под 3d-модель зоны — круглый павильон под тентом, арка-тории и стенд с фото зоны
  const TY = new THREE.MeshStandardMaterial({ color: 0xffdd2d, roughness: 0.5 }), tg = new THREE.Group(); tg.position.set(1, 0, Z.tb - 10); tg.scale.setScalar(0.85); scene.add(tg);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), TY); p.position.set(Math.cos(a) * 10, 3.5, Math.sin(a) * 10); tg.add(p); }
  const ringb = new THREE.Mesh(new THREE.TorusGeometry(10, 0.4, 8, 64), TY); ringb.rotation.x = Math.PI / 2; ringb.position.y = 7; tg.add(ringb);
  const tent = new THREE.Mesh(new THREE.ConeGeometry(10.6, 5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xb8a868, roughness: 0.8, side: THREE.DoubleSide })); tent.position.y = 9.5; tg.add(tent);
  const tor = new THREE.Group(); [-2.6, 2.6].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 6, 12), TY); p.position.set(x, 3, 0); tor.add(p); });
  const kas = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.6, 0.7), MAT.matte); kas.position.y = 6.3; tor.add(kas);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 0.5), TY); nuki.position.y = 5.2; tor.add(nuki);
  tor.position.set(0, 0, -10.6); tg.add(tor);
  const start = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 32), MAT.matte); start.position.y = 0.4; tg.add(start);
  tg.userData.case = 'tbank'; clickable.push(tg);
  stand('tbank', ['tbank-zone-1', 'tbank-zone-top-1', 'tbank-road-1', 'tbank-cover-1'], Z.tb, { x: -15 });

  // ===== квартал мерча: потолок из световых балок, подиум-дорожка по центру и четыре витрины по сторонам, к камере углом
  const qz0 = Q.shops[0], qz1 = Q.shops[1], beams = [];
  for (let z = qz0 + 4; z < qz1; z += 9) beams.push([0, 19, z]);
  const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.3), toneMapped: false });
  const bIm = new THREE.InstancedMesh(new THREE.BoxGeometry(60, 0.35, 0.35), beamM, beams.length), bd = new THREE.Object3D();
  beams.forEach(([x, y, z], i) => { bd.position.set(x, y, z); bd.updateMatrix(); bIm.setMatrixAt(i, bd.matrix); }); scene.add(bIm);
  [-30, 30].forEach(x => { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, qz1 - qz0), MAT.graphite); rail.position.set(x, 19, (qz0 + qz1) / 2); scene.add(rail); });
  const run = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, qz1 - qz0), MAT.graphite); run.position.set(0, 0.15, (qz0 + qz1) / 2); scene.add(run);
  [-4.1, 4.1].forEach(x => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, qz1 - qz0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8b0).multiplyScalar(0.55), toneMapped: false })); e.position.set(x, 0.17, (qz0 + qz1) / 2); scene.add(e); });
  tagAt('квартал мерча', 'упаковка · одежда · наборы', V(0, 23.5, qz0 + 2), V(0, 12, qz0 - 40), 26);
  MERCH.forEach(([id, img, side, z, prop]) => vitrine(id, img, side, z, prop));

  // ===== объёмные слова по рефу 1: буквы — плиты из разных материалов, разъезжаются и собираются по мере подхода
  gltfLoader.loadAsync('assets/models/type.glb').then(gltf => {
    const byWord = {};
    gltf.scene.traverse(o => { if (o.isMesh) { const [w, i] = o.name.split('_'); (byWord[w] ||= []).push({ o, i: +i }); } });
    const LET = [MAT.matte, MAT.cream, MAT.glass, MAT.gloss];
    const place = (w, x, z, k, ry = Math.PI) => {
      const list = (byWord[w] || []).sort((a, b) => a.i - b.i); if (!list.length) return;
      const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner); inner.rotation.x = Math.PI / 2;
      const x0 = list[0].o.position.x, x1 = list[list.length - 1].o.position.x + 0.7;
      list.forEach(({ o, i }, n) => { const m = o.clone(); m.material = LET[(n + w.length) % LET.length]; m.position.set(o.position.x - (x0 + x1) / 2, 0, 0); inner.add(m); m.userData.base = m.position.clone(); m.userData.n = n; });
      outer.scale.setScalar(k); outer.position.set(x, 0, z); outer.rotation.y = ry; scene.add(outer);
      kinetic.push({ outer, inner, len: list.length });
    };
    place('btl', 13, 164, 9); place('atl', -13, 164, 9);
  }).catch(e => console.warn('type.glb', e));
}
const aiClips = [], kinetic = [];
const _wp = new THREE.Vector3();
function updateQuarters(time) {
  const dt = Math.min(0.05, time - (lionDance.t || time)); lionDance.t = time;
  if (lionDance.mixer) lionDance.mixer.update(dt);
  spinners.forEach(s => { s.o.rotation.y = time * s.k; });
  rally.forEach(r => { const a = time * 0.35 + r.ph, vx = -Math.sin(a) * 14.3, vz = Math.cos(a) * 6.6; r.c.position.set(Math.cos(a) * 14.3, 0, Z.silk - 2 + Math.sin(a) * 6.6); r.c.rotation.y = Math.atan2(-vz, vx); });
  swing.forEach(s => { if (s.k === 'tee') s.o.rotation.y = Math.sin(time * 1.1 + s.ph) * 0.25; else { s.o.rotation.z = Math.sin(time * 3) * 0.04; s.o.userData.neck && (s.o.position.y = Math.abs(Math.sin(time * 3)) * 0.3); } });
  const sec = 3738 + Math.floor(time); if (ledTimer.c && sec !== ledTimer.last) { ledTimer.last = sec; drawTimer(sec); }
  aiRings.forEach((r, i) => { if (r.portal) { r.portal.rotation.z = time * 0.15; return; } r.rotation.z = time * 0.5 + i; r.position.y = 158 + Math.sin(time * 0.8 + i) * 1.2; });
  aiNeurons.forEach(a => { a.n.rotation.set(time * a.s, time * a.s * 0.7, 0); a.n.position.y = a.y + Math.sin(time * 0.6 + a.ph) * 2; });
  if (aiStreams.mesh) aiStreams.list.forEach(([x, y0, z, sp], i) => { _dm.position.set(x, 62 + (y0 + time * sp) % 100, z); _dm.updateMatrix(); aiStreams.mesh.setMatrixAt(i, _dm.matrix); }), aiStreams.mesh.instanceMatrix.needsUpdate = true;
  updateDixy(time);
  aiClips.forEach(c => {
    c.g.position.y = c.y + Math.sin(time * 0.7 + c.ph) * 0.6;
    const near = c.g.position.distanceTo(camera.position) < 140;
    if (c.still) c.g.position.y = c.y;
    if (near && c.v.paused) c.v.play().catch(() => {}); else if (!near && !c.v.paused) c.v.pause();
  });
  // кинетический набор: чем дальше камера, тем сильнее буквы разъезжаются в глубину; вблизи строка собирается
  kinetic.forEach(k => {
    k.outer.getWorldPosition(_wp); const d = clamp01((_wp.distanceTo(camera.position) - 25) / 110);
    k.inner.children.forEach(m => { const n = m.userData.n, s = (n % 2 ? 1 : -1) * (1 + n * 0.6); m.position.y = m.userData.base.y + s * d * 0.9; m.rotation.x = s * d * 0.25; });
  });
}

// ---------- дикси: три отдельные башни, в каждой один открытый этаж-магазин. этажи ступенькой вверх, вокруг летают машины ----------
// дино (ниже всех), треснутые (выше), заклинатели — настоящий кинозал в самой высокой
const DIXY = { x: -50, w: 40, d: 44, cz: 315, towers: [['treschnutye', 225, 40, 18, 112], ['dino', 345, 52, 18, 124], ['zaklinateli', 405, 70, 22, 146]] };
const DIXY_ORANGE = 0xff5a00;
const cinema = { screen: null, glow: null, video: null }, floaters = [], cars = [];
function buildDixyTowers() {
  const { x, w, d } = DIXY, face = x + w / 2;           // фасад к улице: x = -30
  const shell = new THREE.MeshStandardMaterial({ color: 0x2a2b30, map: windowsTexture(61, 0.03), emissiveMap: windowsTexture(61, 0.03), emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.9 });
  const oM = new THREE.MeshBasicMaterial({ color: new THREE.Color(DIXY_ORANGE).multiplyScalar(1.4), toneMapped: false });
  const ob = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, d), oM);
  DIXY.towers.forEach(([id, z, y0, h, top]) => {
    const solid = (a, b) => { const bx = new THREE.Mesh(new THREE.BoxGeometry(w, b - a, d), shell); bx.position.set(x, (a + b) / 2, z); scene.add(bx); };
    solid(0, y0); solid(y0 + h, top);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 8, d * 0.6), MAT.matte); crown.position.set(x, top + 4, z); scene.add(crown);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, d), oM); band.position.set(face + 0.3, top - 3, z); scene.add(band);
    const g = new THREE.Group(); g.position.set(x, y0, z); scene.add(g);
    const room = (bw, bh, bd, bx, by, bz, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); b.position.set(bx, by, bz); g.add(b); return b; };
    const wallM = new THREE.MeshStandardMaterial({ color: id === 'zaklinateli' ? 0x120606 : 0x1c1c20, roughness: 0.9 });
    room(w, 0.8, d, 0, 0.4, 0, MAT.matte); room(w, 0.8, d, 0, h - 0.4, 0, MAT.matte);
    room(0.8, h, d, -w / 2 + 0.4, h / 2, 0, wallM); room(w, h, 0.8, 0, h / 2, -d / 2 + 0.4, wallM); room(w, h, 0.8, 0, h / 2, d / 2 - 0.4, wallM);
    const edge = ob.clone(); edge.position.set(w / 2 - 0.3, h - 0.9, 0); g.add(edge);     // оранжевая кромка «дикси» по этажу
    if (id === 'zaklinateli') buildCinemaFloor(g, w, h, d); else buildShopFloor(g, id, w, h, d);
    tagAt('дикси · ' + CASES[id].title, CASES[id].awards[0] || CASES[id].pass.формат, V(face + 1, y0 + h + 3.4, z), V(0, y0 + 9, z - 30), 22);
  });
  // летающие машины: обтекаемые капсулы на эллиптических трассах вокруг трёх башен
  const body = new THREE.CapsuleGeometry(1.1, 3.6, 6, 12); body.rotateZ(Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const car = new THREE.Group();
    const b = new THREE.Mesh(body, i % 3 ? MAT.matte : MAT.gloss); b.scale.set(1, 0.7, 0.85); car.add(b);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glassO); cab.position.set(0.3, 0.45, 0); cab.scale.set(1.5, 0.8, 0.9); car.add(cab);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8a8).multiplyScalar(1.5), toneMapped: false })); hl.position.set(2.9, 0, 0); car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2), toneMapped: false })); tl.position.set(-2.9, 0, 0); car.add(tl);
    scene.add(car);
    cars.push({ car, y: 48 + i * 11, rx: 34 + (i % 3) * 6, rz: 110 + (i % 2) * 14, sp: 0.06 + (i % 4) * 0.015, ph: i * 0.9, dir: i % 2 ? 1 : -1 });
  }
}
function buildShopFloor(g, id, w, h, d) {
  // этаж-витрина без лишнего: на задней стене большой экран кейса, в центре один герой-объект, тёплый свет
  const sh = h - 4.5, sw = sh * 16 / 9;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: caseTexture(`assets/cases/${id}-1.jpg`, false, 1024, 576) }));
  scr.material.color.setScalar(0.8); scr.position.set(-w / 2 + 1.2, h / 2 + 0.6, 0); scr.rotation.y = Math.PI / 2; g.add(scr); scr.userData.case = id; clickable.push(scr);
  const pl = new THREE.PointLight(0xffc890, 220, 45, 2); pl.position.set(6, h - 3, 0); g.add(pl);
  if (id === 'dino') {
    // мегатирекс, собранный из 12 конструкторов
    const rex = new THREE.Group(), blk = (bw, bh, bd, bx, by, bz, m = MAT.gloss) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); b.position.set(bx, by, bz); rex.add(b); };
    blk(7, 4, 3, 0, 7, 0); blk(3.5, 3, 2.6, 4.6, 10, 0); blk(2.6, 1.2, 2.2, 6.8, 9.2, 0, MAT.matte); blk(1.2, 5, 1.2, -1.5, 3, 0.9, MAT.matte); blk(1.2, 5, 1.2, 1.5, 3, -0.9, MAT.matte);
    blk(6, 1.6, 1.6, -6, 7.6, 0); blk(3, 1, 1, -10, 8.4, 0); blk(1, 2.2, 0.8, 2.6, 6.2, 1.6, MAT.matte);
    rex.position.set(4, 0.8, 4); g.add(rex); rex.userData.case = 'dino'; clickable.push(rex); floaters.push({ g: rex, y: 0.8, ph: 0, spin: true });
  } else {
    // треснутые: один большой автомат с 26 капсулами — по числу героев
    const ga = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), MAT.gloss); base.position.y = 3; ga.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.05, clearcoat: 1, depthWrite: false })); dome.position.y = 9; ga.add(dome);
    const cr = mulberry(26), capM = [MAT.gloss, new THREE.MeshStandardMaterial({ color: DIXY_ORANGE, roughness: 0.4 }), MAT.graphite];
    for (let c = 0; c < 26; c++) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), capM[c % 3]); const a = cr() * 6.3, rr = cr() * 2.2; cap.position.set(Math.cos(a) * rr, 7 + cr() * 2.2, Math.sin(a) * rr); ga.add(cap); }
    ga.position.set(4, 0.8, 4); g.add(ga); ga.userData.case = 'treschnutye'; clickable.push(ga); floaters.push({ g: ga, y: 0.8, ph: 1, spin: true });
  }
}
function buildCinemaFloor(g, w, h, d) {
  // кинозал: экран на задней стене, бархатные шторы по бокам, ряды кресел амфитеатром, ступени, «выход» над дверью
  const sx = -w / 2 + 1.2;
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(d - 8, h - 3), new THREE.MeshBasicMaterial({ color: 0x050505 })); mask.position.set(sx - 0.05, h / 2 + 0.6, 0); mask.rotation.y = Math.PI / 2; g.add(mask);
  const sw = 30, sh = sw * 9 / 16;
  const scrMat = new THREE.MeshBasicMaterial({ map: caseTexture('assets/cases/zaklinateli-1.jpg', false), toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), scrMat); scr.position.set(sx, h / 2 + 2.2, 0); scr.rotation.y = Math.PI / 2; g.add(scr);
  scr.userData.case = 'zaklinateli'; clickable.push(scr); cinema.screen = scr;
  // ролик: если рядом лежит assets/zaklinateli.mp4 — играет он, иначе тизерный кадр с медленным проездом камеры
  fetch('assets/zaklinateli.mp4', { method: 'HEAD' }).then(r => { if (!r.ok) return;
    const v = Object.assign(document.createElement('video'), { src: 'assets/zaklinateli.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; scrMat.map = vt; scrMat.needsUpdate = true; cinema.video = v; }).catch(() => {});
  const velvet = new THREE.MeshStandardMaterial({ color: 0x6e0508, roughness: 0.85 });
  [-1, 1].forEach(sd => { for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h - 1.6, 10), velvet); f.position.set(sx + 0.8, h / 2, sd * (sw / 2 + 1 + i * 0.9)); g.add(f); } });
  const seatG = new THREE.BoxGeometry(1.5, 1.2, 1.6), backG = new THREE.BoxGeometry(0.4, 1.6, 1.6);
  const rows = 9, perRow = 18, seats = new THREE.InstancedMesh(seatG, velvet, rows * perRow), backs = new THREE.InstancedMesh(backG, velvet, rows * perRow);
  const dm = new THREE.Object3D(); let k = 0;
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9 * (r + 1), d - 4), MAT.matte); step.position.set(sx + 14 + r * 2.4, 0.45 * (r + 1) + 0.8, 0); g.add(step);
    for (let c = 0; c < perRow; c++) {
      if (c === 9) continue;
      const zz = -d / 2 + 6 + c * ((d - 12) / (perRow - 1)), y = 0.9 * (r + 1) + 1.4;
      dm.position.set(sx + 14 + r * 2.4, y, zz); dm.updateMatrix(); seats.setMatrixAt(k, dm.matrix);
      dm.position.set(sx + 14.9 + r * 2.4, y + 0.9, zz); dm.updateMatrix(); backs.setMatrixAt(k, dm.matrix); k++;
    }
  }
  seats.count = backs.count = k; g.add(seats, backs);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ map: textTexture(['выход'], { w: 512, h: 170, bg: '#0c3' , color: '#111111', accent: -1 }), toneMapped: false })); exit.position.set(w / 2 - 6, h - 3, -d / 2 + 0.9); g.add(exit);
  const glow = new THREE.PointLight(0xff8a50, 300, 60, 2); glow.position.set(sx + 6, h / 2, 0); g.add(glow); cinema.glow = glow;
  [-18, -6, 6, 18].forEach(zz => { const dl = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: 0xffb070, toneMapped: false })); dl.rotation.x = Math.PI / 2; dl.position.set(8, h - 0.85, zz); g.add(dl); });
}
function updateDixy(time) {
  cars.forEach(c => {
    const a = c.ph + time * c.sp * c.dir, x = DIXY.x + 10 + Math.cos(a) * c.rx, z = DIXY.cz + Math.sin(a) * c.rz;
    const nx = DIXY.x + 10 + Math.cos(a + 0.01 * c.dir) * c.rx, nz = DIXY.cz + Math.sin(a + 0.01 * c.dir) * c.rz;
    c.car.position.set(x, c.y + Math.sin(time * 0.6 + c.ph) * 1.5, z); c.car.rotation.y = Math.atan2(-(nz - z), nx - x);
  });
  floaters.forEach(f => { if (f.spin) f.g.rotation.y = -0.6 + Math.sin(time * 0.4) * 0.3; else { f.g.position.y = f.y + Math.sin(time * 0.8 + f.ph) * 0.4; } });
  if (floaters.ring) floaters.ring.material.color.setHSL(0.74, 0.8, 0.45 + Math.sin(time * 3) * 0.2);
  if (cinema.screen) {
    const fl = 0.92 + Math.sin(time * 23) * 0.04 + Math.sin(time * 7) * 0.04; cinema.screen.material.color.setScalar(fl); cinema.glow.intensity = 300 * fl;
    if (!cinema.video) { const m = cinema.screen.material.map; m.repeat.set(0.86, 0.86); m.offset.set(0.07 + Math.sin(time * 0.12) * 0.07, 0.07 + Math.cos(time * 0.09) * 0.05); }
    else { const near = cinema.screen.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) < 120; if (near && cinema.video.paused) cinema.video.play().catch(() => {}); else if (!near && !cinema.video.paused) cinema.video.pause(); }
  }
}

// ---------- ai-продакшн наверху: отдельный квартал из четырёх башен-монолитов, у каждой свой кейс и свой ролик ----------
// минимальная форма «ии»: чёрное тело, световая щель, стеклянная голова и парящий нимб
const AI_TOWERS = [['aiFonbet', 'fonbet', 1, 572], ['aiMango', 'mango', -1, 602], ['aiLavka', 'lavka', 1, 632], ['aiAlfa', 'alfa', -1, 662]];
const aiRings = [], aiNeurons = [], aiStreams = { mesh: null, list: [] }, _dm = new THREE.Object3D();
const aiCam = (side, z) => V(-side * 2, 96, z - 38);
function buildAiTowers() {
  const slitM = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.8), toneMapped: false });
  AI_TOWERS.forEach(([id, clip, side, z], i) => {
    const tx = side * 46;
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 150, 16), MAT.matte); body.position.set(tx, 75, z); scene.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.2, 150, 10), MAT.graphite); face.position.set(tx - side * 8.4, 75, z); scene.add(face);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 130, 0.4), slitM); slit.position.set(tx - side * 9.1, 70, z + 3.4); scene.add(slit);
    const head = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 20), MAT.chrome); head.position.set(tx, 158, z); scene.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.35, 10, 96), slitM); ring.position.set(tx, 158, z); ring.rotation.x = Math.PI / 2 + 0.25; scene.add(ring); aiRings.push(ring);
    const v = Object.assign(document.createElement('video'), { src: `assets/ai-${clip}.mp4`, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
    const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace;
    const cam = aiCam(side, z), { g } = screenAt(vt, 28, 15.75, V(side * 22, 96, z), cam, id);
    aiClips.push({ g, v, y: g.position.y, ph: i, still: true });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 0.9), MAT.graphite); arm.position.set(side * 32, 104, z); scene.add(arm);
    tagAt(CASES[id].title, CASES[id].pass.клиент + ' · ai-продакшн', V(side * 22, 86, z), cam, 22);
  });
  tagAt('ai-продакшн', 'ролики, которых не снимали · четыре кейса', V(0, 124, 556), V(0, 96, 500), 30);
  // оформление квартала: голографическая сетка под башнями, «нейроны» — каркасные многогранники, потоки данных и портал на входе
  const grid = new THREE.GridHelper(110, 22, RED, 0x5a1010); grid.position.set(0, 66, 617); grid.material.transparent = true; grid.material.opacity = 0.35; grid.material.depthWrite = false; scene.add(grid);
  const portal = new THREE.Mesh(new THREE.TorusGeometry(27, 0.5, 12, 128), slitM); portal.position.set(0, 96, 548); scene.add(portal); aiRings.push({ portal });
  const nr = mulberry(404), edgeM = new THREE.LineBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 16; i++) {
    const r = 1.2 + nr() * 2.8, n = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r, nr() < 0.5 ? 0 : 1)), edgeM);
    n.position.set((nr() - 0.5) * 60, 70 + nr() * 60, 560 + nr() * 110); scene.add(n); aiNeurons.push({ n, s: 0.2 + nr() * 0.6, y: n.position.y, ph: nr() * 6 });
  }
  const sg = new THREE.BoxGeometry(0.14, 9, 0.14), sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0c0).multiplyScalar(1.2), toneMapped: false, transparent: true, opacity: 0.55 });
  aiStreams.mesh = new THREE.InstancedMesh(sg, sm, 60); scene.add(aiStreams.mesh);
  for (let i = 0; i < 60; i++) aiStreams.list.push([(nr() - 0.5) * 70, nr() * 100, 556 + nr() * 120, 8 + nr() * 18]);
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
  const N = 4200, rp = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (r() - 0.5) * 140, y = r() * 110, z = (r() - 0.5) * 140; rp.set([x, y, z, x + 0.12, y - 1.8, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  FX.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffb0b0, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  FX.rain.frustumCulled = false; scene.add(FX.rain);

  // реф 4, 5: город плотнее — пожарные лестницы, кондиционеры, буквы на крышах, неон, колонны данных на фасадах у улицы
  const near = CITY.cells.filter(c => Math.abs(c.x) < 75 && c.z > -20 && c.z < 980 && Math.abs(c.x) - c.w / 2 > 18);
  const fe = { plat: [], stair: [] }, dm = new THREE.Object3D();
  near.forEach((c, i) => {
    const side = Math.sign(c.x), fx = c.x - side * (c.w / 2 + 1.3), q = r();
    if (q < 0.28 && c.h > 30) { for (let y = 6; y < Math.min(c.h - 4, 60); y += 6) { fe.plat.push([fx, y, c.z, 0]); fe.stair.push([fx, y + 3, c.z + (y / 6 % 2 ? 1.6 : -1.6), y / 6 % 2 ? 1 : -1]); } }
    else if (q < 0.55) { const ld = dataTex(i), m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, Math.min(c.h * 0.7, 46)), new THREE.MeshBasicMaterial({ map: ld, toneMapped: false })); m.position.set(c.x - side * (c.w / 2 + 0.25), Math.min(c.h * 0.7, 46) / 2 + 6, c.z + (r() - 0.5) * c.d * 0.5); m.rotation.y = -side * Math.PI / 2; scene.add(m); FX.leds.push({ t: ld, k: 0.04 + r() * 0.08 }); }
    else if (q < 0.75) { const vert = r() < 0.5, words = ['九龍城', '眠らない', '酒場', 'パチンコ', '電脳', '夜市'], t = neonTex(words[i % words.length], vert), w = vert ? 3.2 : 10, h = vert ? 12.8 : 6.25;
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
  const ac = []; near.forEach(c => { const side = Math.sign(c.x); for (let y = 8; y < Math.min(c.h - 3, 44); y += 7 + r() * 6) if (r() < 0.45) ac.push([c.x - side * (c.w / 2 + 0.5), y, c.z + (r() - 0.5) * c.d * 0.7, side]); });
  props('exterior_aircon_unit', n => n === 'exterior_aircon_unit', ac, 2.4, ([x, y, z, s], d) => { d.position.set(x, y, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  const walk = []; for (let z = 40; z < 960; z += 9 + r() * 14) { const side = r() < 0.5 ? -1 : 1, edge = z > 165 && z < 716 ? 37 : 18; walk.push([side * (edge - r() * 2), z, side, (r() * 3) | 0]); }
  props('metal_trash_can', n => !n.includes('rust'), walk.filter(w => w[3] === 0), 2.2, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, r() * 6, 0); });
  props('fire_hydrant', n => n === 'fire_hydrant' || n === 'fire_hydrant_cap_01', walk.filter(w => w[3] === 1), 2.4, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  props('utility_box_01', () => true, walk.filter(w => w[3] === 2), 2.6, ([x, z, s], d) => { d.position.set(x, 0, z); d.rotation.set(0, -s * Math.PI / 2, 0); });
  // реф 3: подвесные лампы над тротуаром — абажур и пятно света под ним
  const lamps = []; for (let z = 60; z < 940; z += 26) [-1, 1].forEach(s => lamps.push([s * (z > 165 && z < 716 ? 33 : 15), 13, z + s * 6]));
  props('hanging_industrial_lamp', () => true, lamps, 2.4, ([x, y, z], d) => { d.position.set(x, y, z); d.rotation.set(0, 0, 0); });
  const glowM = new THREE.SpriteMaterial({ map: softDot, color: 0xffd2a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  lamps.forEach(([x, y, z]) => { const s = new THREE.Sprite(glowM); s.scale.setScalar(4); s.position.set(x, y - 0.6, z); scene.add(s); const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: softDot, color: 0x5a3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.07, z); scene.add(pool); });

  // реф 2: провода поперёк улицы и световые короба на них
  const wire = new THREE.LineBasicMaterial({ color: 0x241418 });
  for (let z = 300; z < 960; z += 17 + r() * 12) {
    const y0 = 20 + r() * 26, pts = []; for (let i = 0; i <= 16; i++) { const x = -40 + i * 5; pts.push(V(x, y0 - Math.sin(i / 16 * Math.PI) * (3 + r() * 0.4), z + (r() - 0.5))); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
    if (r() < 0.35) { const sym = ['→', '↑', '24', '★★★', '»»'][(r() * 5) | 0], t = canvasTex(256, 160, (g) => { g.fillStyle = '#ffd9cf'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#F40709'; g.font = '700 96px TT, sans-serif'; g.textAlign = 'center'; g.fillText(sym, 128, 115); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 150); });
      const bx = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.5), [MAT.matte, MAT.matte, MAT.matte, MAT.matte, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })]); bx.material[4].color.setScalar(0.75); bx.material[5].color.setScalar(0.75);
      bx.position.set((r() - 0.5) * 50, y0 - 5.5, z); scene.add(bx); }
  }

  // реф 1 и пин: эстакады над проспектом — бетон в граффити, огни снизу, по верхней едет поезд
  [[296, 34, 1], [474, 30, 2]].forEach(([z, y, s]) => {
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
  decal('{04} азия', 16, 8, -12, 172, Math.PI); decal('{04} спорт', 16, 8, -12, 300, Math.PI); decal('{04} ивент', 16, 8, -12, 486, Math.PI); decal('{04} мерч', 16, 8, -12, 606, Math.PI); decal('{06} награды', 16, 8, 0, 730, Math.PI);

  // реф 11: хромовые шипы y2k на площади, на перекрёстке, у квартала мерча и над ai-кварталом
  [[-44, 0, 74, 1.2], [46, 0, 80, 1.0], [-24, 0, 170, 0.8], [25, 0, 174, 0.85], [-28, 0, 610, 0.6], [0, 132, 610, 0.9], [-31, 0, Z.tb + 8, 0.55], [-31, 0, Z.foot + 6, 0.5], [-31, 0, Z.mega + 6, 0.5], [30, 0, Z.silk - 30, 0.6], [-31, 0, Z.mice + 6, 0.5]].forEach(([x, y, z, k], i) => { const t = chromeThorn(31 + i, chrome); t.position.set(x, y, z); t.scale.setScalar(k); t.rotation.y = i; scene.add(t); t.updateMatrixWorld(true); FX.sparks.filter(s => !s.w).forEach(s => { s.w = s.p.clone().applyMatrix4(t.matrixWorld); }); });
  const sparkM = new THREE.SpriteMaterial({ map: starFlare, color: 0xffeaea, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  FX.sparks.forEach(s => { s.sp = new THREE.Sprite(sparkM); s.sp.position.copy(s.w); scene.add(s.sp); });

  // хромовые формы y2k в разных местах: над площадью, у перекрёстка, над кварталом мерча, среди ai-башен
  [[-46, 74, 56, 'knot', 5], [-34, 48, 140, 'torus', 5], [36, 52, 136, 'blob', 6], [0, 30, 650, 'knot', 4], [-24, 112, 590, 'blob', 7], [26, 104, 640, 'torus', 6], [0, 82, 250, 'blob', 4.5], [0, 60, 470, 'torus', 5]].forEach(([x, y, z, kind, k], i) => {
    const geo = kind === 'knot' ? new THREE.TorusKnotGeometry(1, 0.32, 160, 24, 2, 3) : kind === 'torus' ? new THREE.TorusGeometry(1, 0.38, 32, 96) : new THREE.IcosahedronGeometry(1, 5);
    if (kind === 'blob') { const pa = geo.attributes.position, v = new THREE.Vector3(); for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j); const n = 1 + 0.22 * Math.sin(v.x * 4 + i) * Math.cos(v.y * 3) + 0.12 * Math.sin(v.z * 6); v.multiplyScalar(n); pa.setXYZ(j, v.x, v.y, v.z); } geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, chrome); m.position.set(x, y, z); m.scale.setScalar(k); scene.add(m); FX.blobs.push({ m, y, ph: i });
  });
  // реф 6, 15, 16 и пин: матовая красная колонна-голограмма, за стеклом танцует силуэт льва
  const holo = new THREE.Group(); holo.position.set(-96, 0, 520); scene.add(holo);
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
    scene.add(f); FX.fliers.push({ f, y: 60 + r() * 90, z: 100 + r() * 800, sp: (r() < 0.5 ? -1 : 1) * (14 + r() * 16), x0: (r() - 0.5) * 600 });
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
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GO = { reel: 0.48, cross: 0.57, btl: 0.62, alley: 0.642, sport: 0.704, event: 0.81, shops: 0.87, dixy: 0.638, atl: 0.638, ai: 0.815, awards: 0.944, brief: 1 };
const FORK = 0.592;
let CAM = {}, ISK = [], route = null;
function buildTimeline() {
  const s = slotWorld;
  const head = [
    { p: 0.00, pos: V(0, 430, 330), look: V(0, 400, 200) },
    { p: 0.05, pos: V(0, 430, 330), look: V(0, 400, 200) },
    { p: 0.17, pos: V(30, 370, 250), look: V(0, 300, 80) },
    { p: 0.31, pos: V(6, s.y + 14, s.z + 70), look: s },
    { p: 0.37, pos: V(0, s.y - 4, s.z + 95), look: V(0, s.y - 10, 0) },
    { p: 0.43, pos: V(90, 220, 220), look: V(0, 170, 0) },
    { p: 0.48, pos: V(0, 30, 112), look: V(0, 30, 20) },
    { p: 0.502, pos: V(0, 30, 108), look: V(0, 30, 20) },
    { p: 0.528, pos: V(0, 34, 114), look: V(0, 150, 60) },
    { p: 0.552, pos: V(0, 24, 116), look: V(0, 95, 210) },
    { p: 0.572, pos: V(0, 15, 115), look: V(0, 20, 165) },
    { p: 0.585, pos: V(0, 15, 117), look: V(0, 20, 165) },
  ];
  const tail = [
    { p: 0.94, pos: V(0, 10, 745), look: V(19, 16, 780) },
    { p: 0.948, pos: V(0, 10, 750), look: V(19, 16, 780) },
    { p: 0.988, pos: V(0, 14, 880), look: V(0, 20, 940) },
    { p: 1.00, pos: V(0, 14, 888), look: V(0, 20, 940) },
  ];
  // btl идёт по земле от стенда к стенду: кейс в правой части кадра, рассказ слева
  const st = (p, z, d = 36, y = 12) => [{ p, pos: V(12, y, z - d), look: V(-3, 6, z) }, { p: p + 0.011, pos: V(12, y, z - d + 3), look: V(-3, 6, z) }];   // коридор камеры x=12: стенд справа в кадре, объект кейса перед ним по центру
  CAM.btl = [...head,
    { p: 0.612, pos: V(0, 14, 150), look: V(0, 13, 215) },
    { p: 0.632, pos: V(-8, 11, 192), look: V(22, 7, 214) },
    { p: 0.652, pos: V(-8, 11, 197), look: V(22, 7, 214) },
    ...st(0.668, Z.tb, 38, 13), ...st(0.695, Z.lion, 34, 11),
    { p: 0.713, pos: V(12, 12, Z.lion + 4), look: V(-3, 6, Z.iron) },
    { p: 0.724, pos: V(12, 10, Z.iron - 30), look: V(-3, 4, Z.iron) }, { p: 0.735, pos: V(12, 10, Z.iron - 27), look: V(-3, 4, Z.iron) },
    { p: 0.75, pos: V(13, 17, Z.silk - 34), look: V(-6, 9, Z.silk) }, { p: 0.763, pos: V(13, 16, Z.silk - 31), look: V(-6, 9, Z.silk) },
    ...st(0.779, Z.foot), ...st(0.803, Z.goose), ...st(0.826, Z.mega), ...st(0.849, Z.mice),
    ...MERCH.flatMap(([, , side, z], i) => { const c = vtCam(side, z); return [{ p: 0.868 + i * 0.016, pos: c, look: V(side * 6, 7, z) }, { p: 0.877 + i * 0.016, pos: c.clone().add(V(0, 0, 3)), look: V(side * 6, 7, z) }]; }),
    ...tail];
  // atl поднимается к экранам и этажам небоскрёбов
  const sa = (p, side, z) => { const c = atlCam(side, z); return [{ p, pos: c, look: V(side * 8, 95, z) }, { p: p + 0.012, pos: c.clone().add(V(0, 0, 3)), look: V(side * 8, 95, z) }]; };
  const sai = (p, side, z) => { const c = aiCam(side, z); return [{ p, pos: c, look: V(side * 10, 96, z) }, { p: p + 0.01, pos: c.clone().add(V(0, 0, 3)), look: V(side * 10, 96, z) }]; };
  const fl = (p, y0, z) => [{ p, pos: V(-15, y0 + 9, z - 12), look: V(-58, y0 + 6, z - 8) }, { p: p + 0.012, pos: V(-16, y0 + 9, z - 9), look: V(-58, y0 + 6, z - 8) }];   // этаж слева, рассказ справа
  CAM.atl = [...head,
    { p: 0.612, pos: V(0, 32, 172), look: V(-40, 45, 225) },
    ...fl(0.632, 40, 225), ...sa(0.66, 1, 282), ...fl(0.688, 52, 345),
    { p: 0.716, pos: V(-31.5, 86, 405), look: V(-69, 78, 405) }, { p: 0.731, pos: V(-33, 85.5, 405), look: V(-69, 78, 405) },
    ...sa(0.752, 1, 500), ...sa(0.778, -1, 545),
    ...sai(0.81, 1, 572), ...sai(0.836, -1, 602), ...sai(0.862, 1, 632), ...sai(0.888, -1, 662),
    { p: 0.918, pos: V(0, 40, 710), look: V(19, 16, 780) },
    ...tail];
  // камера летит по сплайну через ключи: без остановки на каждом, тормозит только там, где ключи стоят рядом
  for (const r of ['btl', 'atl']) {
    const k = CAM[r];
    k.pos = new THREE.CatmullRomCurve3(k.map(x => x.pos), false, 'centripetal');
    k.look = new THREE.CatmullRomCurve3(k.map(x => x.look), false, 'centripetal');
  }
  const sl = iskra.userData.slotScale;
  const narrow = innerWidth < 760, heroY = narrow ? 412 : 398, heroK = narrow ? 2.2 : 3.2;
  ISK = [
    { p: 0.00, pos: V(0, heroY, 230), scale: sl * heroK, spin: 0 },
    { p: 0.05, pos: V(0, heroY, 230), scale: sl * heroK, spin: 1.2 },
    { p: 0.19, pos: V(-14, 330, 170), scale: sl * 2.0, spin: 7 },
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
  asia: { t: 'другие азиатские кейсы', ids: ['fandom', 'tbank', 'treschnutye', 'izhora'] },
  sport: { t: 'другие спортивные кейсы', ids: ['lion', 'izhora', 'ironstar', 'gdrive', 'avangard', 'baltika7'] },
  event: { t: 'другие ивент-кейсы', ids: ['baltikaPlant', 'megafon', 'mice', 'megafonTravel'] },
  merch: { t: 'другие кейсы с мерчем', ids: ['selekt', 'gdriveMerch', 'oxygenSet', 'lionMerch'] },
  dixy: { t: 'другие кейсы «дикси»', ids: ['treschnutye', 'dino', 'zaklinateli'] },
  ai: { t: 'другие ai-ролики', ids: ['aiFonbet', 'aiMango', 'aiLavka', 'aiAlfa', 'ai'] },
};
// сторона рассказа — всегда напротив того, что показывает камера
const STORIES = [
  ['fandom', 0.60, 0.66, 'btl', 'right', ['asia'], true], ['tbank', 0.662, 0.69, 'btl', 'left', ['asia']], ['lion', 0.69, 0.716, 'btl', 'left', ['sport']],
  ['ironstar', 0.718, 0.742, 'btl', 'left', ['sport']], ['gdrive', 0.745, 0.772, 'btl', 'left', ['sport']], ['baltika7', 0.774, 0.797, 'btl', 'left', ['sport']],
  ['baltikaPlant', 0.799, 0.82, 'btl', 'left', ['event']], ['megafon', 0.822, 0.843, 'btl', 'left', ['event']], ['mice', 0.845, 0.863, 'btl', 'left', ['event']],
  ['selekt', 0.864, 0.88, 'btl', 'right', ['merch']], ['gdriveMerch', 0.88, 0.896, 'btl', 'left', ['merch']], ['oxygenSet', 0.896, 0.912, 'btl', 'right', ['merch']], ['lionMerch', 0.912, 0.93, 'btl', 'left', ['merch']],
  ['treschnutye', 0.626, 0.654, 'atl', 'right', ['dixy', 'asia']], ['izhora', 0.656, 0.682, 'atl', 'right', ['asia', 'sport']], ['dino', 0.684, 0.71, 'atl', 'right', ['dixy']],
  ['zaklinateli', 0.712, 0.744, 'atl', 'right', ['dixy']], ['derbent', 0.747, 0.772, 'atl', 'right'], ['tevredens', 0.774, 0.8, 'atl', 'left'],
  ['aiFonbet', 0.803, 0.826, 'atl', 'right', ['ai']], ['aiMango', 0.829, 0.852, 'atl', 'left', ['ai']], ['aiLavka', 0.855, 0.878, 'atl', 'right', ['ai']], ['aiAlfa', 0.881, 0.905, 'atl', 'left', ['ai']],
];
STORIES.forEach(([id, a, b, r, side, more, orbitBtn]) => {
  const c = CASES[id], el = document.createElement('section');
  el.className = `ov ${side} panel`; el.dataset.a = a; el.dataset.b = b; el.dataset.route = r; el.style.maxWidth = '460px';
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
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, r: el.dataset.route }));
const STAGES = [[0, '{00} вход'], [0.1, '{01} искра'], [0.35, '{01} кислород'], [0.45, '{02} шоурил'], [0.53, '{03} перекрёсток'], [0.6, '{04} btl · проспект', 'btl'], [0.6, '{05} atl · эфир', 'atl'], [0.8, '{05} ai-продакшн', 'atl'], [0.864, '{04} квартал мерча', 'btl'], [0.93, '{06} награды'], [0.975, '{07} бриф']];
const hudPct = document.getElementById('hudPct'), hudStage = document.getElementById('hudStage');
function updateOverlay(p) {
  ovs.forEach(o => {
    const f = 0.012, op = (o.r && o.r !== route) || (o.el.id === 'fork' && route) ? 0 : clamp01(Math.min(o.a === 0 ? 1 : (p - o.a) / f, (o.b - p) / f));
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
  ['{04}', 'ozon corp', 0.6, 'btl'], ['{04}', 'чёрный пояс по it', 0.662, 'btl'], ['{04}', 'синегривый лев', 0.69, 'btl'], ['{04}', 'ironstar', 0.718, 'btl'], ['{04}', 'шёлковый путь', 0.745, 'btl'], ['{04}', 'балтика 7', 0.774, 'btl'],
  ['{04}', 'гусь на заводе', 0.799, 'btl'], ['{04}', 'золотые ворота', 0.822, 'btl'], ['{04}', 'белград', 0.845, 'btl'], ['{04}', 'квартал мерча', 0.864, 'btl'],
  ['{05}', 'треснутые', 0.6, 'atl'], ['{05}', 'хроники ижоры', 0.656, 'atl'], ['{05}', 'дино', 0.684, 'atl'], ['{05}', 'заклинатели', 0.712, 'atl'], ['{05}', 'дербент', 0.747, 'atl'], ['{05}', 'tevredens', 0.774, 'atl'],
  ['{05}', 'ai · fonbet', 0.803, 'atl'], ['{05}', 'ai · mango', 0.829, 'atl'], ['{05}', 'ai · лавка', 0.855, 'atl'], ['{05}', 'ai · альфа', 0.881, 'atl'],
  ['{06}', 'награды', 0.93], ['{07}', 'бриф', 0.975]];
// пункт навигации кликабелен: прыжок к остановке, маршрут подставляется сам
const jumpTo = (p, r) => {
  closeModal(); if (orbitOn) closeOrbit(); if (r) route = r; else if (p > FORK && !route) route = 'btl';
  const max = document.documentElement.scrollHeight - innerHeight, t = Math.min(1, p + (p > 0.59 && p < 0.93 ? 0.012 : 0));
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
  const moreKey = !route || p < 0.6 || p > 0.93 ? null : route === 'atl' ? (p < 0.684 ? 'asia' : p < 0.745 ? 'dixy' : p > 0.8 ? 'ai' : null) : (p < 0.69 ? 'asia' : p < 0.798 ? 'sport' : p < 0.864 ? 'event' : 'merch');
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
  iskra.userData.key.position.copy(iskra.position).add(new THREE.Vector3(-30, 40, 60));
  iskra.userData.key.intensity = 260 * (1 - landed);

  // неон загорается с миганием, вентиляторы раздувают
  // после посадки свечение Искры гаснет до уровня логотипа: она становится его частью
  iskra.material.emissiveIntensity = 0.4 * (1 - landed);
  logo.mat.emissiveIntensity = landed * 1.1;
  logo.mat.color.copy(LOGO_DARK).lerp(ISK_RED, landed);
  iskra.material.color.copy(ISK_RED).lerp(ISK_BLACK, landed);
  logo.glow.intensity = 420;   // ровный тёплый свет на вывеску, без мигания
  fans.tip.visible = Math.sin(time * 3) > 0;
  fans.air.pts.visible = pSm < 0.5;   // поток воздуха нужен только у башни
  updateFans(dt, landed);

  updateWebtoon(time);
  updateQuarters(time);
  updateAtmosphere(time, dt);
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
buildCity(); buildTower(); await buildLogo(); buildSections(); buildAtmosphere(); buildTimeline();
window.__three = { renderer, scene };   // для отладки производительности
document.getElementById('loader').classList.add('done');
frame();
