import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(0, 0.07, -1).normalize();

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });
}

function mesh(geo, mat, pos = [0, 0, 0], parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glowTex = canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

const smokeTex = canvasTexture(128, (g, s) => {
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const y = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const rad = s * (0.18 + Math.random() * 0.15);
    const r = g.createRadialGradient(x, y, 0, x, y, rad);
    r.addColorStop(0, 'rgba(235,230,225,0.35)');
    r.addColorStop(1, 'rgba(235,230,225,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }
});

const runeTex = canvasTexture(256, (g, s) => {
  g.translate(s / 2, s / 2);
  g.strokeStyle = 'white';
  g.shadowColor = 'white';
  g.shadowBlur = 8;
  g.lineWidth = 5;
  for (const rad of [118, 96]) {
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    g.save();
    g.rotate((i / 16) * Math.PI * 2);
    g.beginPath();
    g.moveTo(-8, -107);
    g.lineTo(0, -114);
    g.lineTo(8, -107);
    g.lineTo(0, -100);
    g.closePath();
    g.stroke();
    g.restore();
  }
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 * 2;
    g.lineTo(Math.sin(a) * 90, -Math.cos(a) * 90);
  }
  g.stroke();
});

// ---------- environment ----------

function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2c2a78) },
      mid: { value: new THREE.Color(0xc06aa6) },
      horizon: { value: new THREE.Color(0xffa45c) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.18, 0.7, h));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.85,0.55) * pow(d, 400.0) * 2.0;
        c += vec3(1.0,0.6,0.3) * pow(d, 12.0) * 0.6;
        // soft cloud streaks
        float s = sin(vDir.x*18.0 + sin(vDir.y*40.0)*1.5) * sin(vDir.y*55.0 + vDir.x*6.0);
        c += vec3(1.0,0.7,0.6) * smoothstep(0.55,1.0,s) * smoothstep(0.05,0.2,h) * (1.0 - smoothstep(0.3,0.5,h)) * 0.18;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat));
}

function hash(x, z) {
  return Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.23 + Math.sin(x * 0.13) * 2);
}

function buildGround(scene) {
  const geo = new THREE.PlaneGeometry(260, 260, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const gold = new THREE.Color(0xc9a24a);
  const green = new THREE.Color(0x5f7d34);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z * 1.6);
    const n = hash(x, z);
    pos.setY(i, n * 0.35 * Math.min(1, dist / 12) + Math.max(0, -z - 30) * 0.08);
    c.copy(gold).lerp(green, THREE.MathUtils.clamp(0.5 + n * 0.5 + (-z / 60), 0, 1));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // river of light toward the sun
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 60),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(1.5, 0.3, -48);
  scene.add(river);
}

function buildMountains(scene) {
  const rock = std(0x5a5f9a, { flatShading: true, roughness: 0.9 });
  const far = std(0x7a74b0, { flatShading: true, roughness: 0.9 });
  const snow = std(0xf3e6f0, { flatShading: true });
  for (let i = 0; i < 26; i++) {
    const layer = i % 2;
    const x = -150 + i * 12 + Math.sin(i * 3.1) * 5;
    const h = 7 + Math.abs(Math.sin(i * 1.7)) * (layer ? 16 : 9);
    const r = h * 0.85;
    const z = layer ? -120 : -95;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    mesh(new THREE.ConeGeometry(r, h, 7), layer ? far : rock, [0, h / 2, 0], g);
    mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), snow, [0, h * 0.84 + 0.05, 0], g);
    g.rotation.y = i;
    scene.add(g);
  }
}

function yurt(x, z, s = 1) {
  const g = new THREE.Group();
  const felt = std(0xf2e8d6);
  mesh(new THREE.CylinderGeometry(1.5, 1.55, 1.2, 24), felt, [0, 0.6, 0], g);
  mesh(new THREE.ConeGeometry(1.7, 1.0, 24), std(0xe6d6bc), [0, 1.7, 0], g);
  mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.12, 24), std(0x9b3a2a), [0, 1.0, 0], g);
  const door = mesh(
    new THREE.PlaneGeometry(0.6, 0.85),
    new THREE.MeshStandardMaterial({ color: 0xffb050, emissive: 0xff9a30, emissiveIntensity: 1.6 }),
    [0, 0.43, 1.56],
    g,
  );
  door.castShadow = false;
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = Math.atan2(-x, 20 - z) * 0.6;
  return g;
}

