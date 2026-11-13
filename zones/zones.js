// 3D-зоны кейсов по реальным визуализациям: Робозон (Ozon Tech) и Т-Додзё «Чёрный пояс в ИТ» (Т-Банк × ИТМО).
// Модуль без зависимостей от main.js: buildX(THREE, {tex}) → { group, update(time, I), solids, size }.
// Координаты локальные, метры, пол y=0, фасад смотрит в +z. Масштабирует и ставит зону сам мир.
// Текстуры вырезаны из визуализаций проекта и лежат в assets/zones/.

const TEX = 'assets/zones/';

function kit(THREE, opts = {}) {
  const base = opts.tex || TEX;
  const loader = new THREE.TextureLoader();
  const tex = (f) => { const t = loader.load(base + f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const pic = (f, o = {}) => new THREE.MeshStandardMaterial({ map: tex(f), roughness: 0.55, ...o });
  const emis = (f, k = 1) => new THREE.MeshStandardMaterial({ map: tex(f), emissiveMap: tex(f), emissive: 0xffffff, emissiveIntensity: k, roughness: 0.4 });
  const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z); me.castShadow = me.receiveShadow = true;
    if (parent) parent.add(me); return me;
  };
  const plane = (w, h, m, x, y, z, ry = 0, parent) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    me.position.set(x, y, z); me.rotation.y = ry; if (parent) parent.add(me); return me;
  };
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  // ферма: 4 пояса + раскосы, одной InstancedMesh на всю зону
  const rods = [];
  const rod = (a, b, r = 0.03) => rods.push([a.clone(), b.clone(), r]);
  const truss = (a, b, s = 0.3) => {
    const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(s / 2);
    const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(s / 2);
    const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    corners.forEach(c => rod(a.clone().add(c), b.clone().add(c), 0.025));
    const n = Math.max(1, Math.round(len / s));
    for (let i = 0; i < n; i++) {
      const p0 = a.clone().addScaledVector(dir, len * i / n), p1 = a.clone().addScaledVector(dir, len * (i + 1) / n);
      for (let k = 0; k < 4; k++) rod(p0.clone().add(corners[k]), p1.clone().add(corners[(k + 1) % 4]), 0.012);
    }
  };
  const flushRods = (parent, color = 0xd9dde2) => {
    if (!rods.length) return;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6);
    const im = new THREE.InstancedMesh(geo, std(color, { metalness: 0.85, roughness: 0.3 }), rods.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    rods.forEach(([a, b, r], i) => {
      const d = b.clone().sub(a), len = d.length();
      q.setFromUnitVectors(Y, d.normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
      im.setMatrixAt(i, m);
    });
    im.castShadow = true; parent.add(im); rods.length = 0;
  };
  return { tex, std, pic, emis, box, plane, canvasTex, truss, rod, flushRods };
}

