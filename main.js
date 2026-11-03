// Прототип 3D-главной Oxygen: Искра падает в неоновый логотип на башне, дальше скролл ведёт по улице к разделам.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  glass: new THREE.MeshPhysicalMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.35, roughness: 0.12, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }),
  gloss: new THREE.MeshPhysicalMaterial({ color: RED, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: RED, emissiveIntensity: 0.12 }),
};
// плиты разной толщины вокруг носителя — как в кинетическом 3D-наборе
function slabs(group, w, h, seed) {
  const r = mulberry(seed);
  for (let i = 0; i < 9; i++) {
    const m = [MAT.matte, MAT.matte, MAT.cream, MAT.glass, MAT.matte][(r() * 5) | 0];
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
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mats = [0.10, 0.18, 0.05, 0.25].map((share, i) => {
    const tex = windowsTexture(100 + i, share); tex.repeat.set(2, 3);
    return new THREE.MeshStandardMaterial({ color: 0x8a8a96, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.85, metalness: 0.1 });
  });
  const cells = [];
  for (let x = -330; x <= 330; x += 26) for (let z = -330; z <= 760; z += 26) {
    if (Math.abs(x) < 20 && z > -20) continue;               // улица
    if (Math.abs(x) < 62 && Math.abs(z) < 42) continue;      // площадь у башни
    if (Math.abs(z - 150) < 15) continue;                    // перекрёсток
    if (x < -18 && x > -116 && Math.abs(z - ALLEY.z) < 10) continue;   // переулок
    if (x < -98 && x > -182 && z > 214 && z < 296) continue;            // площадь
    if (Math.abs(x) < 20 && z > 690) continue;               // торец проспекта под бриф
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
  // экраны на фасадах вдоль улицы — на них крутятся наши кейсы
  const screens = [];
  cells.filter(c => Math.abs(c.x) < 50 && c.z > -10 && c.z < 680).forEach((c, i) => {
    if (rand() < 0.35) return;
    const tw = 7 + rand() * 6, th = tw * (rand() < .5 ? 0.62 : 1.6);
    const mat = new THREE.MeshBasicMaterial({ map: caseTexture(CASE_IMGS[i % CASE_IMGS.length]), toneMapped: false });
    mat.color.setScalar(1.6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), mat);
    const side = Math.sign(c.x) || 1;
    m.position.set(c.x - side * (c.w / 2 + 0.2), Math.min(c.h - th / 2 - 2, 10 + rand() * 40), c.z);
    m.rotation.y = -side * Math.PI / 2;
    scene.add(m); screens.push(m);
  });
  // неоновые вертикальные вывески
  const neonMat = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }); neonMat.color.multiplyScalar(3);
  for (let i = 0; i < 70; i++) {
    const c = cells[(rand() * cells.length) | 0]; if (Math.abs(c.x) > 120) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6 + rand() * 18, 0.6), neonMat);
    m.position.set(c.x + c.w / 2 * (rand() < .5 ? 1 : -1), 8 + rand() * c.h * 0.7, c.z + c.d / 2);
    scene.add(m);
  }
  // мокрая улица
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.35, metalness: 0.6 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  for (let z = 50; z < 690; z += 12) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: 0x3a3a44 }));
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
  }
  [80, 170, 260, 350, 440, 520, 600, 660].forEach((z, i) => {
    const pl = new THREE.PointLight(i % 2 ? RED : 0xff5533, 420, 60, 1.8); pl.position.set(i % 2 ? 12 : -12, 14, z); scene.add(pl);
  });
}

