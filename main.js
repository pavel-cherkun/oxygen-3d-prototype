// Прототип 3D-главной Oxygen: Искра падает в неоновый логотип на башне, дальше скролл ведёт по улице к разделам.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/'));
import { CASES, renderCase, MODALS } from './cases.js';
// учёт загрузки для прелоадера-искры: каждый файл через общий менеджер, картинки кейсов — вручную в caseTexture
const LD = { done: 0, total: 0 }, LM = THREE.DefaultLoadingManager, lmStart = LM.itemStart, lmEnd = LM.itemEnd;
LM.itemStart = u => { LD.total++; lmStart.call(LM, u); }; LM.itemEnd = u => { LD.done++; lmEnd.call(LM, u); };

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
// туман не слоями, а аналитический по высоте: плотность падает с высотой, и для каждого пикселя считается, сколько тумана
// на луче от камеры (интеграл экспоненты). у земли — плотная мгла, из неё поднимаются чёрные объёмы, верхушки чище.
// параметры: fogNear — базовая плотность ×10⁴, fogFar — добавка у земли ×10⁴; спад по высоте — 0.035 на метр
scene.fog = new THREE.Fog(0x4b4e52, 8, 34);
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogWP;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogWP = mvPosition.xyz * mat3(viewMatrix) + cameraPosition;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vFogWP;\n#endif';
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fr = vFogWP - cameraPosition; float fd = length(fr), fk = clamp(0.035 * fr.y, -60.0, 60.0);
  float hint = exp(-0.035 * cameraPosition.y) * (abs(fk) > 1e-3 ? (1.0 - exp(-fk)) / fk : 1.0);
  float fogFactor = 1.0 - exp(-fd * (fogNear + fogFar * hint) * 1e-4);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
scene.background = skyTexture();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2500);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// контактные тени в углах, под козырьками и у земли — то, чего не даёт один направленный свет
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 7, distanceExponent: 1.4, thickness: 3, scale: 1.3, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = 1; composer.addPass(gtao);
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
// свет брутализма: один холодный ключ под низким углом сбоку улицы — одна стена каньона светлая, другая в тени,
// сквозь просветы между домами на асфальт ложатся полосы. тень считается только вокруг точки, куда смотрит камера
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight(0xb8bcc2, 0x2a2a2a, 0.6));
// небесный свет как карта окружения: светлый купол, тёмная земля, яркое пятно со стороны ключа — мягкий рассеянный свет
// во всех тенях, грани домов, смотрящие в небо и в сторону солнца, получают разную подсветку (дешёвая замена GI)
{
  const env = new THREE.Scene(), sky = canvasTexSky();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide })));
  const hot = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xfff4e6, side: THREE.DoubleSide })); hot.position.set(0.55, 0.74, -0.38).normalize().multiplyScalar(45); hot.lookAt(0, 0, 0); env.add(hot);
  const bounce = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0x4a443e, side: THREE.DoubleSide })); bounce.position.set(0, -40, 0); bounce.lookAt(0, 0, 0); env.add(bounce);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture; scene.environmentIntensity = 0.55;
}
function canvasTexSky() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#dfe2e6'); gr.addColorStop(0.45, '#a9adb3'); gr.addColorStop(0.55, '#4a4c50'); gr.addColorStop(1, '#202022');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const KEY_DIR = new THREE.Vector3(0.55, 0.74, -0.38).normalize();   // сбоку и чуть из-за спины камеры, высоко — свет заходит в каньон улицы
const sun = new THREE.DirectionalLight(0xeef0f3, 2.3);   // пасмурное солнце: мягкое, тени есть, но не режут sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 1, far: 1300 });
sun.shadow.radius = 4; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
function updateSun(lookAt) {
  // ось тени — земля под точкой взгляда; шаг привязан к текселю карты, чтобы тени не дрожали при движении
  const e = 600 / 4096, gx = Math.round(lookAt.x / e) * e, gz = Math.round(lookAt.z / e) * e;
  sun.target.position.set(gx, 0, gz); sun.position.set(gx, 0, gz).addScaledVector(KEY_DIR, 600);
}

function skyTexture() {
  // пасмурное небо: у горизонта ровно цвет тумана (туманные объёмы сливаются с небом), к зениту темнее
  const c = document.createElement('canvas'); c.width = 8; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#1d1f22'); gr.addColorStop(0.3, '#2b2e32'); gr.addColorStop(0.44, '#404347'); gr.addColorStop(0.5, '#4b4e52'); gr.addColorStop(1, '#4b4e52');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; return t;
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
// ---------- бетон: брутализм ----------
// фактура монолита с опалубкой: доски, швы панелей, отверстия от стяжек, подтёки. на дома ложится по мировым координатам
// (трипланар), поэтому одна плитка 14 м одинаково читается и на коробке 20 м, и на ребре 0,7 м; у земли бетон темнеет — дешёвый AO
function concreteTexture(seed) {
  // чистый гладкий бетон: только очень мягкая неравномерность тона и тонкое зерно — без досок, швов и подтёков
  const r = mulberry(seed), S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, rr = 80 + r() * 200, v = r() < 0.5 ? '0,0,0' : '255,255,255', a = 0.015 + r() * 0.025;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr); gr.addColorStop(0, `rgba(${v},${a})`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); }
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const CONC_TEX = concreteTexture(1966);
function concrete(tone = 0x3c3c3e, { scale = 14, fog = true, ao = 18, rough = 0.88 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: tone, roughness: rough, metalness: 0, fog });
  m.onBeforeCompile = sh => {
    sh.uniforms.cTex = { value: CONC_TEX }; sh.uniforms.cScale = { value: 1 / scale }; sh.uniforms.cAo = { value: ao };
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 wp4 = vec4(transformed, 1.0); vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;
      #endif
      vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn);`);
    sh.fragmentShader = 'uniform sampler2D cTex; uniform float cScale; uniform float cAo; varying vec3 vWP; varying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 bw = pow(abs(normalize(vWN)), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 ct = texture2D(cTex, vWP.zy * cScale).rgb * bw.x + texture2D(cTex, vWP.xz * cScale).rgb * bw.y + texture2D(cTex, vWP.xy * cScale).rgb * bw.z;
      diffuseColor.rgb *= ct * 2.6 * mix(0.42, 1.0, clamp(smoothstep(0.0, cAo, vWP.y) + bw.y * 0.6, 0.0, 1.0));`);
  };
  m.customProgramCacheKey = () => 'concrete' + scale + ao + rough;
  return m;
}
const CONC = { wall: concrete(0x101011, { scale: 30, rough: 0.72 }), dark: concrete(0x0b0b0c, { scale: 30, rough: 0.72 }), ground: concrete(0x2b2b2c, { scale: 20 }), far: concrete(0x141415, { scale: 60, ao: 60, rough: 0.6 }) };