// ───────────────────────── РОБОЗОН · Ozon Tech ─────────────────────────
// Двухуровневый стенд: серебристые пилоны, белый фриз с логотипом, крыша-терраса с перилами и коробками OZON,
// синий подиум со ступенями и пандусом; внутри тёмно-синий зал: стеллажи с зелёными полками, «путь посылки»,
// игровой экран на тумбах, дженга, стойка выдачи мерча, рольганг с коробками.
export function buildRobozone(THREE, opts = {}) {
  const K = kit(THREE, opts);
  const g = new THREE.Group(); g.name = 'robozone';
  const W = 14, D = 7, H1 = 3.8, H2 = 1.6;            // ширина, глубина, первый этаж, фриз
  const silver = K.std(0xc9ccd1, { metalness: 0.7, roughness: 0.35 });
  const white = K.std(0xeceef0, { roughness: 0.5 });
  const navy = K.std(0x1b2440, { roughness: 0.8 });
  const blue = K.std(0x1f4fd8, { roughness: 0.7 });
  const carpet = K.std(0x2152c9, { roughness: 0.95 });
  const green = K.std(0x45d96a, { roughness: 0.5, emissive: 0x2a8c44, emissiveIntensity: 0.35 });
  const kraft = K.std(0xc79a62, { roughness: 0.9 });
  const ozonBox = K.std(0x2a57f0, { roughness: 0.6 });

  // подиум, ступени, пандус
  K.box(W + 1.6, 0.4, D + 1.4, carpet, 0, 0.2, 0.3, g);
  for (let i = 0; i < 2; i++) K.box(3.2, 0.2, 0.35, carpet, 0, 0.1 + i * 0.0, D / 2 + 1.2 + 0.35 * (1 - i), g).scale.y = (i + 1);
  const ramp = K.box(4.0, 0.1, 2.6, carpet, -(W + 1.6) / 2 - 1.98, 0.2, D / 2 - 0.2, g); ramp.rotation.z = 0.1;
  // пилоны и задник
  K.box(1.0, H1 + H2 + 0.2, D, silver, -W / 2 + 0.5, (H1 + H2) / 2 + 0.4, 0, g);
  K.box(1.0, H1 + H2 + 0.2, D, silver, W / 2 - 0.5, (H1 + H2) / 2 + 0.4, 0, g);
  K.box(W - 2, H1, 0.2, navy, 0, H1 / 2 + 0.4, -D / 2 + 0.1, g);
  K.box(0.15, H1, D - 0.4, navy, -W / 2 + 1.07, H1 / 2 + 0.4, 0, g);
  K.box(0.15, H1, D - 0.4, navy, W / 2 - 1.07, H1 / 2 + 0.4, 0, g);
  // потолок + фриз
  K.box(W - 2, 0.2, D, white, 0, H1 + 0.5, 0, g);
  const frieze = K.box(W - 2, H2, 0.3, white, 0, H1 + 0.4 + H2 / 2, D / 2 - 0.15, g);
  const logoTex = K.canvasTex(1024, 256, (c, w, h) => {
    c.textBaseline = 'middle'; c.font = '600 150px Arial'; c.fillStyle = '#1d2238'; c.fillText('OZON', 20, h / 2 + 8);
    const x = 20 + c.measureText('OZON').width + 24; c.fillStyle = '#45d36b'; c.font = '300 170px Arial'; c.fillText('{ech', x, h / 2 + 4);
  });
  K.plane(5.6, 1.4, new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.5, emissive: 0x45d36b, emissiveMap: logoTex, emissiveIntensity: 0.15 }), 2.0, H1 + 0.4 + H2 / 2, D / 2 + 0.01, 0, g);
  // ферма под фризом
  K.truss(new THREE.Vector3(-W / 2 + 1, H1 + 0.2, D / 2 - 0.4), new THREE.Vector3(W / 2 - 1, H1 + 0.2, D / 2 - 0.4), 0.4);
  // крыша-терраса: пол, перила, коробки
  const roofY = H1 + H2 + 0.5;
  K.box(W, 0.12, D, white, 0, roofY, 0, g);
  const rail = (x0, z0, x1, z1) => {
    const a = new THREE.Vector3(x0, roofY + 1.1, z0), b = new THREE.Vector3(x1, roofY + 1.1, z1);
    K.rod(a, b, 0.03); K.rod(a.clone().setY(roofY + 0.55), b.clone().setY(roofY + 0.55), 0.02);
    const n = Math.round(a.distanceTo(b) / 1.6);
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); K.rod(p.clone().setY(roofY), p, 0.025); }
  };
  rail(-W / 2, D / 2, W / 2, D / 2); rail(-W / 2, -D / 2, W / 2, -D / 2); rail(-W / 2, -D / 2, -W / 2, D / 2); rail(W / 2, -D / 2, W / 2, D / 2);
  const boxLabel = K.canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#2a57f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 64px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OZON', w / 2, h / 2 + 4); });
  const labelMat = new THREE.MeshStandardMaterial({ map: boxLabel, roughness: 0.6 });
  const roofBoxes = [];
  [[-5.5, 0.9, 1.2, 0.9, 0.6], [-4.4, 0.7, 0.7, 0.6, -1.4], [-1.8, 1.4, 0.8, 1.0, 1.0], [0.2, 0.8, 1.6, 0.8, -0.8], [3.0, 1.3, 1.1, 0.9, 0.9], [4.8, 1.1, 0.9, 0.9, -1.2], [5.6, 0.6, 0.6, 0.6, 1.6], [-3.0, 0.5, 0.9, 0.6, -2.4]].forEach(([x, h, w, d, z], i) => {
    const m = i % 3 === 1 ? kraft : [ozonBox, ozonBox, ozonBox, ozonBox, labelMat, labelMat];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, roofY + h / 2 + 0.06, z); b.castShadow = true; g.add(b); roofBoxes.push(b);
  });
  // зал: стеллажи с зелёными полками
  const rack = (x, z) => {
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.35, 0.35]) K.box(0.08, 3.4, 0.08, blue, x + dx, 2.1, z + dz, g);
    for (let i = 0; i < 4; i++) {
      const y = 0.75 + i * 0.95; K.box(1.9, 0.08, 0.8, green, x, y, z, g);
      if (i % 2 === 0) K.box(0.6, 0.45, 0.5, i ? kraft : ozonBox, x - 0.35, y + 0.27, z, g);
      if (i === 3) K.box(0.9, 0.6, 0.6, labelMat, x + 0.3, y + 0.34, z, g);
    }
  };
  rack(-4.6, -2.6); rack(3.2, -2.6);
  // «путь посылки», спираль стеков, статистика складов
  K.plane(3.2, 2.45, K.pic('robo-path.jpg'), -1.6, 2.2, -D / 2 + 0.22, 0, g);
  K.plane(1.4, 1.2, K.emis('robo-spiral.jpg', 0.6), -1.6, 3.9, -D / 2 + 0.22, 0, g).scale.set(1, 1, 1);
  K.plane(2.0, 2.25, K.emis('robo-stats.jpg', 0.35), -W / 2 + 1.16, 2.3, -0.6, Math.PI / 2, g);
  // игровой экран на тумбах
  K.box(1.0, 1.0, 0.8, blue, 0.9, 0.9, -1.2, g); K.box(1.0, 1.0, 0.8, blue, 1.95, 0.9, -1.2, g);
  const screen = K.box(1.2, 2.0, 0.08, K.std(0x111111), 1.42, 2.45, -1.2, g);
  const gameMat = K.emis('robo-game.jpg', 1.1);
  K.plane(1.1, 1.9, gameMat, 1.42, 2.45, -1.155, 0, g);
  // дженга
  const jenga = new THREE.Group(); jenga.position.set(5.2, 0.4, 1.2); g.add(jenga);
  K.box(1.2, 0.04, 1.2, green, 0, 0.02, 0, jenga);
  for (let i = 0; i < 14; i++) for (let k = 0; k < 3; k++) {
    const b = K.box(i % 2 ? 0.16 : 0.5, 0.1, i % 2 ? 0.5 : 0.16, blue, 0, 0.09 + i * 0.105, 0, jenga);
    if (i % 2) b.position.x = (k - 1) * 0.17; else b.position.z = (k - 1) * 0.17;
    if ((i * 3 + k) % 7 === 3) b.visible = false;
  }
  // стойка выдачи мерча
  K.box(2.0, 1.1, 0.8, blue, -4.4, 0.95, 1.8, g);
  K.plane(1.5, 0.375, new THREE.MeshStandardMaterial({ map: logoTex, transparent: true }), -4.4, 1.05, 2.21, 0, g);
  // рольганг с посылками
  const roller = new THREE.Group(); roller.position.set(-0.6, 0.4, 1.6); g.add(roller);
  K.box(4.2, 0.08, 0.9, silver, 0, 0.85, 0, roller);
  for (const x of [-1.9, 1.9]) for (const z of [-0.4, 0.4]) K.box(0.06, 0.85, 0.06, silver, x, 0.42, z, roller);
  const parcels = [0, 1, 2].map(i => K.box(0.55, 0.32, 0.45, i === 1 ? ozonBox : kraft, 0, 1.05, 0, roller));
  // свет: споты под потолком + холодный заполняющий
  const lights = new THREE.Group(); g.add(lights);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.SpotLight(0xffffff, 18, 9, 0.6, 0.5, 1.5); s.position.set(-4.8 + i * 2.4, H1 + 0.3, 0.8);
    s.target.position.set(-4.8 + i * 2.4, 0, -1.6); lights.add(s, s.target);
    K.box(0.25, 0.2, 0.25, K.std(0x222222), s.position.x, s.position.y, s.position.z, g);
  }
  const fill = new THREE.PointLight(0x7aa8ff, 6, 14, 1.5); fill.position.set(0, 2.5, 3); g.add(fill);
  K.flushRods(g);

  return {
    group: g, size: { w: W + 6, d: D + 4, h: roofY + 2.4 },
    solids: [{ x: 0, z: 0, w: W + 1.6, d: D + 1.4, h: roofY + 2 }],
    update(t, I = 1) {
      parcels.forEach((p, i) => { const u = ((t * 0.35 + i / 3) % 1); p.position.x = -1.9 + u * 3.8; });
      gameMat.emissiveIntensity = 0.8 + 0.3 * Math.sin(t * 6);
      roofBoxes.forEach((b, i) => { b.rotation.y = Math.sin(t * 0.3 + i) * 0.03; });
      fill.intensity = 6 * I;
    },
  };
}