function buildProps(scene) {
  [[-11, -12, 1], [9, -15, 1.1], [-20, -24, 1], [17, -26, 0.9], [-4, -32, 0.9], [26, -14, 1.2], [-28, -10, 1.2]]
    .forEach(([x, z, s]) => scene.add(yurt(x, z, s)));

  const pine = std(0x29452e, { flatShading: true });
  for (let i = 0; i < 40; i++) {
    const x = -60 + i * 3 + Math.sin(i * 7.3) * 2;
    if (Math.abs(x - 1.5) < 3) continue;
    const z = -38 - Math.abs(Math.sin(i * 2.3)) * 8;
    const h = 2.5 + Math.abs(Math.sin(i * 5.1)) * 2;
    mesh(new THREE.ConeGeometry(h * 0.3, h, 6), pine, [x, h / 2, z], scene);
  }

  const stone = std(0x8a8079, { flatShading: true });
  [[-6, 2.5, 1.0], [5.5, 3, 0.8], [-2, 4.2, 0.5], [7.5, 0.5, 1.2], [-8, -2, 0.9], [2.5, 4.5, 0.4]].forEach(([x, z, s], i) => {
    const r = mesh(new THREE.DodecahedronGeometry(s, 0), stone, [x, s * 0.25, z], scene);
    r.scale.y = 0.45;
    r.rotation.y = i;
  });

  // grazing horses, very stylised
  const horseMat = std(0x5a3a26);
  [[-7, -18], [-5.5, -19], [12, -21]].forEach(([x, z], i) => {
    const h = new THREE.Group();
    mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), horseMat, [0, 0.85, 0], h).rotation.z = Math.PI / 2;
    mesh(new THREE.CapsuleGeometry(0.12, 0.45, 4, 8), horseMat, [0.55, 0.85, 0], h).rotation.z = -0.9;
    for (const [lx, lz] of [[-0.35, 0.15], [-0.35, -0.15], [0.35, 0.15], [0.35, -0.15]]) {
      mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6), horseMat, [lx, 0.3, lz], h);
    }
    h.position.set(x, 0, z);
    h.rotation.y = i * 2;
    scene.add(h);
  });
}

// ---------- characters ----------

function limb(radius, length, mat, parent, pos) {
  const pivot = new THREE.Group();
  pivot.position.set(...pos);
  mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat, [0, -length / 2 - radius * 0.5, 0], pivot);
  parent.add(pivot);
  return pivot;
}

function face(head, r, skin) {
  const eye = std(0x1a1210, { roughness: 0.3 });
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(r * 0.12, 10, 8), std(0xffffff), [s * r * 0.36, r * 0.08, r * 0.86], head);
    mesh(new THREE.SphereGeometry(r * 0.07, 8, 6), eye, [s * r * 0.36, r * 0.08, r * 0.96], head);
    mesh(new THREE.BoxGeometry(r * 0.32, r * 0.06, r * 0.05), eye, [s * r * 0.36, r * 0.3, r * 0.9], head).rotation.z = -s * 0.25;
  }
  mesh(new THREE.SphereGeometry(r * 0.12, 8, 6), skin, [0, -r * 0.1, r * 0.98], head);
}