// ---------- текстуры ----------
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
  const img = new Image(); LM.itemStart(url); img.onerror = () => LM.itemEnd(url); img.onload = () => { LM.itemEnd(url);
    const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff3a2a'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, W, 1); }
    t.needsUpdate = true;
  }; img.src = url; return t;
}
const CASE_IMGS = ['ozon-fandom-kv-1', 'ozon-fandom-real-1', 'ozon-fandom-real-2', 'ozon-fandom-real-3', 'ozon-select-1', 'ozon-select-2', 'ozon-select-3', 'megafon-zone-1', 'megafon-zone-2', 'baltika7-domes-1', 'baltika7-domes-2', 'ozon-fandom-3d-1'].map(n => `assets/cases/${n}.jpg`);

// ---------- город ----------
// брутализм: монолитные корпуса из тёмного бетона. объём читается только светом и тенью — консоли, перевёрнутые зиккурады,
// пояса-козырьки и рёбра-пилоны на фасадах к улице режут ключевой свет на полосы. все коробки собираются в BR и в конце
// раскладываются по кускам улицы (flushBrutal): кусок рисуется, только пока он ближе границы темноты
const TOWER = { w: 80, h: 260, d: 40 };
const BR = { boxes: [], lit: [], chunks: [], CH: 140 };
// чёрные простые объёмы по доске «blach arch»: монолит, стопка сдвинутых плит, консоль над улицей, парящий куб над основанием
function brutalBlock(c, r) {
  const B = BR.boxes, side = Math.sign(c.x) || 1, t = r(), tight = Math.abs(c.x) < 50;
  if (t < 0.34) { B.push([c.x, c.h / 2, c.z, c.w, c.h, c.d]); return; }
  if (t < 0.62) {
    const n = 3 + (r() * 4 | 0), sh = c.h / n; let ox = 0, oz = 0;
    for (let i = 0; i < n; i++) { ox = (r() - 0.5) * (tight ? 3 : 9); oz = (r() - 0.5) * 9; B.push([c.x + ox, sh * i + sh / 2, c.z + oz, c.w * (0.75 + r() * 0.45), sh, c.d * (0.75 + r() * 0.45)]); }
    return;
  }
  if (t < 0.82) {
    const y0 = c.h * (0.45 + r() * 0.25), o = tight ? 3 : 6 + r() * 10;
    B.push([c.x + side * c.w * 0.18, y0 / 2, c.z, c.w * 0.6, y0, c.d * 0.7]);
    B.push([c.x - side * o / 2, y0 + (c.h - y0) / 2, c.z, c.w + o, c.h - y0, c.d]); return;
  }
  const hb = 6 + r() * 10, sz = Math.min(c.w, c.d) * (0.8 + r() * 0.3), gap = 5 + r() * 9;
  B.push([c.x, hb / 2, c.z, c.w, hb, c.d], [c.x, hb + gap + sz / 2, c.z, sz, sz, sz]);
}
// скалы с poly haven (cc0, упрощены в blender): чёрный камень с картой нормалей, инстансы по типам
const ROCKS = { list: [], files: ['mountainside', 'namaqualand_cliff_02', 'boulder_01'] };
function rock(type, x, y, z, k, ry) { ROCKS.list.push({ type, x, y, z, k, ry }); }
async function buildRocks() {
  const d = new THREE.Object3D();
  await Promise.all(ROCKS.files.map(async f => {
    const items = ROCKS.list.filter(r => r.type === f); if (!items.length) return;
    const gl = await gltfLoader.loadAsync(`assets/models/rocks/${f}.glb`); let geo; gl.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
    geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    const nor = texLoader.load(`assets/models/rocks/${f}_nor.jpg`); nor.wrapS = nor.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.85, normalMap: nor, normalScale: new THREE.Vector2(1.4, 1.4) });
    const im = new THREE.InstancedMesh(geo, mat, items.length); im.castShadow = im.receiveShadow = true;
    items.forEach((r, i) => { d.position.set(r.x, r.y, r.z); d.rotation.set(0, r.ry, 0); d.scale.setScalar(r.k); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.computeBoundingSphere(); scene.add(im);
  }));
}
// раскладка всех коробок по кускам вдоль z: в каждом куске один InstancedMesh бетона и один — тёплых окон
function flushBrutal() {
  const box = new THREE.BoxGeometry(1, 1, 1), plane = new THREE.PlaneGeometry(1, 1), d = new THREE.Object3D(), by = new Map();
  const litM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc68a).multiplyScalar(0.75), side: THREE.DoubleSide });
  const key = z => Math.floor(z / BR.CH);
  BR.boxes.forEach(b => { const k = key(b[2]); (by.get(k) || by.set(k, { b: [], l: [] }).get(k)).b.push(b); });
  BR.lit.forEach(l => { const k = key(l[2]); (by.get(k) || by.set(k, { b: [], l: [] }).get(k)).l.push(l); });
  for (const [k, { b, l }] of by) {
    const g = new THREE.Group(); scene.add(g);
    const im = new THREE.InstancedMesh(box, CONC.wall, b.length); im.castShadow = im.receiveShadow = true;
    b.forEach(([x, y, z, w, h, dd], i) => { d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.set(w, h, dd); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.computeBoundingSphere(); g.add(im);
    if (l.length) { const lm = new THREE.InstancedMesh(plane, litM, l.length); l.forEach(([x, y, z, w, h, s], i) => { d.position.set(x, y, z); d.rotation.set(0, -s * Math.PI / 2, 0); d.scale.set(w, h, 1); d.updateMatrix(); lm.setMatrixAt(i, d.matrix); }); lm.computeBoundingSphere(); g.add(lm); }
    BR.chunks.push({ g, z0: k * BR.CH, z1: (k + 1) * BR.CH });
  }
}
// дальность: кусок города рисуется, только пока он ближе границы, где туман становится глухим
function updateReach() {
  const y = Math.max(0, camera.position.y), z = camera.position.z;
  const R = 720 + y * 0.6;   // за этой границей туман уже глухой
  BR.chunks.forEach(c => { c.g.visible = Math.max(0, c.z0 - z, z - c.z1) < R; });
}
function buildCity() {
  const cells = [];
  for (let x = -238; x <= 238; x += 34) for (let z = -340; z <= 1320; z += 34) {   // дальше седьмого ряда дома не нужны: их закрывает каньон и темнота
    if (Math.abs(x) < 20 && z > -20) continue;               // улица
    if (Math.abs(x) < 62 && Math.abs(z) < 42) continue;      // площадь у башни
    if (Math.abs(z - 150) < 15) continue;                    // перекрёсток
    if (reservedByWorld(x, z)) continue;                      // улица после развилки, башни atl и «дикси»
    if (Math.abs(x) < 20 && z > TAIL.brief - 10) continue;    // торец проспекта под бриф
    if (rand() < 0.3) {   // просвет: на части пустых мест — скалы, город врастает в камень
      if (Math.abs(x) > 90 && rand() < 0.45) { const q = rand(); q < 0.6 ? rock('namaqualand_cliff_02', x, -1, z, 2 + rand() * 1.6, rand() * 6) : q < 0.85 ? rock('mountainside', x, -2, z, 3 + rand() * 3, rand() * 6) : rock('boulder_01', x, -1, z, 10 + rand() * 12, rand() * 6); }
      continue;
    }
    const dist = Math.hypot(x, z * 0.8), near = Math.abs(x) < 80;
    const h = near ? 48 + rand() * 90 : 30 + rand() * (70 + Math.min(dist, 380) * 0.35);   // у улицы стены выше — каньон
    cells.push({ x: x + (rand() - .5) * 4, z: z + (rand() - .5) * 4, w: 20 + rand() * 9, d: 20 + rand() * 9, h });
  }
  CITY.cells = cells;
  cells.forEach(c => brutalBlock(c, rand));
  // мегаструктуры на горизонте: громадные монолиты за границей тумана — проступают из мглы призраками и задают масштаб
  const far = new THREE.Group(); scene.add(far); CITY.far = far;
  const fr = mulberry(404), boxG = new THREE.BoxGeometry(1, 1, 1);
  const mega = (x, z, w, h, d) => { const m = new THREE.Mesh(boxG, CONC.far); m.scale.set(w, h, d); m.position.set(x, h / 2 - 20, z); far.add(m); };
  for (const s of [-1, 1]) for (let z = -500; z < 1900; z += 170 + fr() * 120) {
    const x = s * (560 + fr() * 260), w = 110 + fr() * 140, h = 280 + fr() * 380, d = 90 + fr() * 140;
    mega(x, z, w, h, d); if (fr() < 0.55) mega(x - s * (w * 0.3), z + (fr() - 0.5) * d, w * 0.5, h + 60 + fr() * 140, d * 0.5);
  }
  [[-260, -900], [180, -1000], [0, 2250], [-320, 2150], [300, 2300]].forEach(([x, z]) => mega(x, z, 260 + fr() * 200, 400 + fr() * 300, 160));
  // земля — тёмный камень
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), CONC.ground); ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2; scene.add(ground); CITY.ground = ground;
  for (let z = 50; z < TAIL.brief - 10; z += 12) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), new THREE.MeshBasicMaterial({ color: 0x2c2c30 }));
    l.rotation.x = -Math.PI / 2; l.position.set(0, 0.05, z); scene.add(l);
  }
}