// ---------- башня, вентиляторы, логотип ----------
const fans = { blades: null, list: [], speed: 0.6 };
function buildTower() {
  const tex = windowsTexture(7, 0.04); tex.repeat.set(2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6c78, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.d), mat); body.position.y = TOWER.h / 2; scene.add(body);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w * 0.7, 18, TOWER.d * 0.7), mat); crown.position.y = TOWER.h + 9; scene.add(crown);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 40), new THREE.MeshStandardMaterial({ color: 0x333333 })); mast.position.y = TOWER.h + 38; scene.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4), new THREE.MeshBasicMaterial({ color: RED, toneMapped: false })); tip.position.y = TOWER.h + 59; scene.add(tip); fans.tip = tip;
  // красная кромка по углам
  const edge = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }); edge.color.multiplyScalar(2.5);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.8, TOWER.h, 0.8), edge); e.position.set(sx * TOWER.w / 2, TOWER.h / 2, sz * TOWER.d / 2); scene.add(e);
  });

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
  scene.add(pts); fans.air.mat = pts.material;
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
  fans.housing.material.emissiveIntensity = power * 2.2;
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
  logo.mat = new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: RED, emissiveIntensity: 0.05, roughness: 0.4, side: THREE.DoubleSide });
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
  const igeo = new THREE.ExtrudeGeometry(iShape, { depth: 18, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 1.6, bevelSegments: 3, curveSegments: 6 });
  igeo.translate(0, 0, -9); igeo.computeVertexNormals();
  const imat = new THREE.MeshPhysicalMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  iskra = new THREE.Mesh(igeo, imat);
  iskra.userData.slotScale = S * 0.9;
  scene.add(iskra);
  const key = new THREE.PointLight(0xffe0d0, 260, 0, 1.2); scene.add(key); iskra.userData.key = key;
  logo.group.updateMatrixWorld(true);
  slotWorld.set(icx - cx, icy - cy, depth / 2).applyMatrix4(logo.group.matrixWorld);
  const glow = new THREE.PointLight(RED, 0, 120, 1.6); glow.position.copy(slotWorld).add(new THREE.Vector3(0, -6, 40)); scene.add(glow); logo.glow = glow;
}

// ---------- разделы на улице ----------
// проспект (z растёт от башни): площадь с шоурилом → перекрёсток btl/atl → btl на земле → atl «в эфире» на небоскрёбах → награды → о нас → бриф
const BTL_Z = 215;
const diorama = new THREE.Group();
const clickable = [];
const ATL_SCREENS = [['treschnutye', -1, 335], ['zaklinateli', 1, 395], ['derbent', -1, 455]];
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
  diorama.position.set(-142, 0, 240); diorama.rotation.y = -1.2;
  const zl = new THREE.PointLight(0xffe8dc, 420, 45, 2); zl.position.set(10, 16, 6); diorama.add(zl); diorama.userData.case = 'fandom'; scene.add(diorama); clickable.push(diorama);
  // если рядом лежит модель зоны (glb), она заменяет коллаж из кадров
  new GLTFLoader().loadAsync('assets/models/ozon-corp.glb').then(gltf => {
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0; } });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(34 / Math.max(size.x, size.z));
    box.setFromObject(model); const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, 1.2 - box.min.y, -c.z);
    diorama.children.forEach(ch => { if (ch !== floor && !ch.isLight) ch.visible = false; });
    diorama.add(model);
  }).catch(() => {});

  buildAlley();

  // ещё две btl-зоны на проспекте: ozon селект и купола «балтики 7»
  const sel = new THREE.Group();
  const sf = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 14), floor.material); sf.position.y = 0.5; sel.add(sf);
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(26, 14.6), new THREE.MeshStandardMaterial({ map: caseTexture('assets/cases/ozon-select-1.jpg', false), emissiveMap: caseTexture('assets/cases/ozon-select-1.jpg', false), emissive: 0xffffff, emissiveIntensity: 0.7 }));
  sw.position.set(0, 8.3, -6.8); sel.add(sw);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(8, 9, 0.4), new THREE.MeshStandardMaterial({ color: 0xbfe8dd, transparent: true, opacity: 0.35, emissive: 0x7fd8c0, emissiveIntensity: 0.4 })); glass.position.set(6, 5.5, 2); sel.add(glass);
  sel.position.set(-8, 0, 300); sel.rotation.y = Math.PI - 0.45; scene.add(sel);
  const domes = new THREE.Group();
  [[-7, 0, 6, RED], [6, -3, 5, CREAM], [2, 8, 4, RED]].forEach(([x, z, r, col]) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.4 }));
    d.position.set(x, 0, z); domes.add(d);
  });
  const db = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial({ map: caseTexture('assets/cases/baltika7-domes-1.jpg', false), toneMapped: false })); db.position.set(-4, 14, -6); domes.add(db);
  domes.position.set(8, 0, 385); domes.rotation.y = -0.4; scene.add(domes);

  // atl: эфир над городом — гигантские экраны на небоскрёбах, на них кейсы
  const tmat = new THREE.MeshStandardMaterial({ color: 0x6a6c78, map: windowsTexture(55, 0.06), emissiveMap: windowsTexture(55, 0.06), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.7 });
  tmat.map.repeat.set(2, 4); tmat.emissiveMap.repeat.set(2, 4);
  ATL_SCREENS.forEach(([id, side, z]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(44, 150, 34), tmat); t.position.set(side * 50, 75, z); scene.add(t);
    const pos = V(side * 27.6, 95, z), ry = -side * Math.PI / 2;
    frame(40, 24, pos, ry);
    const sg = new THREE.Group(); slabs(sg, 40, 24, z); sg.position.copy(pos); sg.rotation.y = ry; scene.add(sg);
    const scr = board(caseTexture(`assets/cases/${CASES[id].how[0][0].split('/').pop()}`, false), 40, 24, pos, ry);
    scr.material.color.setScalar(1.15); scr.userData.case = id; clickable.push(scr);
    board(textTexture([CASES[id].title.split(' ')[0], CASES[id].awards[0]], { label: '{05} · atl', w: 1024, h: 300 }), 40, 11.7, V(side * 27.6, 74, z), ry);
  });

  // награды
  board(textTexture(['16', 'металл: gold · silver · bronze'], { label: '{06} · награды', accent: 0 }), 44, 22, V(19.5, 18, 540), -Math.PI / 2);

  // о нас: команда на фасаде — лист портретов из гайдлайна 20_26: кроп в форме знака, ч/б с красным градиентом, роль моно сверху, имя под ней
  const ttex = texLoader.load('assets/team/team-guideline.jpg'); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = 8;
  const team = board(ttex, 48, 27, V(-19.5, 20, 600), Math.PI / 2);
  team.material.toneMapped = true; team.material.color.setScalar(0.95);

  // бриф
  board(textTexture(['бриф', 'ответим за рабочий день'], { label: '{08} · oxygen', bg: '#F40709', color: '#111111', accent: -1 }), 50, 25, V(0, 22, 700), Math.PI);
}

