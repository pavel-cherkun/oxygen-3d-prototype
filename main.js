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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a1f2e, 0.0026);
scene.background = skyTexture();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
  // отражения только у глянца, стекла, вывески и искры — матовые поверхности и асфальт остаются тёмными
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const set = (m, k) => { m.envMap = env; m.envMapIntensity = k; m.needsUpdate = true; };
  set(MAT.cream, 0.5); set(MAT.gloss, 0.6); set(MAT.glass, 0.8); set(MAT.glassO, 0.8);
  const later = () => { if (!logo.mat || !iskra) return setTimeout(later, 200); set(logo.mat, 0.45); set(iskra.material, 0.5); }; later();
});
scene.add(new THREE.HemisphereLight(0x5a6688, 0x140a0a, 0.55));
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
  cream: new THREE.MeshPhysicalMaterial({ color: CREAM, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  // стекло как в рефе 1: настоящее пропускание света, лёгкая матовость, тонировка в толще
  glass: new THREE.MeshPhysicalMaterial({ color: 0xff3a24, transmission: 1, thickness: 2.2, roughness: 0.18, ior: 1.45, attenuationColor: new THREE.Color(RED), attenuationDistance: 2.5, emissive: RED, emissiveIntensity: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  glassO: new THREE.MeshPhysicalMaterial({ color: 0xff7a2a, transmission: 1, thickness: 1.6, roughness: 0.24, ior: 1.45, attenuationColor: new THREE.Color(0xff5a10), attenuationDistance: 3, emissive: 0xff5a10, emissiveIntensity: 0.1, clearcoat: 1 }),
  gloss: new THREE.MeshPhysicalMaterial({ color: RED, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: RED, emissiveIntensity: 0.12 }),
};
// плиты разной толщины вокруг носителя — как в кинетическом 3D-наборе
function slabs(group, w, h, seed) {
  const r = mulberry(seed);
  for (let i = 0; i < 9; i++) {
    const m = [MAT.matte, MAT.glassO, MAT.cream, MAT.glass, MAT.glass, MAT.matte][(r() * 6) | 0];
    const sw = 1 + r() * 4, sh = h * (0.4 + r() * 0.9), sd = 0.8 + r() * 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), m);
    const side = r() < 0.5 ? -1 : 1;
    b.position.set(side * (w / 2 + sw / 2 - r() * 2), (r() - 0.5) * h * 0.5, -sd / 2 + r() * 1.5);
    group.add(b);
  }
}

// ---------- текстуры ----------
function windowsTexture(seed, redShare) {
  const r = mulberry(seed), c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#121319'; g.fillRect(0, 0, 128, 512);
  for (let y = 6; y < 512; y += 14) for (let x = 6; x < 128; x += 13) {
    const v = r();
    if (v < redShare) g.fillStyle = `rgba(255,${40 + r() * 40 | 0},${40 + r() * 30 | 0},${0.55 + r() * 0.45})`;
    else if (v < redShare + 0.08) g.fillStyle = `rgba(225,217,207,${0.25 + r() * 0.3})`;
    else g.fillStyle = '#191a22';
    g.fillRect(x, y, 8, 9);
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
function caseTexture(url, tint = true) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const g = c.getContext('2d');
  g.fillStyle = '#2a0506'; g.fillRect(0, 0, 512, 320);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image(); img.onload = () => {
    const s = Math.max(512 / img.width, 320 / img.height), w = img.width * s, h = img.height * s;
    g.drawImage(img, (512 - w) / 2, (320 - h) / 2, w, h);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff3a2a'; g.fillRect(0, 0, 512, 320); g.globalCompositeOperation = 'source-over'; }
    for (let y = 0; y < 320; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, 512, 1); }
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
  for (let x = -330; x <= 330; x += 26) for (let z = -330; z <= 920; z += 26) {
    if (Math.abs(x) < 20 && z > -20) continue;               // улица
    if (Math.abs(x) < 62 && Math.abs(z) < 42) continue;      // площадь у башни
    if (Math.abs(z - 150) < 15) continue;                    // перекрёсток
    if (Math.abs(x) < 40 && z > 165 && z < 618) continue;    // кварталы: тротуары шире под зоны
    if (Math.abs(x) < 20 && z > 830) continue;               // торец проспекта под бриф
    if (Math.abs(x) > 22 && Math.abs(x) < 80 && ATL_SCREENS.some(([, sd, zz]) => Math.sign(x) === sd && Math.abs(z - zz) < 28)) continue; // небоскрёбы atl
    if (rand() < 0.12) continue;
    const dist = Math.hypot(x, z * 0.8), near = Math.abs(x) < 50 && z > 0;
    const h = near ? 30 + rand() * 70 : 25 + rand() * (60 + Math.min(dist, 380) * 0.35);
    cells.push({ x: x + (rand() - .5) * 4, z: z + (rand() - .5) * 4, w: 14 + rand() * 8, d: 14 + rand() * 8, h, m: (rand() * 4) | 0 });
  }
  const dummy = new THREE.Object3D();
  mats.forEach((mat, mi) => {
    const list = cells.filter(c => c.m === mi);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((c, i) => { dummy.position.set(c.x, 0, c.z); dummy.scale.set(c.w, c.h, c.d); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    scene.add(im);
  });
  // акценты: плиты, рёбра, надстройки — три InstancedMesh по материалам
  const acc = { cream: [], glass: [], glassO: [], matte: [] };
  cells.forEach(c => {
    const toStreet = -Math.sign(c.x) || 1, r = rand;
    if (r() < 0.45) acc.cream.push([c.x + toStreet * (c.w / 2 + 0.6), c.h * (0.25 + r() * 0.3), c.z + (r() - .5) * c.d * 0.4, 1.2, c.h * (0.5 + r() * 0.55), c.d * (0.25 + r() * 0.35)]);
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
  cells.filter(c => Math.abs(c.x) < 60 && c.z > -10 && c.z < 820).forEach((c, i) => {
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
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  for (let z = 50; z < 830; z += 12) {
    if (z > 292 && z < 615) continue;   // в спортивном квартале — беговые дорожки
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: 0x3a3a44 }));
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
  }
  [80, 650, 720, 790].forEach((z, i) => {
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
  const cs = new THREE.Mesh(new THREE.BoxGeometry(8, TOWER.h * 0.82, 3), MAT.cream); cs.position.set(-TOWER.w / 2 - 2, TOWER.h * 0.41, TOWER.d / 2 - 4); scene.add(cs);
  [0, 5].forEach(dz => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.8, TOWER.h * 0.6, 6), MAT.glass); f.position.set(TOWER.w / 2 + 0.4, TOWER.h * 0.5, TOWER.d / 2 - 6 - dz * 3); scene.add(f); });
  [[-44, 60, 26, 9, MAT.glassO], [44, 150, 40, 7, MAT.glass], [-45, 190, 30, 5, MAT.glass]].forEach(([x, y, h, d, m]) => { const g = new THREE.Mesh(new THREE.BoxGeometry(3, h, d), m); g.position.set(x, y, TOWER.d / 2 - d / 2 + 2); scene.add(g); });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w + 4, 3, TOWER.d + 4), MAT.cream); cap.position.y = TOWER.h + 1.5; scene.add(cap);


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
  logo.mat = new THREE.MeshPhysicalMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
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
const ATL_SCREENS = [['treschnutye', -1, 222], ['izhora', 1, 282], ['zaklinateli', -1, 395], ['derbent', 1, 455]];
function buildSections() {
  const board = (tex, w, h, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.copy(pos); m.rotation.y = ry; scene.add(m); return m; };
  const frame = (w, h, pos, ry) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.6, h + 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(RED).multiplyScalar(2.5), toneMapped: false })); g.position.copy(pos); g.rotation.y = ry; g.translateZ(-0.05); scene.add(g); };

  // площадь: экран шоурила
  const video = Object.assign(document.createElement('video'), { src: 'assets/oxygen_promo_v2.mp4', muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: 'anonymous' });
  video.play().catch(() => addEventListener('pointerdown', () => video.play(), { once: true }));
  const vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
  const reelPos = V(0, 30, TOWER.d / 2 + 0.8);
  frame(64, 36, reelPos, 0);
  const reel = board(vtex, 64, 36, reelPos, 0); reel.position.z += 0.1; reel.userData.modal = 'reel'; clickable.push(reel);

  // перекрёсток: развилка
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x222228 })); gantry.position.set(0, 27, 150); scene.add(gantry);
  [-22, 22].forEach(x => { const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 27, 1.2), gantry.material); post.position.set(x, 13.5, 150); scene.add(post); });
  const sb = board(textTexture(['btl', 'проспект ↓ · продукт в руках'], { label: '{04} · oxygen' }), 20, 10, V(11, 21, 149.3), Math.PI); sb.userData.go = 'btl'; clickable.push(sb);
  const sa = board(textTexture(['atl', 'эфир ↑ · тв, наружка, digital'], { label: '{05} · oxygen' }), 20, 10, V(-11, 21, 149.3), Math.PI); sa.userData.go = 'atl'; clickable.push(sa);

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

  // atl: эфир над городом — гигантские экраны на небоскрёбах, на них кейсы
  const tmat = new THREE.MeshStandardMaterial({ color: 0x6a6c78, map: windowsTexture(55, 0.06), emissiveMap: windowsTexture(55, 0.06), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.7 });
  tmat.map.repeat.set(2, 4); tmat.emissiveMap.repeat.set(2, 4);
  ATL_SCREENS.forEach(([id, side, z]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(44, 150, 34), tmat); t.position.set(side * 50, 75, z); scene.add(t);
    const pos = V(side * 27.6, 95, z), ry = -side * Math.PI / 2, vert = id === 'izhora';
    const W = vert ? 16 : 40, H = vert ? 42 : 24;
    frame(W, H, pos, ry);
    const sg = new THREE.Group(); slabs(sg, W, H, z); sg.position.copy(pos); sg.rotation.y = ry; scene.add(sg);
    // ижора — вертикальный экран-вебтун, лента листается сама
    const scr = board(vert ? webtoonTexture() : caseTexture(`assets/cases/${CASES[id].how[0][0].split('/').pop()}`, false), W, H, pos, ry);
    if (vert) { scr.material.toneMapped = true; scr.material.color.setScalar(0.55); }
    scr.material.color.setScalar(1.15); scr.userData.case = id; clickable.push(scr);
    board(textTexture([CASES[id].title.split(' ')[0], CASES[id].awards[0] || CASES[id].pass.клиент], { label: '{05} · atl', w: 1024, h: 300 }), 40, 11.7, V(side * 27.6, vert ? 66 : 74, z), ry);
  });

  // награды
  board(textTexture(['16', 'металл: gold · silver · bronze'], { label: '{06} · награды', accent: 0 }), 44, 22, V(19.5, 18, 680), -Math.PI / 2);

  // о нас: команда на фасаде — лист портретов из гайдлайна 20_26: кроп в форме знака, ч/б с красным градиентом, роль моно сверху, имя под ней
  const ttex = texLoader.load('assets/team/team-guideline.jpg'); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = 8;
  const team = board(ttex, 48, 27, V(-19.5, 20, 740), Math.PI / 2);
  team.material.toneMapped = true; team.material.color.setScalar(0.95);

  // бриф
  board(textTexture(['бриф', 'ответим за рабочий день'], { label: '{08} · oxygen', bg: '#F40709', color: '#111111', accent: -1 }), 50, 25, V(0, 22, 840), Math.PI);
}