// ---------- башня, вентиляторы, логотип ----------
const fans = { blades: null, list: [], speed: 0.6 };
function buildTower() {
  // башня — тот же монолит: тело, глухая корона, вертикальные пилоны по краям фасада, мачта с сигнальным огнём
  const body = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.d), CONC.wall); body.position.y = TOWER.h / 2; body.castShadow = body.receiveShadow = true; scene.add(body);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w * 0.7, 18, TOWER.d * 0.7), CONC.wall); crown.position.y = TOWER.h + 9; crown.castShadow = true; scene.add(crown);
  
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4), new THREE.MeshBasicMaterial({ color: RED, toneMapped: false })); tip.position.y = TOWER.h + 59; fans.tip = tip;
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(6, TOWER.h + 6, 6), CONC.wall); p.position.set(s * (TOWER.w / 2 + 1), (TOWER.h + 6) / 2, TOWER.d / 2 - 1); p.castShadow = p.receiveShadow = true; scene.add(p); });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w + 8, 4, TOWER.d + 6), CONC.wall); cap.position.y = TOWER.h + 2; cap.castShadow = true; scene.add(cap);

  // вентиляторы: корпуса — один InstancedMesh, лопасти — второй, их матрицы крутим каждый кадр
  const slots = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) slots.push({ face: 'front', x: -27 + col * 18, y: 66 + row * 24 });
  for (const side of [-1, 1]) for (let row = 0; row < 8; row++) for (let col = 0; col < 2; col++) slots.push({ face: side, z: -9 + col * 18, y: 30 + row * 26 });
  const R = 7;
  const housing = new THREE.InstancedMesh(new THREE.TorusGeometry(R, 0.9, 8, 32), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, emissive: RED, emissiveIntensity: 0.0, metalness: 0.6, roughness: 0.45 }), slots.length);
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
  // вентиляторы убраны из кадра: башня — чистый монолит
  fans.blades = blades; fans.housing = housing;

  // поток воздуха из вентиляторов
  const N = 2400, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3); fans.air = { g, p, seeds: [] };
  for (let i = 0; i < N; i++) { const f = fans.list[i % fans.list.length]; fans.air.seeds.push({ f, t: rand(), spread: new THREE.Vector2(rand() - .5, rand() - .5) }); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: CREAM, size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  fans.air.mat = pts.material; fans.air.pts = pts;
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
const diorama = new THREE.Group();
const clickable = [];
// носители: плоский экран и красная рамка вокруг него
const board = (tex, w, h, pos, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.copy(pos); m.rotation.y = ry; scene.add(m); return m; };
const rim = (w, h, pos, ry) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w + 4, h + 4, 2.4), CONC.wall); g.position.copy(pos); g.rotation.y = ry; g.translateZ(-1.4); g.castShadow = g.receiveShadow = true; scene.add(g); };   // бетонная рама вместо неоновой
const promo = { v: null, started: false };
function buildSections() {

  // площадь: экран шоурила
  const video = Object.assign(document.createElement('video'), { src: 'assets/oxygen_promo_v2.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'none' });
  promo.v = video;   // шоурил качается, когда камера начинает спуск к башне, а не при открытии страницы
  const vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
  const reelPos = V(0, 30, TOWER.d / 2 + 0.8);
  rim(64, 36, reelPos, 0);
  const reel = board(vtex, 64, 36, reelPos, 0); reel.position.z += 0.1; reel.userData.modal = 'reel'; clickable.push(reel);

  buildWorld();


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
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 3.2, h + 3.2, 1.6), CONC.wall); back.position.z = -0.85; back.castShadow = back.receiveShadow = true; g.add(back);   // бетонная рама вместо красной
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
  solid(scr);
  fx.wall.visible = fx.ticker.visible = fx.lz.visible = false;   // без лазеров, растяжки и бегущей строки: в брутальном городе только свет
  return fx;
}
function kitUpdate(fx, time, I, beat, kick) {
  const bar = Math.floor(beat / 4), b = Math.floor(beat), drop = (bar % 4) === 3, f = beat % 1;   // каждый четвёртый такт — дроп
  fx.key.intensity = I * fx.light * (900 + 2200 * kick); fx.rim.intensity = I * fx.light * (1400 + 1800 * kick);
  fx.rings.forEach((r, i) => { r.material.opacity = 0.35 + 0.65 * Math.exp(-((beat + i * 0.25) % 1) * 5); });
  fx.wave.scale.setScalar(2 + f * fx.waveR); fx.wave.material.opacity = (1 - f) * 0.8;
  fx.beams.forEach((s, i) => { s.pivot.rotation.set(s.base.x + Math.sin(time * 0.9 + s.ph) * 0.35, s.base.y, s.base.z + Math.cos(time * 0.7 + s.ph) * 0.35); s.pivot.children[0].material.opacity = (0.06 + 0.1 * kick) * I * (drop || (b + i) % 2 ? 1 : 0.35); });
  fx.lz.visible = false; fx.lz.rotation.y = Math.sin(time * 1.7) * 0.5; fx.lz.rotation.x = -0.15 + Math.sin(time * 2.3) * 0.12;
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

// ---------- азиатский квартал ----------
// тот же брутализм, но плотнее и выше: башни-монолиты в два ряда, пагода из бетонных ярусов, над улицей — массивные
// бетонные тории, в конце квартала низкое красное солнце, с крыш в небо — белые прожекторы. обычные дома сюда не ставятся (reservedByWorld)
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
  towers.forEach(t => brutalBlock(t, r, Math.abs(t.x) < 80));
  ASIA_FX.towers = towers;
}
function updateAsia(time) {
  if (!ASIA_FX.sun) return;
  const near = clamp01((260 - Math.abs(camera.position.z - (ASIA.z0 + ASIA.z1) / 2)) / 120);
  ASIA_FX.sun.material.opacity = 0.14 + 0.04 * Math.sin(time * 0.8);
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
const towerMat = CONC.wall;   // башни atl — тот же бетон, без окон
const heroMat = concrete(0x4a4a4c, { scale: 6, ao: 4 });   // временный бетонный блок вместо героя

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
  const blk = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), heroMat); blk.position.y = 0.8 + hh / 2; blk.castShadow = blk.receiveShadow = true; g.add(blk); w.heroBlock = blk;
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
function towerBox(t, mat) { if (mat === MAT.matte) mat = CONC.wall; const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), mat); m.position.set(t.x, t.h / 2, t.z); m.castShadow = m.receiveShadow = true; scene.add(m); return solid(m); }
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
// все кейсы пока — бетонные кубы-плейсхолдеры в габарите будущего носителя: ничего не отвлекает от города и маршрута
// кейсы — в цвете бренда клиента (приблизительные фирменные цвета; уточнить по брендбукам клиентов)
const BRAND = { fandom: 0x005bff, selekt: 0x005bff, tbank: 0xffdd2d, lion: 0x0094d9, izhora: 0x0094d9, lionMerch: 0x0094d9,
  ironstar: 0xff6a13, gdrive: 0xff6a13, gdriveMerch: 0xff6a13, baltika7: 0x0b3a7e, baltikaPlant: 0x0b3a7e, mice: 0x0b3a7e,
  megafon: 0x00b956, megafonTravel: 0x00b956, oxygenSet: RED, treschnutye: 0xff7a10, zaklinateli: 0xff7a10, dino: 0xff7a10,
  avangard: 0xc8102e, derbent: 0xc8873a, tevredens: CREAM, aiFonbet: 0xe30613, aiMango: 0xff8200, aiLavka: 0xffcc00, aiAlfa: 0xef3124 };