function makeHero() {
  const root = new THREE.Group();
  const skin = std(0xf0bf96);
  const shirt = std(0xd8702a);
  const pants = std(0x3d3029);
  const boot = std(0x2b211b);

  for (const s of [-1, 1]) {
    const leg = limb(0.15, 0.6, pants, root, [s * 0.2, 0.95, 0]);
    leg.rotation.z = s * 0.12;
    mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.35, 12), boot, [s * 0.32, 0.17, 0.02], root);
  }
  mesh(new THREE.CapsuleGeometry(0.36, 0.45, 6, 14), shirt, [0, 1.35, 0], root).scale.set(1, 1, 0.8);
  mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 16), std(0x3a2618), [0, 1.0, 0], root);
  const vest = mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 16, 1, true, 0.6, Math.PI * 2 - 1.2), std(0x8a3a1c, { side: THREE.DoubleSide }), [0, 1.42, 0], root);
  vest.scale.z = 0.85;

  const head = new THREE.Group();
  head.position.set(0, 2.05, 0);
  root.add(head);
  mesh(new THREE.SphereGeometry(0.4, 20, 16), skin, [0, 0, 0], head);
  const hair = mesh(new THREE.SphereGeometry(0.43, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), std(0x1b1512), [0, 0.03, -0.04], head);
  hair.rotation.x = -0.55;
  mesh(new THREE.TorusGeometry(0.41, 0.05, 8, 24), std(0x3e7d3b), [0, 0.15, 0], head).rotation.x = Math.PI / 2 + 0.2;
  mesh(new THREE.ConeGeometry(0.1, 0.35, 6), std(0x1b1512), [0, 0.38, -0.1], head).rotation.x = -0.7;
  face(head, 0.4, skin);

  const armL = limb(0.11, 0.5, shirt, root, [-0.48, 1.7, 0]);
  armL.rotation.z = -0.5;
  armL.rotation.x = -0.6;
  const armR = limb(0.11, 0.5, shirt, root, [0.48, 1.7, 0]);
  armR.rotation.z = 0.35;
  armR.rotation.x = -0.9;
  mesh(new THREE.SphereGeometry(0.11, 10, 8), skin, [0, -0.78, 0], armL);
  mesh(new THREE.SphereGeometry(0.11, 10, 8), skin, [0, -0.78, 0], armR);

  const staff = new THREE.Group();
  staff.position.set(0, -0.78, 0.05);
  armR.add(staff);
  const gold = std(0xd9a441, { metalness: 0.8, roughness: 0.3 });
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 8), std(0x7a4a24), [0, 0.3, 0], staff);
  const crescent = mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 24, Math.PI * 1.3), gold, [0, 1.65, 0], staff);
  crescent.rotation.z = -0.4;
  const orb = mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), [0, 1.55, 0], staff);
  orb.userData.glow = true;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf5a, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(0.8);
  orb.add(halo);

  return { root, armR, staffTip: orb, color: 0xffcc55, head };
}

function makeWizard() {
  const root = new THREE.Group();
  const skin = std(0xf2c09a);
  const robe = std(0xb3232a);
  const coat = std(0x1f2358, { side: THREE.DoubleSide });
  const gold = std(0xd9a441, { metalness: 0.7, roughness: 0.35 });
  const black = std(0x15131a);

  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 12), std(0x6a3a1f), [s * 0.35, 0.2, 0.05], root);
  mesh(new THREE.CylinderGeometry(0.6, 0.85, 1.4, 24), robe, [0, 1.0, 0], root);
  const belly = mesh(new THREE.SphereGeometry(0.78, 24, 18), robe, [0, 1.55, 0.05], root);
  belly.scale.set(1, 0.95, 0.9);
  mesh(new THREE.CylinderGeometry(0.66, 0.92, 1.9, 24, 1, true, 0.7, Math.PI * 2 - 1.4), coat, [0, 1.2, 0], root);
  mesh(new THREE.TorusGeometry(0.92, 0.05, 8, 32, Math.PI * 2 - 1.4), gold, [0, 0.27, 0], root).rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.7);
  mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.16, 24), std(0x2a1c14), [0, 1.3, 0], root);
  mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), gold, [0, 1.3, 0.8], root);

  const head = new THREE.Group();
  head.position.set(0, 2.5, 0.05);
  root.add(head);
  mesh(new THREE.SphereGeometry(0.45, 20, 16), skin, [0, 0, 0], head).scale.set(1.1, 1, 1);
  face(head, 0.45, skin);
  for (const s of [-1, 1]) {
    mesh(new THREE.CapsuleGeometry(0.04, 0.25, 4, 8), black, [s * 0.15, -0.18, 0.42], head).rotation.z = s * 1.2;
  }
  mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 24), black, [0, 0.32, 0], head);
  mesh(new THREE.CylinderGeometry(0.33, 0.42, 0.4, 20), black, [0, 0.55, 0], head);
  mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), gold, [0, 0.38, 0], head).rotation.x = Math.PI / 2;
  const tip = mesh(new THREE.ConeGeometry(0.33, 0.9, 20), black, [0.12, 1.1, 0], head);
  tip.rotation.z = -0.45;

  const armL = limb(0.17, 0.5, robe, root, [-0.85, 1.95, 0]);
  armL.rotation.set(-0.7, 0, -0.7);
  const armR = limb(0.17, 0.5, robe, root, [0.85, 1.95, 0]);
  armR.rotation.set(-0.9, 0, 0.5);
  for (const a of [armL, armR]) {
    mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16), gold, [0, -0.72, 0], a).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.14, 10, 8), skin, [0, -0.88, 0], a);
  }

  const staff = new THREE.Group();
  staff.position.set(0, -0.88, 0.05);
  armR.add(staff);
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 8), std(0x4a2a18), [0, 0.3, 0], staff);
  for (let i = 0; i < 3; i++) {
    const claw = mesh(new THREE.ConeGeometry(0.05, 0.35, 6), gold, [0, 1.75, 0], staff);
    claw.rotation.set(0, (i / 3) * Math.PI * 2, 0.5);
    claw.translateY(0.12);
  }
  const orb = mesh(new THREE.SphereGeometry(0.16, 14, 12), new THREE.MeshBasicMaterial({ color: 0xff6040 }), [0, 1.95, 0], staff);
  orb.userData.glow = true;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4020, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.0);
  orb.add(halo);

  return { root, armR, staffTip: orb, color: 0xff5a30, head };
}