// ---------- кварталы на одной улице: азиатский → стык (хроники ижоры) → спортивный ----------
// у каждого квартала лаконичное, но яркое оформление: несколько крупных узнаваемых форм, а не мелкий декор
const Q = { asia: [168, 268], joint: 282, sport: [295, 420], event: [432, 520], ai: [532, 612] };
const webtoon = { tex: null };
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
function webtoonTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048; const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 512, 2048);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 0.5); webtoon.tex = tex;
  ['izhora-47-1', 'izhora-48-1', 'izhora-48-2'].forEach((n, i) => { const img = new Image(); img.onload = () => { const h = Math.min(512 * img.height / img.width, 660); g.drawImage(img, 0, i * 682 + (682 - h) / 2, 512, h); tex.needsUpdate = true; }; img.src = `assets/cases/${n}.jpg`; });
  return tex;
}
function plate(url, w, h, pos, ry, cls) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: caseTexture(url, false), toneMapped: false }));
  m.position.copy(pos); m.rotation.y = ry; scene.add(m); if (cls) { m.userData.case = cls; clickable.push(m); } return m;
}
function buildQuarters() {
  // ===== азиатский квартал: ворота поперёк проспекта, гирлянды фонарей, вертикальные вывески
  const gate = new THREE.Group();
  [-21, 21].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 24, 20), MAT.gloss); p.position.set(x, 12, 0); gate.add(p); });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(52, 2, 2.4), MAT.matte); t1.position.y = 24.6; gate.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 1.6), MAT.gloss); t2.position.y = 21; gate.add(t2);
  const t3 = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.6), MAT.cream); t3.position.y = 22.8; gate.add(t3);
  gate.position.set(0, 0, Q.asia[0] + 6); scene.add(gate);
  const lantGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12), lantMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.9 });
  const capGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12), wire = new THREE.LineBasicMaterial({ color: 0x2a2a30 });
  for (let z = Q.asia[0] + 18; z < Q.asia[1]; z += 13) {
    const pts = []; for (let i = 0; i <= 8; i++) { const x = -34 + i * 8.5, y = 25 - Math.sin(i / 8 * Math.PI) * 3; pts.push(V(x, y, z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
    pts.slice(1, -1).forEach((p, i) => {
      const l = new THREE.Mesh(lantGeo, lantMat); l.position.set(p.x, p.y - 1.4, z); scene.add(l);
      [0.95, -0.95].forEach(o => { const c = new THREE.Mesh(capGeo, MAT.matte); c.position.set(p.x, p.y - 1.4 + o, z); scene.add(c); });
    });
  }
  [['いらっしゃい', -36.5, 14, 190, '#F40709'], ['オゾン社', 36.5, 16, 200, '#E1D9CF'], ['漫画喫茶', -36.5, 15, 232, '#E1D9CF', '#F40709'], ['ガチャ', 36.5, 13, 248, '#F40709'], ['連続', 36.5, 20, 176, '#E1D9CF']]
    .forEach(a => vsign(...a));
  // ozon corp — на правом тротуаре (в кадре слева), лицом к проспекту
  diorama.position.set(24, 0, 214); diorama.rotation.y = 1.94;
  const al = new THREE.PointLight(0xff3a2a, 140, 45, 2); al.position.set(-10, 14, 225); scene.add(al);
  const al2 = new THREE.PointLight(0xffe8dc, 160, 40, 2); al2.position.set(10, 16, 205); scene.add(al2);

  // ===== спортивный квартал: беговые дорожки на асфальте, мачты прожекторов, финишная арка, табло, пьедестал, купола
  const lane = new THREE.MeshBasicMaterial({ color: 0xd8d0c6 }), laneR = new THREE.MeshBasicMaterial({ color: RED });
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
  arch.position.set(0, 0, Q.sport[0] + 10); scene.add(arch);
  // мачты прожекторов
  for (let z = Q.sport[0] + 20; z < Q.sport[1]; z += 34) [-34, 34].forEach(x => {
    const m = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1, 42, 1), MAT.matte); pole.position.y = 21; m.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 1), MAT.matte); head.position.set(0, 43, 0); m.add(head);
    const lamps = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2e4).multiplyScalar(2.2), toneMapped: false })); lamps.position.set(0, 43, 0.55); m.add(lamps);
    m.position.set(x, 0, z); m.rotation.y = x > 0 ? -Math.PI / 2 - 0.3 : Math.PI / 2 + 0.3; m.lookAt(0, 43, z + 20); scene.add(m);
  });
  const sl = new THREE.PointLight(0xfff2e4, 520, 70, 1.8); sl.position.set(0, 26, 345); scene.add(sl);
  // табло: g-drive шёлковый путь и авангард
  const sb = new THREE.Group();
  const sbBack = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 30), MAT.matte); sb.add(sbBack);
  slabs(sb, 30, 18, 99); sb.children.slice(1).forEach(b => { b.rotation.y = Math.PI / 2; b.position.set(-b.position.z, b.position.y, b.position.x); });
  sb.position.set(31, 22, 340); scene.add(sb);
  plate('assets/cases/gdrive-silk-road-1.jpg', 28, 16, V(29.9, 22, 340), -Math.PI / 2, 'gdrive');
  plate('assets/cases/avangard-1.jpg', 16, 22, V(-36.4, 15, 330), Math.PI / 2, 'avangard');
  // пьедестал 1-2-3 — кремовый глянец
  [[0, 5, '1'], [-6, 3.4, '2'], [6, 2.2, '3']].forEach(([x, h, n]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, h, 5), MAT.cream); b.position.set(-24, h / 2, 362 + x); scene.add(b);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: textTexture([n], { w: 256, h: 256, bg: '#E1D9CF', color: '#F40709' }) })); t.position.set(-21.15, h - 1.4, 362 + x); t.rotation.y = Math.PI / 2; scene.add(t);
  });
  plate('assets/cases/gdrive-ironstar-1.jpg', 12, 16, V(-36.4, 12, 366), Math.PI / 2, 'ironstar');
  // купола «балтики 7» — чм-2018
  const domes = new THREE.Group();
  [[-7, 0, 6, RED], [6, -3, 5, CREAM], [2, 8, 4, RED]].forEach(([x, z, r, col]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), col === RED ? MAT.gloss : MAT.cream); d.position.set(x, 0, z); domes.add(d); });
  domes.position.set(22, 0, 398); domes.userData.case = 'baltika7'; scene.add(domes); clickable.push(domes);
  plate('assets/cases/baltika7-domes-1.jpg', 16, 10, V(36.4, 12, 404), -Math.PI / 2, 'baltika7');
  // ===== ивент-квартал: ферма поперёк улицы, светодиодная стена, лучи прожекторов, лапки гуся на асфальте
  const truss = new THREE.Group();
  const bar = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.matte); b.position.set(x, y, z); truss.add(b); };
  [-20, 20].forEach(x => { bar(1.4, 22, 1.4, x, 11, -1); bar(1.4, 22, 1.4, x, 11, 1); });
  bar(42, 1.4, 1.4, 0, 22, -1); bar(42, 1.4, 1.4, 0, 22, 1); bar(42, 1.4, 1.4, 0, 19, 0);
  for (let x = -19; x <= 19; x += 2.6) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), MAT.cream); d.position.set(x, 20.5, 0); d.rotation.z = (x % 5.2 > 0 ? 1 : -1) * 0.6; truss.add(d); }
  truss.position.set(0, 0, Q.event[0]); scene.add(truss);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  [-16, -6, 6, 16].forEach((x, i) => { const c = new THREE.Mesh(new THREE.ConeGeometry(5, 21, 24, 1, true), beamMat); c.position.set(x, 10.5, Q.event[0] + 0.5); c.rotation.z = (i % 2 ? 1 : -1) * 0.25; scene.add(c); });
  const wall = new THREE.Group();
  const wb = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 34), MAT.matte); wb.position.y = 13; wall.add(wb);
  wall.position.set(-33, 0, 470); scene.add(wall);
  plate('assets/cases/megafon-zone-1.jpg', 16, 10, V(-31.9, 18, 462), Math.PI / 2, 'megafon');
  plate('assets/cases/baltika-plant-1.jpg', 16, 10, V(-31.9, 18, 479), Math.PI / 2, 'baltikaPlant');
  plate('assets/cases/mice-1.jpg', 16, 10, V(-31.9, 7.5, 470.5), Math.PI / 2, 'mice');
  const stage = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 30), MAT.cream); stage.position.set(-25, 0.8, 470); scene.add(stage);
  // лапки гуся: как на заводе «балтики», ведут вдоль квартала
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d'); pg.fillStyle = '#F40709';
  pg.beginPath(); pg.moveTo(64, 120); pg.lineTo(14, 30); pg.lineTo(40, 22); pg.lineTo(64, 60); pg.lineTo(88, 22); pg.lineTo(114, 30); pg.closePath(); pg.fill();
  const pt = new THREE.CanvasTexture(pc); const pm = new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false });
  for (let z = Q.event[0] + 6, k = 0; z < Q.event[1]; z += 4, k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), pm); p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI; p.position.set((k % 2 ? 1.2 : -1.2) + Math.sin(z * 0.08) * 6, 0.07, z); scene.add(p); }
  plate('assets/cases/megafon-travel-1.jpg', 14, 18, V(36.4, 12, 490), -Math.PI / 2, 'megafonTravel');
  const el = new THREE.PointLight(0xfff0e0, 380, 50, 2); el.position.set(-12, 18, 470); scene.add(el);

  // ===== ai-квартал: белая циклорама посреди ночного города, ролики на парящих плитах
  const cyc = new THREE.MeshStandardMaterial({ color: 0xe9e3da, roughness: 0.75, side: THREE.DoubleSide, emissive: 0xe9e3da, emissiveIntensity: 0.18 });
  const floorC = new THREE.Mesh(new THREE.PlaneGeometry(52, Q.ai[1] - Q.ai[0]), cyc); floorC.rotation.x = -Math.PI / 2; floorC.position.set(0, 0.08, (Q.ai[0] + Q.ai[1]) / 2); scene.add(floorC);
  [-1, 1].forEach(sd => {   // плавный загиб пола в стену, как у студийной циклорамы
    const cv = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, Q.ai[1] - Q.ai[0], 24, 1, true, sd > 0 ? 0 : Math.PI * 1.5, Math.PI / 2), cyc);
    cv.rotation.x = Math.PI / 2; cv.rotation.y = 0; cv.position.set(sd * 26, 10, (Q.ai[0] + Q.ai[1]) / 2); cv.rotation.z = sd > 0 ? 0 : 0; scene.add(cv);
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(Q.ai[1] - Q.ai[0], 30), cyc); wl.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; wl.position.set(sd * 36, 25, (Q.ai[0] + Q.ai[1]) / 2); scene.add(wl);
  });
  const aiL = new THREE.PointLight(0xffffff, 900, 90, 1.6); aiL.position.set(0, 30, (Q.ai[0] + Q.ai[1]) / 2); scene.add(aiL);
  aiClips.length = 0;
  ['fonbet', 'mango', 'lavka', 'alfa'].forEach((n, i) => {
    const v = Object.assign(document.createElement('video'), { src: `assets/ai-${n}.mp4`, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
    const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(10.4, 6.2, 0.8), i % 2 ? MAT.matte : MAT.gloss); back.position.z = -0.45; g.add(back);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), new THREE.MeshBasicMaterial({ map: vt, toneMapped: false })); g.add(sc);
    sc.userData.case = 'ai'; clickable.push(sc);
    const side = i % 2 ? 1 : -1;
    g.position.set(side * 11, 7 + (i % 3) * 2.5, Q.ai[0] + 22 + i * 13); g.rotation.y = Math.PI - side * 0.55;
    scene.add(g); aiClips.push({ g, v, y: g.position.y, ph: i * 1.7 });
  });

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
  aiClips.forEach(c => {
    c.g.position.y = c.y + Math.sin(time * 0.7 + c.ph) * 0.6;
    const near = c.g.position.distanceTo(camera.position) < 140;
    if (near && c.v.paused) c.v.play().catch(() => {}); else if (!near && !c.v.paused) c.v.pause();
  });
  // кинетический набор: чем дальше камера, тем сильнее буквы разъезжаются в глубину; вблизи строка собирается
  kinetic.forEach(k => {
    k.outer.getWorldPosition(_wp); const d = clamp01((_wp.distanceTo(camera.position) - 25) / 110);
    k.inner.children.forEach(m => { const n = m.userData.n, s = (n % 2 ? 1 : -1) * (1 + n * 0.6); m.position.y = m.userData.base.y + s * d * 0.9; m.rotation.x = s * d * 0.25; });
  });
}