// ---------- азиатский переулок: ozon corp, хроники ижоры, треснутые ----------
const ALLEY = { z: 250, x0: -20, x1: -112 };
const webtoon = { tex: null };
function buildAlley() {
  // ворота на входе — две стойки и две балки, глянцевый красный и матовый чёрный
  const gate = new THREE.Group();
  [-6.5, 6.5].forEach(dz => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 16, 16), MAT.gloss); p.position.set(0, 8, dz); gate.add(p); });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 18), MAT.matte); top.position.y = 16.4; gate.add(top);
  const top2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 15), MAT.gloss); top2.position.y = 14; gate.add(top2);
  gate.position.set(ALLEY.x0 - 2, 0, ALLEY.z); scene.add(gate);
  // фонари и провода вдоль переулка
  const lantGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12), lantMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.9 });
  const capMat = MAT.matte, capGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12);
  const wire = new THREE.LineBasicMaterial({ color: 0x2a2a30 });
  for (let x = ALLEY.x0 - 6; x > ALLEY.x1; x -= 7) {
    [-6.2, 6.2].forEach((dz, k) => {
      const y = 8.5 + ((x * 7 + k * 3) % 3);
      const l = new THREE.Mesh(lantGeo, lantMat); l.position.set(x, y, ALLEY.z + dz * 0.75); scene.add(l);
      [0.95, -0.95].forEach(o => { const c = new THREE.Mesh(capGeo, capMat); c.position.set(x, y + o, ALLEY.z + dz * 0.75); scene.add(c); });
    });
    const g = new THREE.BufferGeometry().setFromPoints([V(x + 3, 13, ALLEY.z - 9), V(x + 1, 11.5, ALLEY.z), V(x - 1, 13.5, ALLEY.z + 9)]);
    scene.add(new THREE.Line(g, wire));
  }
  // вертикальные вывески: японский и корейский, как в наших кейсах
  const vsign = (txt, x, y, z, side, col, bg = '#111111') => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 512); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, 116, 500);
    g.fillStyle = col; g.font = '700 84px "Hiragino Sans","Apple SD Gothic Neo","Noto Sans CJK JP",sans-serif'; g.textAlign = 'center';
    [...txt].forEach((ch, i) => g.fillText(ch, 64, 100 + i * 96));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 10.4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.material.color.setScalar(col === '#E1D9CF' ? 0.85 : 1.3);
    m.position.set(x, y, z); m.rotation.y = side > 0 ? Math.PI : 0; scene.add(m);
  };
  vsign('いらっしゃい', -28, 12, ALLEY.z - 8.6, -1, '#F40709');
  vsign('オゾン社', -44, 13, ALLEY.z + 8.6, 1, '#E1D9CF');
  vsign('漫画喫茶', -60, 12, ALLEY.z - 8.6, -1, '#E1D9CF', '#F40709');
  vsign('연대기', -76, 11, ALLEY.z + 8.6, 1, '#F40709');
  vsign('ガチャ', -92, 12, ALLEY.z - 8.6, -1, '#F40709');
  vsign('만화', -86, 11, ALLEY.z + 8.6, 1, '#E1D9CF');
  // площадь: мощение и подсветка
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(80, 76), new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.3, metalness: 0.5 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(-140, 0.04, 255); scene.add(plaza);
  [[-130, 245], [-150, 270], [-120, 275]].forEach(([x, z]) => { const l = new THREE.PointLight(0xff3a2a, 160, 40, 2); l.position.set(x, 12, z); scene.add(l); });

  // хроники ижоры: вертикальный экран-вебтун на чёрной плите, лента листается сама
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048; const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 512, 2048);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 0.38); webtoon.tex = tex;
  ['izhora-47-1', 'izhora-48-1', 'izhora-48-2'].forEach((n, i) => {
    const img = new Image(); img.onload = () => { const h = 512 * img.height / img.width; g.drawImage(img, 0, i * 682 + (682 - Math.min(h, 660)) / 2, 512, Math.min(h, 660)); tex.needsUpdate = true; }; img.src = `assets/cases/${n}.jpg`;
  });
  const wt = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(13, 30, 2), MAT.matte); back.position.set(0, 15, -1.2); wt.add(back);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(10, 26), new THREE.MeshBasicMaterial({ map: tex })); scr.position.set(0, 15, 0); wt.add(scr);
  scr.userData.case = 'izhora'; clickable.push(scr);
  slabs(wt, 13, 30, 7); wt.children.slice(2).forEach(b => b.position.y += 15);
  wt.position.set(-163, 0, 268); wt.rotation.y = Math.PI / 2 + 0.25; scene.add(wt);

  // треснутые: автомат с капсулами — кремовый глянец, стеклянный купол, капсулы
  const ga = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), MAT.cream); base.position.y = 3; ga.add(base);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.3), MAT.matte); slot.position.set(0, 2.4, 2.55); ga.add(slot);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false })); dome.position.y = 9; ga.add(dome);
  const cr = mulberry(3);
  for (let i = 0; i < 26; i++) {   // 26 героев — 26 капсул
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), cr() < 0.5 ? MAT.gloss : MAT.cream);
    const a = cr() * Math.PI * 2, rr = cr() * 2.3, y = 7 + cr() * 2.2; cap.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); ga.add(cap);
  }
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), new THREE.MeshBasicMaterial({ map: caseTexture('assets/cases/treschnutye-1.jpg', false), toneMapped: false }));
  poster.position.set(-7, 8, -1); poster.rotation.y = 0.3; ga.add(poster);
  ga.position.set(-122, 0, 278); ga.rotation.y = 2.6; ga.userData.case = 'treschnutye'; scene.add(ga); clickable.push(ga);
}