// ───────────────────────── Т-ДОДЗЁ · «Чёрный пояс в ИТ» ─────────────────────────
// Круглый шатёр на фермах: 12 опор, чёрное кольцо «Т ОБРАЗОВАНИЕ», белый конус на мачте с растяжками,
// гирлянды флажков; перед входом жёлтые тории с чёрным поясом и табличкой, две сакуры;
// стойка «Старт/Финиш» из дерева с баннерами и фонарями; жёлтые столы Т-Академии на камнях.
export function buildTdojo(THREE, opts = {}) {
  const K = kit(THREE, opts);
  const g = new THREE.Group(); g.name = 'tdojo';
  const R = 12, ringY = 6.2, N = 12;
  const yellow = K.std(0xf5c400, { roughness: 0.5 });
  const black = K.std(0x141414, { roughness: 0.6 });
  const wood = K.std(0xb8642e, { roughness: 0.7 });
  const stone = K.std(0x9a9a96, { roughness: 1 });
  const canvasMat = K.std(0xf4f4f2, { roughness: 0.9, side: THREE.DoubleSide });

  // опоры-фермы, балласт, кольцо
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
    K.truss(new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x, ringY + 1.4, z), 0.35);
    K.box(1.1, 0.45, 1.1, black, x, 0.22, z, g);
    const ox = Math.cos(a) * (R + 3.5), oz = Math.sin(a) * (R + 3.5);           // растяжки
    K.rod(new THREE.Vector3(x, ringY, z), new THREE.Vector3(ox, 0, oz), 0.01);
  }
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    K.truss(new THREE.Vector3(Math.cos(a0) * R, ringY + 0.9, Math.sin(a0) * R), new THREE.Vector3(Math.cos(a1) * R, ringY + 0.9, Math.sin(a1) * R), 0.4);
  }
  // чёрная лента с надписью
  const bandTex = K.canvasTex(4096, 128, (c, w, h) => {
    c.fillStyle = '#121212'; c.fillRect(0, 0, w, h);
    c.font = 'bold 54px Arial'; c.textBaseline = 'middle';
    for (let k = 0; k < 4; k++) {
      const x0 = k * w / 4 + 360;
      c.fillStyle = '#ffdd2d'; c.beginPath(); c.moveTo(x0, 30); c.lineTo(x0 + 56, 30); c.lineTo(x0 + 56, 78); c.lineTo(x0 + 28, 100); c.lineTo(x0, 78); c.closePath(); c.fill();
      c.fillStyle = '#121212'; c.font = 'bold 44px Arial'; c.fillText('T', x0 + 14, 62);
      c.fillStyle = '#fff'; c.font = 'bold 54px Arial'; c.fillText('ОБРАЗОВАНИЕ', x0 + 80, 66);
    }
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 1.2, 96, 1, true), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.6 }));
  band.position.y = ringY; g.add(band);
  const bandIn = bandTex.clone(); bandIn.wrapS = THREE.RepeatWrapping; bandIn.repeat.x = -1; bandIn.needsUpdate = true;   // изнутри надпись читается не зеркально
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.22, R + 0.22, 1.2, 96, 1, true), new THREE.MeshStandardMaterial({ map: bandIn, roughness: 0.6, side: THREE.BackSide }));
  band2.position.y = ringY; g.add(band2);
  // конус шатра + мачта с выносами
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R - 0.2, 5.5, 64, 1, true), canvasMat); cone.position.y = ringY + 0.6 + 2.75; cone.castShadow = true; g.add(cone);
  K.truss(new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0, ringY + 7.5, 0), 0.4);
  for (const s of [-1, 1]) K.truss(new THREE.Vector3(0, ringY + 7.3, 0), new THREE.Vector3(s * 7, ringY + 2.5, 0), 0.3);
  // гирлянды флажков: два ряда между опорами
  const flagGeo = new THREE.PlaneGeometry(0.28, 0.36);
  const flagMats = [yellow, K.std(0xffffff, { side: THREE.DoubleSide }), black].map(m => { const c = m.clone(); c.side = THREE.DoubleSide; return c; });
  const flags = [];
  for (const fy of [ringY - 1.6, ringY - 3.2]) for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * R, fy, Math.sin(a0) * R), p1 = new THREE.Vector3(Math.cos(a1) * R, fy, Math.sin(a1) * R);
    K.rod(p0, p1, 0.006);
    for (let k = 0; k < 9; k++) {
      const u = (k + 0.5) / 9, p = p0.clone().lerp(p1, u); p.y -= Math.sin(u * Math.PI) * 0.35 + 0.2;
      const f = new THREE.Mesh(flagGeo, flagMats[k % 3]); f.position.copy(p); f.lookAt(0, p.y, 0); g.add(f); flags.push(f);
    }
  }
  // вертикальные баннеры на кольце
  const banMat = K.pic('tb-banner.jpg', { side: THREE.DoubleSide });
  for (const a of [Math.PI * 0.38, Math.PI * 0.62]) {
    const p = K.plane(1.4, 1.65, banMat, Math.cos(a) * (R + 0.35), ringY - 1.3, Math.sin(a) * (R + 0.35), 0, g);
    p.lookAt(Math.cos(a) * 40, ringY - 1.3, Math.sin(a) * 40);
  }

  g.userData.shell = g.children.length;                                // всё, что выше, — оболочка шатра
  // тории перед входом (+z)
  const torii = new THREE.Group(); torii.position.set(0, 0, R + 7); g.add(torii);
  for (const s of [-1, 1]) {
    K.box(0.7, 6.4, 0.7, yellow, s * 2.4, 3.6, 0, torii);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.9, 24), black); foot.position.set(s * 2.4, 0.45, 0); torii.add(foot);
  }
  K.box(6.4, 0.45, 0.6, yellow, 0, 5.4, 0, torii);                              // нуки
  const kasagiShape = new THREE.Shape();                                            // верхняя балка с поднятыми концами
  kasagiShape.moveTo(-4.6, 0.55); kasagiShape.quadraticCurveTo(0, 0.05, 4.6, 0.55); kasagiShape.lineTo(4.4, 0.85);
  kasagiShape.quadraticCurveTo(0, 0.45, -4.4, 0.85); kasagiShape.closePath();
  const kasagiGeo = new THREE.ExtrudeGeometry(kasagiShape, { depth: 1.0, bevelEnabled: false }); kasagiGeo.translate(0, 0, -0.5);
  const kasagi = new THREE.Mesh(kasagiGeo, black); kasagi.position.y = 6.55; kasagi.castShadow = true; torii.add(kasagi);
  const shimaki = new THREE.Mesh(kasagiGeo, yellow); shimaki.scale.set(0.97, 0.9, 0.85); shimaki.position.y = 6.25; torii.add(shimaki);
  K.box(0.5, 1.0, 0.5, yellow, 0, 6.2, 0, torii);
  // чёрный пояс-узел на верхней балке
  const knot = new THREE.Group(); knot.position.set(0, 7.5, 0.1); torii.add(knot);
  knot.position.set(0, 6.95, 0.55);
  K.box(0.7, 0.55, 0.22, black, 0, 0, 0, knot);
  for (const s of [-1, 1]) { const tail = K.box(0.42, 1.5, 0.08, black, s * 0.42, -0.85, 0.06, knot); tail.rotation.z = s * 0.42; }
  const sign = K.canvasTex(1024, 192, (c, w, h) => { c.fillStyle = '#ffdd2d'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 96px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Чёрный пояс в ИТ', w / 2, h / 2 + 6); });
  K.plane(3.2, 0.6, new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5 }), 0, 4.6, 0.36, 0, torii);
  // сакуры: ствол + розовые кроны из сфер
  const pink = K.std(0xf4a0c4, { roughness: 0.85, emissive: 0x5a1030, emissiveIntensity: 0.15 });
  const trunkM = K.std(0x4a3426);
  const pinkLight = K.std(0xffc4dc, { roughness: 0.85, emissive: 0x5a1030, emissiveIntensity: 0.1 });
  for (const s of [-1, 1]) {
    const tr = new THREE.Group(); tr.position.set(s * 5.2, 0, R + 7.4); g.add(tr);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), trunkM); trunk.position.y = 1.6; tr.add(trunk);
    for (let k = 0; k < 40; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + (k % 4) * 0.08, 0), k % 5 ? pink : pinkLight);
      const a = k * 2.399, r = 0.25 + Math.sqrt(k / 40) * 1.5; b.position.set(Math.cos(a) * r, 2.9 + ((k * 7) % 11) * 0.12 + (1.5 - r) * 0.4, Math.sin(a) * r * 0.8); b.rotation.set(k, k * 2, 0); tr.add(b);
    }
    for (let k = 0; k < 4; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.4, 5), trunkM); br.position.set(Math.cos(k * 1.6) * 0.4, 2.9, Math.sin(k * 1.6) * 0.3); br.rotation.set(Math.sin(k * 1.6) * 0.8, 0, -Math.cos(k * 1.6) * 0.8); tr.add(br); }
  }
  // стойка «Старт / Финиш»
  const booth = new THREE.Group(); booth.position.set(-6.5, 0, R - 3.5); booth.rotation.y = 0.5; g.add(booth);
  K.box(4.6, 1.1, 0.12, K.pic('tb-front.jpg'), 0, 0.55, 0.9, booth);
  K.box(4.6, 0.1, 1.9, wood, 0, 1.15, 0, booth);
  for (const s of [-1, 1]) K.box(0.12, 2.8, 1.9, wood, s * 2.3, 1.4, 0, booth);
  K.box(4.6, 0.12, 1.9, wood, 0, 2.8, 0, booth);
  for (let i = 0; i < 14; i++) K.box(0.05, 1.6, 0.05, wood, -1.2 + i * 0.18, 2.0, -0.85, booth);
  const startTex = (txt, bg, fg) => K.canvasTex(256, 320, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = 'bold 44px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2); });
  [[banMat, -1.7], [new THREE.MeshStandardMaterial({ map: startTex('Старт', '#ffdd2d', '#111'), side: THREE.DoubleSide }), -0.57], [banMat, 0.57], [new THREE.MeshStandardMaterial({ map: startTex('Финиш', '#151515', '#ffdd2d'), side: THREE.DoubleSide }), 1.7]]
    .forEach(([m, x]) => K.plane(1.08, 1.35, m, x, 3.5, 0.95, 0, booth));
  const lanterns = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe2a0, emissiveIntensity: 1.4 }));
    l.scale.y = 1.25; l.position.set(s * 2.55, 3.7, 1.0); booth.add(l); lanterns.push(l);
  }
  // столы Т-Академии на камнях — внутри шатра по кругу
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.15 + i * 0.5), tbl = new THREE.Group();
    tbl.position.set(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5); tbl.rotation.y = -a + Math.PI / 2; g.add(tbl);
    K.box(4.2, 0.1, 0.9, yellow, 0, 1.0, 0, tbl);
    for (const x of [-1.6, 0, 1.6]) {
      const r1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), stone); r1.position.set(x, 0.38, 0); r1.scale.set(1, 0.95, 0.8); tbl.add(r1);
      const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), stone); r2.position.set(x + 0.05, 0.82, 0); tbl.add(r2);
    }
    for (const x of [-1.0, 1.0]) K.box(0.08, 0.35, 0.5, yellow, x, 1.22, 0, tbl);
  }
  // «Спарринг ума»: гигантские поля го 3×3 на полу с чёрными и белыми камнями
  const goBoard = K.canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#f5c400'; c.beginPath(); c.roundRect(0, 0, w, h, 48); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 14; for (const k of [1, 2]) { c.beginPath(); c.moveTo(k * w / 3, 30); c.lineTo(k * w / 3, h - 30); c.stroke(); c.beginPath(); c.moveTo(30, k * h / 3); c.lineTo(w - 30, k * h / 3); c.stroke(); }
  });
  const goStones = [];
  for (const [gx, gz] of [[-2.7, 0.9], [2.5, -2.1]]) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 3.2), [yellow, yellow, new THREE.MeshStandardMaterial({ map: goBoard, roughness: 0.5 }), yellow, yellow, yellow]);
    mat.position.set(gx, 0.03, gz); mat.receiveShadow = true; g.add(mat);
    [[0, 0, 1], [1, 0, 0], [2, 0, 1], [1, 1, 1], [2, 1, 0], [2, 2, 0], [0, 2, 1]].forEach(([i, j, b]) => {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12), K.std(b ? 0x161616 : 0xf2f2f2, { roughness: 0.3 }));
      st.scale.y = 0.38; st.position.set(gx - 1.07 + i * 1.07, 0.2, gz - 1.07 + j * 1.07); st.castShadow = true; g.add(st); goStones.push(st);
    });
  }
  // святилища DANO: жёлтая рама, чёрная изогнутая кровля, панель с поясом, флажки
  const danoMat = K.pic('tb-dano.jpg');
  const roofShape = new THREE.Shape(); roofShape.moveTo(-1.3, 0.25); roofShape.quadraticCurveTo(0, -0.05, 1.3, 0.25); roofShape.lineTo(1.2, 0.42); roofShape.quadraticCurveTo(0, 0.18, -1.2, 0.42); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.5, bevelEnabled: false }); roofGeo.translate(0, 0, -0.25);
  for (const a of [Math.PI * 1.15, Math.PI * 1.85]) {
    const sh = new THREE.Group(); sh.position.set(Math.cos(a) * 10.2, 0, Math.sin(a) * 10.2); sh.rotation.y = -a - Math.PI / 2; g.add(sh);
    K.box(2.0, 0.15, 0.8, yellow, 0, 0.08, 0, sh);
    for (const s of [-1, 1]) K.box(0.16, 2.5, 0.16, yellow, s * 0.85, 1.3, 0, sh);
    K.box(2.1, 0.14, 0.2, yellow, 0, 2.45, 0, sh);
    K.box(1.4, 1.75, 0.06, K.std(0xd6a800), 0, 1.38, 0, sh);
    K.plane(1.3, 1.65, danoMat, 0, 1.38, 0.04, 0, sh);
    const roof = new THREE.Mesh(roofGeo, black); roof.position.y = 2.42; sh.add(roof);
    for (const s of [-1, 1]) { K.box(0.03, 0.9, 0.03, black, s * 1.1, 1.6, 0.05, sh); const fl = K.box(0.3, 0.42, 0.02, yellow, s * 1.1 + s * 0.15, 1.85, 0.05, sh); fl.rotation.z = s * 0.05; }
  }
  // лимонадный бар «Попробуй свой путь на вкус»
  const bar = new THREE.Group(); bar.position.set(7.5, 0, R - 3.8); bar.rotation.y = -0.55; g.add(bar);
  K.box(2.6, 1.1, 0.12, K.pic('tb-bar-front.jpg'), 0, 0.55, 0.7, bar);
  K.box(2.6, 0.08, 1.5, wood, 0, 1.12, 0, bar);
  for (const s of [-1, 1]) K.box(0.12, 2.6, 1.5, wood, s * 1.3, 1.3, 0, bar);
  for (let i = 0; i < 9; i++) K.box(0.05, 1.5, 0.05, wood, -0.8 + i * 0.2, 1.9, -0.7, bar);
  K.box(2.8, 0.6, 0.1, K.pic('tb-bar-head.jpg'), 0, 2.95, 0.72, bar);
  K.box(2.8, 0.5, 0.1, black, 0, 3.5, 0.72, bar);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe2a0, emissiveIntensity: 1.4 })); l.scale.y = 1.25; l.position.set(s * 1.55, 3.3, 0.8); bar.add(l); lanterns.push(l); }
  // штендеры «Тэнгэн» у станций
  const shtMat = K.pic('tb-shtender.jpg');
  for (const a of [Math.PI * 0.05, Math.PI * 0.55, Math.PI * 1.05, Math.PI * 1.5]) {
    const st = new THREE.Group(); st.position.set(Math.cos(a) * 9.8, 0, Math.sin(a) * 9.8); st.rotation.y = -a - Math.PI / 2; g.add(st);
    K.box(0.6, 0.08, 0.4, yellow, 0, 0.04, 0, st);
    K.box(0.5, 1.75, 0.08, yellow, 0, 0.95, 0, st);
    K.plane(0.46, 1.72, shtMat, 0, 0.95, 0.045, 0, st);
  }
  // свет: тёплый под шатром, контровой на тории
  const warm = new THREE.PointLight(0xffe6b0, 30, 22, 1.4); warm.position.set(0, ringY - 0.5, 0); g.add(warm);
  const key = new THREE.SpotLight(0xfff4e0, 22, 30, 0.5, 0.6, 1.2); key.position.set(4, 12, R + 16); key.target = torii; g.add(key);
  K.flushRods(g);

  return {
    group: g, size: { w: 2 * R + 8, d: 2 * R + 16, h: ringY + 8 },
    solids: [{ x: 0, z: 0, w: 2 * R + 1, d: 2 * R + 1, h: ringY + 8 }, { x: 0, z: R + 7, w: 9, d: 1.2, h: 8 }],
    update(t, I = 1) {
      flags.forEach((f, i) => { f.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.12; });
      lanterns.forEach((l, i) => { l.material.emissiveIntensity = 1.2 + 0.25 * Math.sin(t * 3 + i * 2); });
      knot.rotation.z = Math.sin(t * 0.8) * 0.03;
      warm.intensity = 30 * I;
    },
  };
}