// ---------- сценарий скролла ----------
// p — доля прокрутки 0..1. Между ключами — плавная интерполяция, поэтому на каждом ключе камера как бы «присаживается»
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GO = { reel: 0.48, cross: 0.57, btl: 0.62, alley: 0.655, sport: 0.742, event: 0.837, ai: 0.867, atl: 0.66, awards: 0.91, about: 0.95, brief: 1 };
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
    { p: 0.86, pos: V(0, 12, 536), look: V(0, 9, 595) },
    { p: 0.874, pos: V(0, 12, 543), look: V(0, 9, 600) },
    { p: 0.905, pos: V(0, 10, 645), look: V(19, 16, 680) },
    { p: 0.918, pos: V(0, 10, 650), look: V(19, 16, 680) },
    { p: 0.945, pos: V(0, 12, 705), look: V(-19, 18, 740) },
    { p: 0.958, pos: V(0, 12, 708), look: V(-19, 18, 740) },
    { p: 0.985, pos: V(0, 14, 780), look: V(0, 20, 840) },
    { p: 1.00, pos: V(0, 14, 788), look: V(0, 20, 840) },
  ];
  // две ветки после перекрёстка: btl идёт по земле вдоль зон, atl поднимается к экранам небоскрёбов
  CAM.btl = [...head,
    { p: 0.615, pos: V(0, 14, 150), look: V(0, 13, 215) },
    { p: 0.645, pos: V(-8, 11, 192), look: V(22, 7, 214) },
    { p: 0.672, pos: V(-8, 11, 197), look: V(22, 7, 214) },
    { p: 0.71, pos: V(0, 12, 285), look: V(0, 12, 330) },
    { p: 0.735, pos: V(-6, 15, 318), look: V(30, 18, 342) },
    { p: 0.75, pos: V(-6, 15, 321), look: V(30, 18, 342) },
    { p: 0.77, pos: V(4, 13, 345), look: V(-28, 10, 364) },
    { p: 0.782, pos: V(4, 13, 348), look: V(-28, 10, 364) },
    { p: 0.803, pos: V(-8, 13, 372), look: V(24, 6, 400) },
    { p: 0.815, pos: V(-8, 13, 375), look: V(24, 6, 400) },
    { p: 0.832, pos: V(10, 13, 440), look: V(-26, 12, 470) },
    { p: 0.843, pos: V(10, 13, 446), look: V(-26, 12, 472) },
    ...tail];
  CAM.atl = [...head,
    { p: 0.635, pos: V(0, 60, 150), look: V(-28, 95, 222) },
    { p: 0.66, pos: V(0, 88, 180), look: V(-28, 95, 222) },
    { p: 0.678, pos: V(0, 88, 184), look: V(-28, 95, 222) },
    { p: 0.705, pos: V(0, 92, 240), look: V(28, 95, 282) },
    { p: 0.72, pos: V(0, 92, 244), look: V(28, 95, 282) },
    { p: 0.75, pos: V(0, 88, 355), look: V(-28, 95, 395) },
    { p: 0.765, pos: V(0, 88, 358), look: V(-28, 95, 395) },
    { p: 0.795, pos: V(0, 88, 415), look: V(28, 95, 455) },
    { p: 0.81, pos: V(0, 88, 418), look: V(28, 95, 455) },
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
  asia: { t: 'другие азиатские кейсы', ids: ['fandom', 'treschnutye', 'izhora'] },
  sport: { t: 'другие спортивные кейсы', ids: ['gdrive', 'ironstar', 'avangard', 'baltika7', 'izhora'] },
  event: { t: 'другие ивент-кейсы', ids: ['megafon', 'baltikaPlant', 'mice', 'megafonTravel'] },
};
const STORIES = [
  ['fandom', 0.60, 0.69, 'btl', 'right', 'asia', true], ['gdrive', 0.722, 0.758, 'btl', 'left', 'sport'], ['ironstar', 0.762, 0.79, 'btl', 'right', 'sport'],
  ['baltika7', 0.795, 0.822, 'btl', 'left', 'sport'], ['baltikaPlant', 0.826, 0.85, 'btl', 'left', 'event'],
  ['treschnutye', 0.648, 0.69, 'atl', 'right', 'asia'], ['izhora', 0.694, 0.73, 'atl', 'left', 'sport'], ['zaklinateli', 0.738, 0.775, 'atl', 'right'], ['derbent', 0.782, 0.822, 'atl', 'left'],
];
STORIES.forEach(([id, a, b, r, side, more, orbitBtn]) => {
  const c = CASES[id], el = document.createElement('section');
  el.className = `ov ${side} panel`; el.dataset.a = a; el.dataset.b = b; el.dataset.route = r; el.style.maxWidth = '430px';
  el.innerHTML = `<span class="t">${r === 'btl' ? '{04} btl · на проспекте' : '{05} atl · в эфире'} · ${c.pass.клиент} · ${c.pass.год}</span>
    <h2>${c.title}</h2>
    <p><span class="t">задача</span><br>${c.task}</p>
    <p style="margin-top:10px"><span class="t">идея</span><br>${c.idea}</p>
    ${c.result[0][0] !== '—' ? `<div class="nums" style="grid-template-columns:1fr 1fr"><div><b>${c.result[0][0]}</b><span class="t">${c.result[0][1]}</span></div>${c.awards[0] ? `<div><b>${c.awards.length}</b><span class="t">${c.awards.length > 1 ? 'награды' : 'награда'} · ${c.awards[0]}</span></div>` : ''}</div>` : ''}
    <button class="btn" data-case="${id}">кейс целиком</button>${orbitBtn ? ' <button class="btn ghost" id="openOrbit">покрутить в 3D ↻</button>' : ''}
    ${more ? `<p class="t" style="margin-top:12px"><a href="#" data-more="${more}" style="color:inherit">${MORE[more].t} →</a></p>` : ''}`;
  document.body.insertBefore(el, document.getElementById('orbitUi'));
});
MODALS.more = key => `<span class="t">{кейсы}</span><h1>${MORE[key].t.replace('другие ', '')}</h1><div class="list" style="max-width:720px">${MORE[key].ids.map(id => `<button data-case="${id}"><span>${CASES[id].title} · ${CASES[id].pass.клиент}</span><span class="t">${CASES[id].dir} · ${CASES[id].pass.год}</span></button>`).join('')}</div>`;