// ---------- сценарий скролла ----------
// p — доля прокрутки 0..1. Между ключами — плавная интерполяция, поэтому на каждом ключе камера как бы «присаживается»
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GO = { reel: 0.48, cross: 0.57, btl: 0.62, alley: 0.68, atl: 0.70, awards: 0.84, about: 0.9, brief: 1 };
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
    { p: 0.505, pos: V(0, 30, 106), look: V(0, 30, 20) },
    { p: 0.56, pos: V(0, 15, 112), look: V(0, 20, 160) },
    { p: 0.585, pos: V(0, 15, 116), look: V(0, 20, 160) },
  ];
  const tail = [
    { p: 0.855, pos: V(0, 10, 505), look: V(19, 16, 540) },
    { p: 0.872, pos: V(0, 10, 510), look: V(19, 16, 540) },
    { p: 0.905, pos: V(0, 12, 565), look: V(-19, 18, 600) },
    { p: 0.925, pos: V(0, 12, 568), look: V(-19, 18, 600) },
    { p: 0.965, pos: V(0, 14, 640), look: V(0, 20, 700) },
    { p: 1.00, pos: V(0, 14, 648), look: V(0, 20, 700) },
  ];
  // две ветки после перекрёстка: btl идёт по земле вдоль зон, atl поднимается к экранам небоскрёбов
  CAM.btl = [...head,
    { p: 0.62, pos: V(4, 12, 205), look: V(-30, 10, 250) },
    { p: 0.645, pos: V(-10, 10, 250), look: V(-80, 9, 251) },
    { p: 0.672, pos: V(-102, 17, 262), look: V(-146, 7, 252) },
    { p: 0.69, pos: V(-106, 18, 266), look: V(-146, 7, 252) },
    { p: 0.715, pos: V(10, 13, 262), look: V(-8, 8, 300) },
    { p: 0.74, pos: V(10, 13, 266), look: V(-8, 8, 300) },
    { p: 0.785, pos: V(-10, 16, 345), look: V(6, 5, 385) },
    { p: 0.805, pos: V(-10, 16, 349), look: V(6, 5, 385) },
    ...tail];
  CAM.atl = [...head,
    { p: 0.64, pos: V(0, 60, 220), look: V(-28, 95, 335) },
    { p: 0.69, pos: V(0, 88, 290), look: V(-28, 95, 335) },
    { p: 0.71, pos: V(0, 88, 293), look: V(-28, 95, 335) },
    { p: 0.745, pos: V(0, 88, 350), look: V(28, 95, 395) },
    { p: 0.765, pos: V(0, 88, 353), look: V(28, 95, 395) },
    { p: 0.795, pos: V(0, 88, 410), look: V(-28, 95, 455) },
    { p: 0.81, pos: V(0, 88, 413), look: V(-28, 95, 455) },
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

// ---------- HTML-слой ----------
const ovs = [...document.querySelectorAll('.ov')].map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, r: el.dataset.route }));
const STAGES = [[0, '{00} вход'], [0.1, '{01} искра'], [0.35, '{01} кислород'], [0.45, '{02} шоурил'], [0.53, '{03} перекрёсток'], [0.6, '{04} btl · проспект', 'btl'], [0.6, '{05} atl · эфир', 'atl'], [0.81, '{06} награды'], [0.87, '{07} о нас'], [0.94, '{08} бриф']];
const hudPct = document.getElementById('hudPct'), hudStage = document.getElementById('hudStage');
function updateOverlay(p) {
  ovs.forEach(o => {
    const f = 0.012, op = o.r && o.r !== route ? 0 : clamp01(Math.min(o.a === 0 ? 1 : (p - o.a) / f, (o.b - p) / f));
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
const WORD = { reel: 'фильм', cross: 'развилка', btl: 'btl', alley: 'переулок', atl: 'atl', awards: 'награды', about: 'о нас', brief: 'бриф' };
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
  const el = e.target.closest('[data-go],[data-case],[data-modal],[data-brief],#caseOrbit');
  if (!el || el.disabled) return;
  e.preventDefault();
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
const INDEX = [['{00}', 'вход', 0], ['{01}', 'искра', 0.1], ['{02}', 'фильм', 0.45], ['{03}', 'развилка', 0.53], ['{04}', 'btl', 0.6, 'btl'], ['{05}', 'atl', 0.6, 'atl'], ['{06}', 'награды', 0.81], ['{07}', 'о нас', 0.87], ['{08}', 'бриф', 0.94]];
let lastStage = '', sqT = 0, frameN = 0;
function hud2d(p, time) {
  frameN++;
  const cur = INDEX.filter(s => p >= s[2] && (!s[3] || s[3] === route)).pop();
  micro.innerHTML = INDEX.filter(s => !s[3] || !route || s[3] === route).map(s => `<div class="${s === cur ? 'on' : ''}">${s[0]} ${s[1]}${s === cur ? ' ←' : ''}</div>`).join('');
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
document.getElementById('openOrbit').addEventListener('click', openOrbit);
document.getElementById('closeOrbit').addEventListener('click', closeOrbit);

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
  const flick = landed > 0 && landed < 1 ? (Math.sin(time * 60) > 0 ? 1 : 0.2) : 1;
  logo.mat.emissiveIntensity = 0.05 + landed * 1.5 * flick;
  logo.glow.intensity = landed * 220 * flick;
  fans.tip.visible = Math.sin(time * 3) > 0;
  updateFans(dt, landed);

  if (webtoon.tex) webtoon.tex.offset.y = (time * 0.035) % 1;
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
await Promise.all([document.fonts.load('520 100px TT'), document.fonts.load('20px AP')]);
buildCity(); buildTower(); await buildLogo(); buildSections(); buildTimeline();
document.getElementById('loader').classList.add('done');
frame();