// ───────────────────────── OZON CORP · переулок мегаполиса будущего ─────────────────────────
// Доработка зоны Ozon Corp строго по фактам кейса: переулок азиатского мегаполиса будущего — граффити, неон,
// светофоры, потрескавшийся асфальт; камеры наблюдения снимают гостей и выводят на ретро-телевизоры;
// за фото — жетон для автомата с сертификатами Ozon. Ставится вокруг существующей модели ozon-corp.min.glb.
// update(t, I, camPos) — камеры наблюдения поворачиваются за зрителем.
export function buildOzonCorpAlley(THREE, opts = {}) {
  const K = kit(THREE, opts);
  const kvUrl = opts.kv || 'assets/cases/ozon-fandom-kv-1.jpg';
  const g = new THREE.Group(); g.name = 'ozonCorpAlley';
  const L = opts.length || 22, Wd = opts.width || 9, H = 6;
  const magenta = new THREE.MeshBasicMaterial({ color: 0xff2bd6 }), cyan = new THREE.MeshBasicMaterial({ color: 0x29b6ff });
  // асфальт с трещинами и мокрыми бликами
  const asph = K.canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = '#17171c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.strokeStyle = '#050507'; c.lineWidth = 3;
    for (let k = 0; k < 26; k++) { let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 7; j++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = '#e8e8e8'; for (let k = 0; k < 6; k++) c.fillRect(w / 2 - 8, k * 180 + 30, 16, 90);
  });
  asph.wrapS = asph.wrapT = THREE.RepeatWrapping; asph.repeat.set(1, L / Wd);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(Wd, L), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.35, metalness: 0.3 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = true; g.add(ground);
  // две граффити-стены с ключевым визуалом кейса
  const kv = new THREE.TextureLoader().load(kvUrl); kv.colorSpace = THREE.SRGBColorSpace; kv.wrapS = THREE.RepeatWrapping; kv.repeat.set(L / 14, 1);
  const kvMat = new THREE.MeshStandardMaterial({ map: kv, emissive: 0xffffff, emissiveMap: kv, emissiveIntensity: 0.35, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const w = K.box(0.4, H, L, K.std(0x101018), s * (Wd / 2 + 0.2), H / 2, 0, g);
    const mural = K.plane(L, H - 0.6, kvMat, s * (Wd / 2 - 0.01), H / 2 - 0.1, 0, -s * Math.PI / 2, g);
    // неоновые кромки сверху и у пола
    K.box(0.06, 0.06, L, s < 0 ? magenta : cyan, s * (Wd / 2 - 0.05), H - 0.25, 0, g);
    K.box(0.05, 0.05, L, s < 0 ? cyan : magenta, s * (Wd / 2 - 0.05), 0.12, 0, g);
  }
  // неоновые вывески-иероглифы на консолях
  const signs = [];
  const neonSign = (txt, col, x, y, z, side) => {
    const t = K.canvasTex(256, 768, (c, w, h) => { c.fillStyle = '#0a0a10'; c.fillRect(0, 0, w, h); c.strokeStyle = col; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20); c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 30; c.font = 'bold 150px sans-serif'; c.textAlign = 'center'; [...txt].forEach((ch, i) => c.fillText(ch, w / 2, 170 + i * 190)); });
    const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.8), [m, m, m, m, m, m]); p.position.set(x, y, z); g.add(p); signs.push(m);
    K.box(0.8, 0.08, 0.08, K.std(0x333333, { metalness: 0.8 }), x - side * 0.45, y + 1.0, z, g);
  };
  neonSign('世界ON', '#ff3bd8', -Wd / 2 + 0.6, 3.8, -L * 0.25, -1);
  neonSign('OZON', '#3ec9ff', Wd / 2 - 0.6, 4.0, L * 0.1, 1);
  neonSign('徐行', '#ffe14a', -Wd / 2 + 0.6, 3.6, L * 0.3, -1);
  // светофоры с циклом
  const tl = [];
  for (const [x, z] of [[-Wd / 2 + 0.9, L / 2 - 2], [Wd / 2 - 0.9, -L / 2 + 3]]) {
    K.box(0.12, 3.2, 0.12, K.std(0x222222, { metalness: 0.6 }), x, 1.6, z, g);
    K.box(0.42, 1.2, 0.32, K.std(0x111111), x, 3.6, z, g);
    const lamps = [0xff2a2a, 0xffc02a, 0x2aff6a].map((c, i) => { const m = new THREE.MeshBasicMaterial({ color: c }); const l = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), m); l.position.set(x, 3.95 - i * 0.36, z + (z > 0 ? -0.17 : 0.17)); if (z > 0) l.rotation.y = Math.PI; g.add(l); return { m, c }; });
    tl.push(lamps);
  }
  // треугольный знак SLOW
  const slow = K.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w / 2, h - 10); c.lineTo(10, 20); c.lineTo(w - 10, 20); c.closePath(); c.fill(); c.strokeStyle = '#e0202a'; c.lineWidth = 22; c.stroke(); c.fillStyle = '#111'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('徐行', w / 2, 100); c.font = 'bold 30px sans-serif'; c.fillText('SLOW', w / 2, 140); });
  K.box(0.07, 1.6, 0.07, K.std(0x888888, { metalness: 0.8 }), Wd / 2 - 1.4, 0.8, L / 2 - 4, g);
  K.plane(0.9, 0.9, new THREE.MeshStandardMaterial({ map: slow, transparent: true, side: THREE.DoubleSide }), Wd / 2 - 1.4, 1.9, L / 2 - 3.96, 0, g);
  // камеры наблюдения на стенах
  const cams = [];
  for (const [x, z] of [[-Wd / 2 + 0.3, -L * 0.1], [Wd / 2 - 0.3, L * 0.35], [Wd / 2 - 0.3, -L * 0.38]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, H - 0.8, z); g.add(pivot);
    K.box(0.5, 0.08, 0.08, K.std(0xcccccc), -Math.sign(x) * 0.25, 0.1, 0, pivot);
    const body = new THREE.Group(); pivot.add(body);
    K.box(0.22, 0.2, 0.55, K.std(0xe8e8e8, { roughness: 0.3 }), 0, 0, 0.1, body);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0.07, 0.07, 0.38); body.add(led);
    cams.push({ pivot, body, led });
  }
  // автомат с жетонами и сертификатами
  const vend = new THREE.Group(); vend.position.set(-Wd / 2 + 1.0, 0, L / 2 - 5.5); vend.rotation.y = Math.PI / 2; g.add(vend);
  K.box(1.2, 2.1, 0.8, K.std(0x2547ff, { roughness: 0.35 }), 0, 1.05, 0, vend);
  const vendScreen = K.canvasTex(256, 320, (c, w, h) => { c.fillStyle = '#05060f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3bd8'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.fillText('OZON CORP', w / 2, 60); c.fillStyle = '#3ec9ff'; c.font = '24px sans-serif'; c.fillText('ЖЕТОН → СЕРТИФИКАТ', w / 2, 110); for (let i = 0; i < 6; i++) { c.strokeStyle = '#3ec9ff'; c.strokeRect(30 + (i % 3) * 68, 140 + Math.floor(i / 3) * 80, 56, 64); } });
  const vendMat = new THREE.MeshBasicMaterial({ map: vendScreen, toneMapped: false });
  K.plane(0.9, 1.1, vendMat, 0, 1.4, 0.41, 0, vend);
  K.box(0.3, 0.12, 0.05, K.std(0x111111), 0.3, 0.6, 0.41, vend);
  const token = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20), K.std(0xffd34a, { metalness: 1, roughness: 0.2 })); token.rotation.x = Math.PI / 2; vend.add(token);
  // кабели и фонари над переулком
  const lamps = [];
  for (let k = 0; k < 5; k++) {
    const z = -L / 2 + 2 + k * (L - 4) / 4, sag = 0.6;
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector3(-Wd / 2 + u * Wd, H - 0.4 - Math.sin(u * Math.PI) * sag, z + Math.sin(u * 6 + k) * 0.2)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.015, 4), K.std(0x111111)));
    for (const u of [0.3, 0.7]) {
      const p = pts[Math.round(u * 12)]; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 12), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xff3b5c : 0xffd27a, toneMapped: false }));
      l.position.copy(p).add(new THREE.Vector3(0, -0.35, 0)); g.add(l); lamps.push(l);
    }
  }
  // цветной свет переулка
  const pm = new THREE.PointLight(0xff2bd6, 14, 14, 1.6); pm.position.set(-Wd / 2 + 1, 3, -L * 0.2); g.add(pm);
  const pc = new THREE.PointLight(0x29b6ff, 14, 14, 1.6); pc.position.set(Wd / 2 - 1, 3, L * 0.2); g.add(pc);
  const tmp = new THREE.Vector3();
  return {
    group: g, size: { w: Wd + 1, d: L, h: H },
    solids: [{ x: -Wd / 2 - 0.2, z: 0, w: 0.6, d: L, h: H }, { x: Wd / 2 + 0.2, z: 0, w: 0.6, d: L, h: H }],
    update(t, I = 1, camPos) {
      const phase = Math.floor(t / 2.5) % 3;                             // красный → жёлтый → зелёный
      tl.forEach(lamps => lamps.forEach((l, i) => l.m.color.setHex(i === phase ? l.c : 0x1a1a1a)));
      signs.forEach((m, i) => { const f = Math.sin(t * 13 + i * 5) > 0.93 ? 0.35 : 1; m.color.setScalar(f); });
      cams.forEach((c, i) => {
        if (camPos) { c.pivot.updateWorldMatrix(true, false); tmp.copy(camPos); c.pivot.worldToLocal(tmp); c.body.rotation.y = Math.atan2(tmp.x, tmp.z); c.body.rotation.x = -Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) * 0.8; }
        else c.body.rotation.y = Math.sin(t * 0.6 + i) * 0.9;
        c.led.visible = Math.sin(t * 6 + i) > 0;
      });
      const u = (t * 0.5) % 1; token.position.set(0.3, 1.2 - u * 0.62, 0.45 + u * 0.05); token.visible = u < 0.9;
      lamps.forEach((l, i) => { l.position.x += Math.sin(t * 1.3 + i) * 0.0008; });
      pm.intensity = 14 * I; pc.intensity = 14 * I;
    },
  };
}