const PHM = {}, phMat = id => PHM[id] ||= new THREE.MeshStandardMaterial({ color: BRAND[id] ?? RED, emissive: BRAND[id] ?? RED, emissiveIntensity: 0.05, roughness: 0.5, metalness: 0 });
// локальный свет кейсов: пул из четырёх ламп цвета бренда переезжает к ближайшим кубам — бетон вокруг кейса окрашивается брендом,
// а число источников в сцене не меняется (шейдеры не пересобираются)
const GLOW = { pts: [], pool: [] };
function placeholder(w) {
  const cube = (sx, sy, sz, x, y, z, ry = 0) => { w.cube = { c: V(x, y, z), h: sy, w: Math.max(sx, sz) }; const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), phMat(w.id)); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; m.userData.case = w.id; scene.add(m); clickable.push(m); return solid(m); };
  const onRock = w.kind === 'screen' && (w.zone === 'city' || w.zone === 'arena');
  if (onRock) {   // баннер на скале: вместо башни — скальный массив, плита кейса висит на его грани к улице
    const sd = Math.sign(w.tower.x);
    rock('mountainside', sd * 80, -4, w.z, 13, sd > 0 ? -Math.PI / 2 : Math.PI / 2);
    SOLIDS.push({ box: new THREE.Box3(V(sd * 80 - 40, 0, w.z - 60), V(sd * 80 + 40, 130, w.z + 60)), name: 'скала' });
    const [sw, sh] = w.size; return cube(sw, sh, 2, sd * 42, w.F.y, w.z, -sd * Math.PI / 2 + sd * 0.35);
  }
  if (w.tower) towerBox(w.tower, CONC.wall);
  if (w.moment === 'izhora') { const s = Math.sign(w.tower.x); return cube(2, 52, 30, w.face - s * 1, 66, w.z); }
  if (w.kind === 'roof') return cube(16, 16, 16, w.tower.x + 4, w.tower.h + 8, w.z);
  if (w.kind === 'screen') { const [sw, sh] = w.size; return cube(sw, sh, 3, w.F.x, w.F.y, w.F.z, Math.atan2(w.cam.x - w.F.x, w.cam.z - w.F.z)); }
  if (w.kind === 'vitrine') return cube(13, 13, 10, w.F.x, 6.5, w.z);
  const [hw, hd, hh] = w.hero, H = w.heroH || Math.max(hh, 6), c = w.center || w.heroPos;
  return cube(hw, H, hd, c.x, H / 2, c.z);
}
function buildWorld() {
  for (const w of WORLD) placeholder(w);
  for (const w of WORLD) { const { c, h } = w.cube, air = w.r === 'atl'; GLOW.pts.push(Object.assign(air ? V(c.x - Math.sign(c.x) * 20, c.y + 4, c.z - 16) : V(c.x + 16, Math.min(h * 0.6, 10) + 6, c.z - 14), { col: new THREE.Color(BRAND[w.id] ?? RED) })); }
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(RED, 0, 60, 1.6); scene.add(l); GLOW.pool.push(l); }
  buildAsia();
}
function updateGlow() {
  const near = GLOW.pts.map(p => [p, p.distanceTo(camera.position)]).sort((a, b) => a[1] - b[1]);
  GLOW.pool.forEach((l, i) => { const [p, d] = near[i]; l.position.copy(p); l.color.copy(p.col); l.intensity = 640 * clamp01((260 - d) / 120); });
}
function updateWorld(time) {
  updateGlow();
  if (lionDance.mixer) { const dt = Math.min(0.05, time - (lionDance.t || time)); lionDance.t = time; lionDance.mixer.update(dt); }
  clips.forEach(c => { const near = c.g.position.distanceTo(camera.position) < 220; if (near && c.v.paused) c.v.play().catch(() => {}); else if (!near && !c.v.paused) c.v.pause(); });
}
// проверка: камера обоих маршрутов не должна заходить ни в один объект (в консоли при ?dev)
function checkPath() {
  const boxes = [...SOLIDS, ...BR.boxes.map(([x, y, z, w, h, d]) => ({ box: new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)), name: 'дом' }))];
  const hits = [], s = new THREE.Sphere(new THREE.Vector3(), 2.5), q = new THREE.Vector3();
  for (const r of ['btl', 'atl']) {
    const k = CAM[r];
    for (let n = 0; n <= 800; n++) {
      const p = FORK + (1 - FORK) * n / 800; let i = 0; while (i < k.length - 2 && p > k[i + 1].p) i++;
      k.pos.getPoint(camU(k, p), q); s.center.copy(q);
      const b = boxes.find(b => b.box.intersectsSphere(s)); if (b) hits.push({ r, p: +p.toFixed(3), cam: q.toArray().map(v => +v.toFixed(1)).join(' '), obj: b.name });
    }
  }
  console[hits.length ? 'warn' : 'log'](`проверка камеры: ${hits.length ? hits.length + ' касаний' : 'чисто'}`); if (hits.length) console.table(hits);
  return hits;
}