// ---------- arena ----------

export function createArena(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd890a0, 40, 140);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

  buildSky(scene);
  buildGround(scene);
  buildMountains(scene);
  buildProps(scene);

  scene.add(new THREE.HemisphereLight(0xffd8d0, 0x6a5030, 1.3));
  const key = new THREE.DirectionalLight(0xffd2a0, 2.6);
  key.position.set(6, 12, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a60, 2.0);
  rim.position.copy(SUN_DIR).multiplyScalar(30).setY(6);
  scene.add(rim);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.copy(SUN_DIR).multiplyScalar(180);
  sun.scale.setScalar(40);
  scene.add(sun);

  const fighters = [makeHero(), makeWizard()].map((f, i) => {
    const facing = i === 0 ? 1 : -1;
    const outer = new THREE.Group();
    outer.position.set(-3.1 * facing, 0, 0);
    f.root.rotation.y = facing * (Math.PI / 2 - 0.55);
    outer.add(f.root);
    scene.add(outer);
    const mats = [];
    f.root.traverse((o) => {
      if (o.isMesh && !o.userData.glow && o.material.emissive && !mats.includes(o.material)) mats.push(o.material);
    });
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: runeTex, color: f.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    scene.add(ring);
    return { ...f, outer, facing, baseX: outer.position.x, mats, ring, lunge: 0, hit: 0, ko: 0, koing: false, cast: 0 };
  });

  const particles = [];
  const bolts = [];
  const flash = new THREE.PointLight(0xffc080, 0, 14, 1.5);
  scene.add(flash);
  let shake = 0;

  function spawn({ pos, vel, color, size, life, tex = glowTex, additive = true, grow = 0, gravity = 0 }) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    scene.add(s);
    particles.push({ s, vel, life, max: life, size, grow, gravity });
  }

  function explode(pos, color) {
    for (let i = 0; i < 60; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 5);
      spawn({ pos, vel: v, color: i % 3 ? color : 0xffffff, size: 0.15 + Math.random() * 0.25, life: 0.5 + Math.random() * 0.5, gravity: -4 });
    }
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2);
      spawn({ pos: pos.clone().add(v.clone().multiplyScalar(0.3)), vel: v, color: 0xe8e0dc, size: 1.2, life: 1.6 + Math.random(), tex: smokeTex, additive: false, grow: 1.8 });
    }
    spawn({ pos, vel: new THREE.Vector3(), color, size: 1, life: 0.35, grow: 14 });
    flash.position.copy(pos);
    flash.color.set(color);
    flash.intensity = 60;
    shake = 0.35;
  }

  const tmp = new THREE.Vector3();

  let generation = 0; // bumped on reset so bolts from a previous match never land

  function attack(from, onImpact, power = 1) {
    const a = fighters[from];
    const d = fighters[1 - from];
    const gen = generation;
    a.lunge = 1;
    a.cast = 1;
    setTimeout(() => {
      if (gen !== generation) return;
      const start = a.staffTip.getWorldPosition(new THREE.Vector3());
      const end = d.outer.position.clone().add(new THREE.Vector3(0, from === 0 ? 1.6 : 1.3, 0.2));
      const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: a.color, blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.scale.setScalar(0.9 * power);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16 * power, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      orb.add(core);
      const light = new THREE.PointLight(a.color, 25, 8, 1.5);
      orb.add(light);
      orb.position.copy(start);
      scene.add(orb);
      bolts.push({ orb, start, end, t: 0, dur: 0.5, color: a.color, onImpact, target: d, power });
    }, 380);
  }

  function hit(idx) { fighters[idx].hit = 1; }
  function ko(idx) { fighters[idx].koing = true; }
  function reset() {
    generation++;
    for (const b of bolts) scene.remove(b.orb);
    bolts.length = 0;
    for (const f of fighters) Object.assign(f, { lunge: 0, hit: 0, ko: 0, koing: false, cast: 0 });
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep both fighters in frame on narrow screens
    const halfW = 5.2;
    const dist = Math.max(10.5, halfW / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    camera.userData.dist = dist;
    camera.updateProjectionMatrix();
  }

  function screenPos(idx, y = 3.2) {
    tmp.copy(fighters[idx].outer.position).setY(y).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  const clock = new THREE.Clock();
  function render() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    for (const [i, f] of fighters.entries()) {
      f.lunge = Math.max(0, f.lunge - dt * 1.6);
      f.hit = Math.max(0, f.hit - dt * 2.2);
      f.cast = Math.max(0, f.cast - dt * 1.2);
      if (f.koing) f.ko = Math.min(1, f.ko + dt * 1.8);
      const lungeCurve = Math.sin(f.lunge * Math.PI);
      f.outer.position.x = f.baseX + f.facing * (lungeCurve * 0.6 - f.hit * 0.5) + Math.sin(t * 70) * f.hit * 0.06;
      f.outer.position.y = f.ko ? 0 : Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 0.05;
      f.outer.rotation.z = f.facing * f.ko * 1.45;
      f.root.scale.y = 1 + Math.sin(t * 2.2 + i) * 0.012;
      f.armR.rotation.x = (i ? -0.9 : -0.9) - lungeCurve * 1.3;
      f.head.rotation.y = Math.sin(t * 0.7 + i) * 0.15;
      for (const m of f.mats) m.emissive.setRGB(f.hit * 0.7, f.hit * 0.1, 0);

      const tip = f.staffTip.getWorldPosition(tmp);
      f.ring.position.copy(tip).add(new THREE.Vector3(f.facing * 0.4, 0, 0));
      f.ring.rotation.set(0, Math.PI / 2, t * 2);
      f.ring.material.opacity = Math.sin(f.cast * Math.PI) * 0.9;
      f.ring.scale.setScalar(0.6 + (1 - f.cast) * 0.8);
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt / b.dur;
      const k = Math.min(b.t, 1);
      b.orb.position.lerpVectors(b.start, b.end, k);
      b.orb.position.y += Math.sin(k * Math.PI) * 0.8;
      b.orb.scale.setScalar((0.9 + Math.sin(t * 40) * 0.15) * b.power);
      spawn({ pos: b.orb.position, vel: new THREE.Vector3().randomDirection().multiplyScalar(0.4), color: b.color, size: 0.45 * b.power, life: 0.35 });
      if (b.t >= 1) {
        scene.remove(b.orb);
        explode(b.end, b.color);
        b.target.hit = 1;
        b.onImpact?.();
        bolts.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.s);
        p.s.material.dispose();
        particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.s.material.opacity = Math.min(1, k * 1.5);
      p.s.scale.setScalar(p.size * (1 + (1 - k) * p.grow));
    }

    flash.intensity *= Math.pow(0.02, dt);
    shake *= Math.pow(0.01, dt);
    const dist = camera.userData.dist ?? 10.5;
    camera.position.set(Math.sin(t * 0.25) * 0.4 + (Math.random() - 0.5) * shake, 2.3 + (Math.random() - 0.5) * shake, dist);
    camera.lookAt(0, 1.7, 0);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  return { attack, hit, ko, reset, render, screenPos, resize };
}