// ───────────────────────── ЗОНЫ ИЗ СГЕНЕРИРОВАННЫХ МОДЕЛЕЙ (Higgsfield → Блендер) ─────────────────────────
// Модели по рендерам из презентаций: assets/zones/models/*.glb (Draco, метры, низ в y=0, фасад в +z).
// buildTdojoGen(THREE, gltfLoader) и buildRobozoneGen(THREE, gltfLoader) возвращают тот же интерфейс,
// что процедурные: { group, update, solids, size, ready: Promise }. gltfLoader должен иметь DRACOLoader.
const MODELS = 'assets/zones/models/';
function loadInto(loader, url, parent, place) {
  return new Promise((res) => loader.load(url, (g) => {
    const o = g.scene; o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    place(o); parent.add(o); res(o);
  }, undefined, () => res(null)));
}
export function buildTdojoGen(THREE, loader, opts = {}) {
  const base = opts.models || MODELS;
  const shell = buildTdojo(THREE, opts);                                    // чёткая оболочка шатра из кода
  const g = shell.group; g.name = 'tdojoGen';
  g.children.slice(g.userData.shell).forEach((c) => { if (!c.isLight && !c.isInstancedMesh && !(c.target && c.target.isObject3D)) g.remove(c); });
  const R = 12;
  const at = (x, z, ry = 0, s = 1) => (o) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); };
  const jobs = [
    loadInto(loader, base + 'torii.glb', g, at(0, R + 6)),
    loadInto(loader, base + 'booth.glb', g, at(-6.2, R - 4.2, 0.45)),
    loadInto(loader, base + 'bar.glb', g, at(6.4, R - 4.4, -0.5)),
    loadInto(loader, base + 'dano.glb', g, at(-8.4, -3.5, 1.2)),
    loadInto(loader, base + 'dano.glb', g, at(8.4, -3.8, -1.2)),
  ];
  [0.15, 0.65, 1.15, 1.65].forEach((k) => { const a = Math.PI * k; jobs.push(loadInto(loader, base + 'table.glb', g, at(Math.cos(a) * 6.3, Math.sin(a) * 6.3, -a + Math.PI / 2))); });
  [0.05, 0.55, 1.05, 1.5].forEach((k) => { const a = Math.PI * k; jobs.push(loadInto(loader, base + 'shtender.glb', g, at(Math.cos(a) * 9.6, Math.sin(a) * 9.6, -a - Math.PI / 2))); });
  // поля го — процедурно (в презентации это плоский мат на полу)
  const goTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#f5c400'; x.fillRect(0, 0, 512, 512); x.strokeStyle = '#fff'; x.lineWidth = 14;
    for (const k of [1, 2]) { x.beginPath(); x.moveTo(k * 512 / 3, 30); x.lineTo(k * 512 / 3, 482); x.stroke(); x.beginPath(); x.moveTo(30, k * 512 / 3); x.lineTo(482, k * 512 / 3); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const [gx, gz] of [[-2.7, 0.9], [2.5, -2.1]]) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 3.2), new THREE.MeshStandardMaterial({ map: goTex, roughness: 0.5 })); mat.position.set(gx, 0.025, gz); mat.receiveShadow = true; g.add(mat);
    [[0, 0, 1], [1, 0, 0], [2, 0, 1], [1, 1, 1], [2, 1, 0], [2, 2, 0], [0, 2, 1]].forEach(([i, j, b]) => {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12), new THREE.MeshStandardMaterial({ color: b ? 0x161616 : 0xf2f2f2, roughness: 0.3 }));
      st.scale.y = 0.38; st.position.set(gx - 1.07 + i * 1.07, 0.2, gz - 1.07 + j * 1.07); st.castShadow = true; g.add(st);
    });
  }
  return { group: g, size: shell.size, ready: Promise.all(jobs),
    solids: [{ x: 0, z: 0, w: 2 * R + 1, d: 2 * R + 1, h: 9 }, { x: 0, z: R + 6, w: 5.5, d: 1.4, h: 3.6 }],
    update(t, I = 1) { shell.update(t, I); } };
}
export function buildRobozoneGen(THREE, loader, opts = {}) {
  const base = opts.models || MODELS;
  const g = new THREE.Group(); g.name = 'robozoneGen';
  const job = loadInto(loader, base + 'robozone.glb', g, (o) => { o.position.set(0, 0, 0); });
  const lights = [];
  for (let i = 0; i < 4; i++) { const s = new THREE.SpotLight(0xffffff, 14, 10, 0.7, 0.5, 1.5); s.position.set(-4.5 + i * 3, 3.9, 1.5); s.target.position.set(-4.5 + i * 3, 0, -1.5); g.add(s, s.target); lights.push(s); }
  const fill = new THREE.PointLight(0x6fa0ff, 8, 16, 1.5); fill.position.set(0, 2.5, 4); g.add(fill);
  return { group: g, size: { w: 15, d: 12, h: 6.5 }, ready: job,
    solids: [{ x: 0, z: 0, w: 14.2, d: 11.4, h: 6.5 }],
    update(t, I = 1) { fill.intensity = 8 * I; lights.forEach((l) => (l.intensity = 14 * I)); } };
}