// ---------- HTML-слой ----------
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, r: el.dataset.route }));
const STAGES = [[0, '{00} вход'], [0.1, '{01} искра'], [0.35, '{01} кислород'], [0.45, '{02} шоурил'], [0.53, '{03} перекрёсток'], [0.6, '{04} btl · проспект', 'btl'], [0.6, '{05} atl · эфир', 'atl'], [0.85, '{06} ai-квартал'], [0.89, '{07} награды'], [0.93, '{08} о нас'], [0.97, '{09} бриф']];
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
}
const modal = document.getElementById('modal'), modalBody = document.getElementById('modalBody');
const openModal = html => { modalBody.innerHTML = html; modal.classList.add('on'); modal.scrollTop = 0; };
const closeModal = () => modal.classList.remove('on');
document.getElementById('modalClose').addEventListener('click', closeModal);
const routeBtn = document.getElementById('routeBtn');
const WORD = { reel: 'фильм', cross: 'развилка', btl: 'btl', alley: 'азиатский квартал', sport: 'спорт', event: 'ивент', ai: 'ai', atl: 'atl', awards: 'награды', about: 'о нас', brief: 'бриф' };
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
const INDEX = [['{00}', 'вход', 0], ['{01}', 'искра', 0.1], ['{02}', 'фильм', 0.45], ['{03}', 'развилка', 0.53], ['{04}', 'ozon corp', 0.6, 'btl'], ['{04}', 'шёлковый путь', 0.72, 'btl'], ['{04}', 'ironstar', 0.76, 'btl'], ['{04}', 'балтика 7', 0.79, 'btl'], ['{04}', 'гусь на заводе', 0.825, 'btl'], ['{05}', 'треснутые', 0.6, 'atl'], ['{05}', 'хроники ижоры', 0.692, 'atl'], ['{05}', 'заклинатели', 0.735, 'atl'], ['{05}', 'дербент', 0.778, 'atl'], ['{06}', 'ai-квартал', 0.85], ['{07}', 'награды', 0.89], ['{08}', 'о нас', 0.93], ['{09}', 'бриф', 0.97]];
let lastStage = '', sqT = 0, frameN = 0;
function hud2d(p, time) {
  frameN++;
  const cur = INDEX.filter(s => p >= s[2] && (!s[3] || s[3] === route)).pop();
  const moreKey = route && p > 0.59 && p < 0.86 ? (p < 0.7 ? 'asia' : p < 0.822 ? 'sport' : 'event') : null;
  const html = INDEX.filter(s => !s[3] || !route || s[3] === route).map(s => `<div class="${s === cur ? 'on' : ''}">${s[0]} ${s[1]}${s === cur ? ' ←' : ''}</div>`).join('') + (moreKey ? `<div style="margin-top:8px;pointer-events:auto"><a href="#" data-more="${moreKey}" style="color:var(--cream)">${MORE[moreKey].t} →</a></div>` : '');
  if (html !== micro._h) { micro.innerHTML = html; micro._h = html; }
  if (frameN % 6 === 0) microL.innerHTML = `cam ${camera.position.x.toFixed(1)} · ${camera.position.y.toFixed(1)} · ${camera.position.z.toFixed(1)}<br>fov ${camera.fov} · f ${String(frameN).padStart(6, '0')}<br>маршрут ${route || '—'} · p ${p.toFixed(3)}`;
  if (time - sqT > 1.1) {   // квадраты перескакивают по узлам сетки
    sqT = time; const cell = innerWidth / 12;
    sqs.forEach((q, i) => { q.style.left = (Math.round(Math.random() * 12) * cell - 3) + 'px'; q.style.top = (Math.round(Math.random() * innerHeight / cell) * cell - 3) + 'px'; });
  }
  if (cur && cur[1] !== lastStage) {
    if (lastStage) { wipe.textContent = cur[1] + ' ' + cur[0]; wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go'); }
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

const ISK_RED = new THREE.Color(RED), ISK_BLACK = new THREE.Color(0x0d0d0f);
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
  iskra.material.color.copy(ISK_RED).lerp(ISK_BLACK, landed);
  logo.glow.intensity = 420;   // ровный тёплый свет на вывеску, без мигания
  fans.tip.visible = Math.sin(time * 3) > 0;
  fans.air.pts.visible = pSm < 0.5;   // поток воздуха нужен только у башни
  updateFans(dt, landed);

  if (webtoon.tex) webtoon.tex.offset.y = (time * 0.035) % 1;
  updateQuarters(time);
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
buildCity(); buildTower(); await buildLogo(); buildSections(); buildTimeline();
document.getElementById('loader').classList.add('done');
frame();