// ---------- атмосфера ----------
// без неона, дождя, граффити и хрома y2k: тёмное небо, фонари с тёплым пятном, бетонные мосты-перекрытия и поезд
const FX = { blobs: [], rain: null, fog: [], mist: [], train: [], leds: [], sparks: [], fliers: [], holo: null, holoMix: null };
const CITY = { cells: [] };
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const softDot = canvasTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
function buildAtmosphere() {
  const r = mulberry(2026);
  scene.background = skyTexture();
  // отражения для хрома стоек: тёмная комната с белыми полосами света, без красного
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x030303);
  [[0xffffff, 0, 6, -12, 30, 4], [0xd8dce4, 9, 2, -10, 4, 18], [0x9a9ea8, -10, -4, 8, 20, 3], [0xffffff, 0, 12, 10, 10, 8]].forEach(([c, x, y, z, w, h]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); envScene.add(p); });
  const chromeEnv = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02).texture;
  MAT.chrome.envMap = chromeEnv; MAT.chrome.color.set(0xe8e8ea); MAT.chrome.needsUpdate = true;

  // мосты-перекрытия над проспектом в просветах между кварталами: монолитная плита на двух опорах.
  // закрывают перспективу улицы, режут свет полосой тени и задают масштаб
  const gapZ = (a, b) => (ZR[a][1] + ZR[b][0]) / 2;
  const bridge = (z, y, deck) => {
    const g = new THREE.Group(); g.position.set(0, 0, z); scene.add(g);
    const add = (w, h, d, x, yy, zz, m = CONC.wall) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, zz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    add(300, deck, 16, 0, y + deck / 2, 0);                                     // плита
    [-1, 1].forEach(s => { add(10, y, 12, s * 47, y / 2, 0); add(4, 3, 18, s * 47, y - 1.5, 0); });   // опоры и оголовки
    for (let x = -40; x <= 40; x += 8) add(1.4, 2.4, 16, x, y - 1.2, 0, CONC.dark);   // ребра снизу: ритм теней над камерой
  };
  bridge(gapZ('asia', 'joint'), 30, 6, 1); bridge(gapZ('sport', 'event'), 30, 6, 0); bridge(gapZ('event', 'merch'), 30, 6, 0);
  bridge(gapZ('joint', 'sport'), 120, 14, 0);   // высокий мост-корпус: над эфиром atl, виден снизу как перекрытие неба
}
function updateAtmosphere(time, dt) {
  FX.train.forEach(t => { t.car.position.set(((time * 26 + t.k * 13.4) % 520) - 260, t.y, t.z); });
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
// вступление до логотипа играет само (INTRO), скролл начинается с логотипа: доля прокрутки 0..1 ↔ сюжет P0..1
const P0 = 0.355, INTRO = { t0: null, done: false };
const toScroll = p => clamp01((p - P0) / (1 - P0)) * (document.documentElement.scrollHeight - innerHeight);
let CAM = {}, ISK = [], route = null;
// камера, написанная заново от логотипа: медленная архитектурная съёмка. правило одно на всё —
// кейс-куб стоит в правой трети кадра, титр живёт слева; камера подъезжает, садится, чуть доезжает и уходит
// к следующему по оси улицы, без рывков в стороны. между ключами — сплайн, внутри отрезка — плавный разгон и торможение
function buildTimeline() {
  const s = slotWorld;
  const head = [
    { p: 0.00, pos: V(0, 430, 330), look: V(0, 400, 200) },   // искра в темноте (до логотипа — прежний пролёт)
    { p: 0.05, pos: V(0, 430, 330), look: V(0, 400, 200) },
    { p: 0.17, pos: V(30, 370, 250), look: V(0, 300, 80) },
    { p: 0.31, pos: V(0, s.y + 2, s.z + 62), look: s },                        // логотип в лоб: искра встаёт в слот
    { p: 0.355, pos: V(-8, s.y - 16, s.z + 118), look: V(-22, s.y - 22, 0) },   // выдох: отъезд, логотип загорается в правом верхнем углу, слева — заголовок
    { p: 0.40, pos: V(-30, s.y - 24, s.z + 150), look: V(0, s.y - 34, 0) },     // отходим в сторону, чтобы увидеть монолит башни целиком
    { p: 0.445, pos: V(-14, 70, 130), look: V(0, 46, 0) },                      // спуск вдоль фасада
    { p: 0.475, pos: V(0, 30, 96), look: V(0, 30, 0) },                         // шоурил на башне в лоб
    { p: 0.518, pos: V(0, 30, 90), look: V(0, 30, 0) },
    { p: 0.526, pos: V(-2, 24, 98), look: V(-120, 22, 96) },                     // резкий разворот головы через левое плечо
    { p: 0.534, pos: V(0, 16, 108), look: V(0, 17, 210) },                      // уже смотрим вдоль проспекта
    { p: 0.585, pos: V(0, 14, 120), look: V(0, 16, 210) },                      // развилка
  ];
  const tail = [
    { p: 0.94, pos: V(0, 12, TAIL.awards - 40), look: V(0, 22, TAIL.awards + 60) },
    { p: 0.975, pos: V(0, 34, TAIL.brief - 110), look: V(0, 90, TAIL.brief + 120) },
    { p: 1.00, pos: V(0, 70, TAIL.brief - 90), look: V(0, 170, TAIL.brief + 160) },   // финал: камера поднимается к небу между стенами
  ];
  // остановка: подлёт (a) и посадка (b), куб — в правой трети, взгляд смещён к левому краю кадра (+x при взгляде вдоль +z)
  const stop = w => {
    const { c, h } = w.cube, air = w.r === 'atl';
    const d = air ? 46 : 30 + h * 0.5, lift = air ? 6 : Math.min(9, 4 + h * 0.18);
    const cx = air ? 0 : c.x + 22, cy = air ? c.y + lift : lift, ty = air ? c.y : Math.min(h * 0.45, 10);
    return [
      { p: w.p - w.span * 0.24, pos: V(cx + 3, cy + 1.5, c.z - d - 8), look: V(c.x + (air ? 16 : 12), ty, c.z) },
      { p: w.p + w.span * 0.24, pos: V(cx, cy, c.z - d), look: V(c.x + (air ? 16 : 12), ty, c.z + 2) },
    ];
  };
  const stops = r => WORLD.filter(w => w.r === r).flatMap(stop);
  CAM.btl = [...head, { p: 0.598, pos: V(8, 9, 152), look: V(0, 9, 240) }, ...stops('btl'), ...tail];
  CAM.atl = [...head, { p: 0.598, pos: V(0, 40, 150), look: V(0, 62, 260) }, ...stops('atl'), { p: 0.93, pos: V(0, 40, TAIL.awards - 90), look: V(0, 24, TAIL.awards) }, ...tail];
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
// положение на сплайне: номер отрезка + плавная доля внутри — камера мягко тормозит на каждом ключе
function camU(k, p) { let i = 0; while (i < k.length - 2 && p > k[i + 1].p) i++; const f = clamp01((p - k[i].p) / (k[i + 1].p - k[i].p)); return (i + (p < P0 ? f : f * f * (3 - 2 * f))) / (k.length - 1); }
function sample(keys, p, fn) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i], b = keys[i + 1], f = clamp01((p - a.p) / (b.p - a.p || 1)), t = p < P0 ? f : smooth(f);
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
  if (true) {
    // у каждого кейса вместо окна — титр во весь экран: заходит после пролёта камеры, всё остальное в «кейс целиком»
    const res = c.result.filter(x => x[0] !== '—')[0];
    el.className = 'ov left flex'; el.dataset.a = w.p - w.span * 0.12; el.dataset.b = b; el.dataset.f = 0.004; el.dataset.route = r;
    el.innerHTML = `<span class="t">${c.pass.клиент}</span><h2>${c.title}</h2><p class="idea">${c.idea}</p>
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
  routeBtn.style.display = route ? '' : 'none'; routeBtn.textContent = `маршрут: ${route} · сменить ↺`;
  micro?.classList.toggle('dim', ovs.some(o => o.el.classList.contains('right') && o.el.classList.contains('panel') && o.el.classList.contains('on')));
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
  if (Math.abs(target - pSm) < 0.12) return scrollTo({ top: toScroll(target), behavior: 'smooth' });
  // далеко: не тащим камеру через весь город, а закрываем шторкой и переставляем
  curtainWord.textContent = WORD[key] || key; curtain.className = 'in';
  setTimeout(() => { scrollTo(0, toScroll(target)); pSm = Math.max(P0, target); curtain.className = 'out'; }, 380);
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-case],[data-modal],[data-brief],[data-more],#caseOrbit,#openOrbit');
  if (!el || el.disabled) return;
  e.preventDefault();
  if (el.id === 'openOrbit') return openOrbit();
  if (el.dataset.more) return openModal(MODALS.more(el.dataset.more));
  if (el.id === 'caseOrbit') { closeModal(); route = 'btl'; scrollTo(0, toScroll(GO.alley)); pSm = GO.alley; openOrbit(); return; }
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
const micro = document.getElementById('micro');
const INDEX = [['{00}', 'вход', 0], ['{01}', 'искра', 0.1], ['{02}', 'фильм', 0.45], ['{03}', 'развилка', 0.53],
  ...WORLD.map(w => [w.r === 'btl' ? '{04}' : '{05}', w.nav, w.p, w.r]), ['{06}', 'награды', 0.93], ['{07}', 'бриф', 0.975]];
// пункт навигации кликабелен: прыжок к остановке, маршрут подставляется сам
const jumpTo = (p, r) => {
  closeModal(); if (orbitOn) closeOrbit(); if (r) route = r; else if (p > FORK && !route) route = 'btl';
  const max = document.documentElement.scrollHeight - innerHeight, t = p;
  if (Math.abs(t - pSm) < 0.08) return scrollTo({ top: toScroll(t), behavior: 'smooth' });
  curtainWord.textContent = WORD_OF(p); curtain.className = 'in';
  setTimeout(() => { scrollTo(0, toScroll(t)); pSm = Math.max(P0, t); curtain.className = 'out'; }, 380);
};
const WORD_OF = p => (INDEX.filter(s => Math.abs(s[2] - p) < 1e-6)[0] || [, ''])[1];
micro?.addEventListener('click', e => { const d = e.target.closest('[data-j]'); if (!d) return; e.preventDefault(); jumpTo(+d.dataset.j, d.dataset.r || null); });
let lastStage = '', sqT = 0, frameN = 0;
function hud2d(p, time) {
  frameN++;
  const cur = INDEX.filter(s => p >= s[2] && (!s[3] || s[3] === route)).pop();
  const stop = route && p > FORK && p < 0.93 ? WORLD.filter(w => w.r === route && p >= w.a).pop() : null, moreKey = stop && ZONES[stop.zone].more;
  const html = INDEX.filter(s => !s[3] || !route || s[3] === route).map(s => `<div class="${s === cur ? 'on' : ''}" data-j="${s[2]}"${s[3] ? ` data-r="${s[3]}"` : ''}>${s[0]} ${s[1]}${s === cur ? ' ←' : ''}</div>`).join('') + (moreKey ? `<div style="margin-top:8px;pointer-events:auto"><a href="#" data-more="${moreKey}" style="color:var(--cream)">${MORE[moreKey].t} →</a></div>` : '');
  if (micro && html !== micro._h) { micro.innerHTML = html; micro._h = html; }
  if (cur && cur[1] !== lastStage) {
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
document.getElementById('views')?.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; b.dataset.view === 'off' ? closeView() : openView(b.dataset.view); });

const ISK_RED = new THREE.Color(RED), ISK_BLACK = new THREE.Color(0x0d0d0f), LOGO_DARK = new THREE.Color(0x1a0707);
// ---------- цикл ----------
let unlocked = false, pSm = 0, mouse = new THREE.Vector2(), mouseSm = new THREE.Vector2();
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5));
const clock = new THREE.Clock(), look = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const max = document.documentElement.scrollHeight - innerHeight;
  let p = 0;   // до готовности город стоит на входе
  if (INTRO.done) p = P0 + (max > 0 ? clamp01(scrollY / max) : 0) * (1 - P0);
  else if (unlocked) {   // вступление само: искра висит, потом летит и встаёт в логотип; скролл открывается после посадки
    INTRO.t0 ??= time; const e = time - INTRO.t0, k = clamp01((e - 1.4) / 5.2);
    p = 0.05 * clamp01(e / 1.4) + (P0 - 0.05) * k * k * (3 - 2 * k);
    if (k >= 1) { INTRO.done = true; scrollTo(0, 0); document.documentElement.classList.remove('lock'); }
  }
  // развилка: пока направление не выбрано, дальше перекрёстка не листается
  if (!route && !orbitOn && p > FORK) { scrollTo(0, toScroll(FORK)); p = FORK; const f = document.getElementById('fork'); if (!f.classList.contains('pulse')) { f.classList.add('pulse'); setTimeout(() => f.classList.remove('pulse'), 1100); } }
  pSm = INTRO.done ? pSm + (p - pSm) * (1 - Math.exp(-dt * 2.6)) : p;   // инерция скролла; вступление идёт без задержки

  if (orbitOn) { orbit.update(); }
  else {
    const k = CAM[route || 'btl'];
    let i = 0; while (i < k.length - 2 && pSm > k[i + 1].p) i++;
    const u = camU(k, pSm);
    k.pos.getPoint(u, camera.position); k.look.getPoint(u, look);
    mouseSm.lerp(mouse, Math.min(1, dt * 3));
    camera.position.x += mouseSm.x * 1.5; camera.position.y -= mouseSm.y * 1;
    camera.lookAt(look);
  }
  updateSun(orbitOn ? orbit.target : look); updateReach();
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
  logo.glow.intensity = 0;   // без пятна света на подложке: логотип светится сам
  fans.air.pts.visible = false;   // поток воздуха нужен только у башни

  updateWebtoon(time);
  updateWorld(time);
  updateAtmosphere(time, dt);
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
// пока грузится город, на чёрном горит Искра (прелоадер в index.html) и скролл заперт; город собирается и
// уже рисуется под шторкой, чтобы шейдеры скомпилировались; когда все файлы на месте — шторка уходит, скролл открывается
history.scrollRestoration = 'manual'; scrollTo(0, 0);
const ldPct = document.getElementById('ldPct'); let ldShown = 0, built = false;
const ldTick = setInterval(() => { const real = LD.total ? LD.done / LD.total : 0, goal = Math.min(built ? 1 : 0.9, real * (built ? 1 : 0.9)); ldShown += (goal - ldShown) * 0.25; ldPct.textContent = String(Math.round(ldShown * 100)).padStart(3, '0'); }, 60);
await Promise.all([document.fonts.load('520 100px TT'), document.fonts.load('20px AP')]);
buildCity(); buildTower(); await buildLogo(); buildSections(); buildAtmosphere(); flushBrutal(); await buildRocks(); buildTimeline();
built = true; frame();
await new Promise(res => { const t0 = performance.now(); let calm = 0; const chk = () => { calm = LD.done >= LD.total ? calm + 1 : 0; if (calm > 4 || performance.now() - t0 > 30000) res(); else setTimeout(chk, 120); }; chk(); });
await new Promise(r => setTimeout(r, 450));
clearInterval(ldTick); ldPct.textContent = '100';
window.__three = { renderer, scene, CAM, THREE, WORLD, BR, checkPath, go: (p, r) => { INTRO.done = true; document.documentElement.classList.remove('lock'); route = r; scrollTo(0, toScroll(p)); pSm = p; } };   // для отладки
scrollTo(0, 0); unlocked = true;   // скролл откроется после вступления (frame)
document.getElementById('loader').classList.add('done');
if (location.search.includes('dev')) checkPath();   // для отладки производительности
// ?at=lion:-0.3 — сразу встать на остановку кейса (для скриншотов)
const AT = new URLSearchParams(location.search).get('at');
if (AT) { const [id, t] = AT.split(':'), w = WORLD.find(w => w.id === id); window.__three.go(w.p + w.span * (+t || 0), w.r); }