// ───────────────────────── OZON CORP и OZON СЕЛЕКТ из сгенерированных моделей ─────────────────────────
// ozoncorp.glb — Higgsfield по двум ракурсам 3D-макета кейса (лучше старой tripo-модели), 14 м по X, низ y=0,
//   стены граффити/неон с лёгкой эмиссией. Переулок buildOzonCorpAlley ставится вокруг неё.
// select.glb — Higgsfield по чистому рендеру, собранному в GPT Image из фото с VK TUSA, 18 м по X;
//   поверх размытых надписей модели — чёткие вывески кодом (лайтбокс «СЕЛЕКТ / OZON», неон «СЕЛЕКТ カエカ»).
export function buildOzonCorpGen(THREE, loader, opts = {}) {
  const base = opts.models || MODELS;
  const g = new THREE.Group(); g.name = 'ozonCorpGen';
  const job = loadInto(loader, base + 'ozoncorp.glb', g, () => {});
  const pm = new THREE.PointLight(0xff2bd6, 16, 14, 1.6); pm.position.set(-4, 3.2, 3); g.add(pm);
  const pc = new THREE.PointLight(0x29b6ff, 16, 14, 1.6); pc.position.set(4, 3.2, 3); g.add(pc);
  return { group: g, size: { w: 14, d: 7.6, h: 4.5 }, ready: job, solids: [{ x: 0, z: 0, w: 14, d: 7.6, h: 4.5 }],
    update(t, I = 1) { pm.intensity = (14 + 3 * Math.sin(t * 2.1)) * I; pc.intensity = (14 + 3 * Math.sin(t * 1.7 + 1)) * I; } };
}
export function buildSelectGen(THREE, loader, opts = {}) {
  const base = opts.models || MODELS;
  const g = new THREE.Group(); g.name = 'selectGen';
  const job = loadInto(loader, base + 'select.glb', g, () => {});
  const ctex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const light = ctex(1024, 512, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfeee9'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0d0e10'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#0d0e10';
    c.font = '300 150px "Helvetica Neue", Arial'; c.fillText('СЕЛЕКТ', w / 2, h / 2 - 30); c.strokeText('СЕЛЕКТ', w / 2, h / 2 - 30);
    c.font = '700 54px Arial'; c.fillText('OZON', w / 2, h / 2 + 95);
  });
  const lb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshStandardMaterial({ map: light, emissive: 0xffffff, emissiveMap: light, emissiveIntensity: 0.9, roughness: 0.4 }));
  lb.position.set(-4.3, 1.95, -0.86); g.add(lb);
  const sign = ctex(1024, 192, (c, w, h) => {
    c.fillStyle = '#0b0b0c'; c.fillRect(0, 0, w * 0.62, h);
    c.textBaseline = 'middle'; c.fillStyle = '#ffffff'; c.font = '200 104px "Helvetica Neue", Arial'; c.fillText('СЕЛЕКТ', 40, h / 2 - 6);
    c.font = '700 30px Arial'; c.fillText('OZON', 200, h - 26);
    c.fillStyle = '#ff2a2a'; c.shadowColor = '#ff2a2a'; c.shadowBlur = 28; c.font = 'bold 130px sans-serif'; c.fillText('カエカ', w * 0.64, h / 2 + 6);
  });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }));
  sg.position.set(5.6, 3.4, -0.86); g.add(sg);
  const wash = new THREE.PointLight(0x9fe8d0, 10, 12, 1.6); wash.position.set(-4.5, 2.2, 2.5); g.add(wash);
  const red = new THREE.PointLight(0xff2a2a, 6, 8, 1.8); red.position.set(6.5, 3.2, 1.2); g.add(red);
  return { group: g, size: { w: 18, d: 4.6, h: 4.1 }, ready: job, solids: [{ x: 0, z: 0, w: 18, d: 4.6, h: 4.1 }],
    update(t, I = 1) { wash.intensity = 10 * I; red.intensity = (6 + (Math.sin(t * 9) > 0.9 ? -4 : 0)) * I; } };
}
