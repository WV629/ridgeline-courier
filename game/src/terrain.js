// Terrain: an archipelago of three islands with a mountain ridge, beaches,
// runways flattened into the ground, plus instanced trees and towns.
// The height function is pure and shared by the mesh, the flight model
// (ground collision) and the minimap.
import * as THREE from 'three';
import { WORLD, AIRFIELDS } from './config.js';
import { fbm, clamp, mulberry32 } from './random.js';

const ISLANDS = [
  { x: 0, z: 300, r: 2100, h: 640 }, // main island, tall ridge
  { x: -1800, z: -1500, r: 1300, h: 420 }, // north island
  { x: 2050, z: -650, r: 1100, h: 380 }, // east island
  { x: -700, z: 2200, r: 700, h: 180 }, // coral islet
  { x: 2400, z: 1800, r: 800, h: 240 }, // south-east islet
];

// A ridge line across the main island so the mountain pass feels like a pass.
function ridgeBump(x, z) {
  const dx = x + 500, dz = z + 600;
  const d = Math.abs(dz * 0.35 - dx * 0.94); // distance to ridge line
  const along = dx * 0.94 + dz * 0.35;
  if (along < -1400 || along > 1400) return 0;
  return Math.max(0, 1 - d / 420) * 260 * (0.7 + 0.3 * fbm(x * 0.004, z * 0.004, 31, 2));
}

export function terrainHeight(x, z) {
  let h = -40; // seabed
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
    if (d < 1) {
      const fall = Math.pow(1 - d * d, 1.6);
      h += (isl.h + 60) * fall;
    }
  }
  h += fbm(x * 0.0016, z * 0.0016, WORLD.seed, 4) * 90 * Math.max(0, Math.min(1, (h + 40) / 200));
  h += ridgeBump(x, z);
  // Flatten the ground under each runway so strips sit level: fully flat
  // inside the strip rectangle, blending to the natural terrain over 80 m.
  for (const f of AIRFIELDS) {
    const dx = x - f.x, dz = z - f.z;
    const a = (f.heading * Math.PI) / 180;
    const along = dx * Math.sin(a) + dz * Math.cos(a);
    const across = dx * Math.cos(a) - dz * Math.sin(a);
    const excess = Math.max(Math.abs(along) - f.length / 2, Math.abs(across) - f.width / 2);
    if (excess < 80) {
      const t = clamp(1 - Math.max(0, excess) / 80, 0, 1);
      const s = t * t * (3 - 2 * t);
      const flat = 14;
      h = h * (1 - s) + flat * s;
    }
  }
  return h;
}

function colorFor(h, slope) {
  const c = new THREE.Color();
  if (h < 2) c.setHex(0xd9c489); // sand
  else if (h < 60) c.setHex(0x5d8a4a); // low grass
  else if (h < 220) c.setHex(0x4a7a3e); // high grass
  else if (h < 420) c.setHex(0x6a7a52); // scrub
  else if (h < 560) c.setHex(0x7a7a72); // rock
  else c.setHex(0xe8e8ea); // snow
  // slope darkens into rock
  if (slope > 0.55 && h > 60) c.lerp(new THREE.Color(0x6e6a62), 0.6);
  // subtle variation
  const v = 0.94 + ((h * 13.7) % 1) * 0.12;
  c.multiplyScalar(v);
  return c;
}

export function buildTerrain() {
  const group = new THREE.Group();
  const size = WORLD.size, seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const hx = terrainHeight(x + 30, z) - terrainHeight(x - 30, z);
    const hz = terrainHeight(x, z + 30) - terrainHeight(x, z - 30);
    const slope = Math.sqrt(hx * hx + hz * hz) / 60;
    const c = colorFor(h, slope);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  group.add(mesh);

  // Sea plane
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.2, size * 2.2),
    new THREE.MeshPhongMaterial({ color: 0x1e6f9e, shininess: 120, specular: 0x88bbdd, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  sea.name = 'sea';
  group.add(sea);
  return group;
}

export function buildAirfields() {
  const group = new THREE.Group();
  const rng = mulberry32(99);
  for (const f of AIRFIELDS) {
    const a = (f.heading * Math.PI) / 180;
    const g = new THREE.Group();
    g.position.set(f.x, 14.0, f.z);
    g.rotation.y = a;
    // Runway strip
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(f.width, f.length),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.15;
    g.add(strip);
    // Centre line dashes
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    for (let d = -f.length / 2 + 40; d < f.length / 2 - 20; d += 60) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 26), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.3, d);
      g.add(dash);
    }
    // Threshold bars
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(f.width * 0.8, 6), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, 0.3, s * (f.length / 2 - 18));
      g.add(bar);
    }
    // Edge lights (emissive posts)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    for (let d = -f.length / 2 + 20; d <= f.length / 2 - 20; d += 80) {
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 6), lightMat);
        l.position.set(s * (f.width / 2 + 4), 1, d);
        l.userData.runwayLight = true;
        g.add(l);
      }
    }
    // Windsock
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(f.width / 2 + 14, 6, f.length / 2 - 30);
    g.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 8), new THREE.MeshLambertMaterial({ color: 0xff7a2a }));
    sock.rotation.z = Math.PI / 2.3;
    sock.position.set(f.width / 2 + 18, 11, f.length / 2 - 30);
    g.add(sock);
    // Hangar + small tower
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 24), new THREE.MeshLambertMaterial({ color: 0x8a94a0 }));
    hangar.position.set(f.width / 2 + 34, 6, 40);
    g.add(hangar);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 34, 10, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x5a6a7a }));
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
    roof.position.set(f.width / 2 + 34, 12, 40);
    g.add(roof);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 22, 8), new THREE.MeshLambertMaterial({ color: 0xd8d8d0 }));
    tower.position.set(-(f.width / 2 + 22), 11, -30);
    g.add(tower);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11), new THREE.MeshLambertMaterial({ color: 0x2a4a6a }));
    cab.position.set(-(f.width / 2 + 22), 24, -30);
    g.add(cab);
    group.add(g);
    void rng;
  }
  return group;
}

export function buildVegetation() {
  const group = new THREE.Group();
  const rng = mulberry32(1234);
  const treeGeo = new THREE.ConeGeometry(7, 22, 7);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2e5d33 });
  const trunkGeo = new THREE.CylinderGeometry(1.2, 1.6, 7, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const N = 1400;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, N);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let placed = 0, tries = 0;
  while (placed < N && tries < N * 30) {
    tries++;
    const x = (rng() - 0.5) * WORLD.size * 0.96;
    const z = (rng() - 0.5) * WORLD.size * 0.96;
    const h = terrainHeight(x, z);
    if (h < 8 || h > 300) continue;
    let nearStrip = false;
    for (const f of AIRFIELDS) {
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx) < f.length / 2 + 120 && Math.abs(dz) < f.width / 2 + 120) { nearStrip = true; break; }
    }
    if (nearStrip) continue;
    const sc = 0.7 + rng() * 0.9;
    m.compose(new THREE.Vector3(x, h + 12 * sc, z), q, new THREE.Vector3(sc, sc, sc));
    trees.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + 3.5 * sc, z), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(placed, m);
    placed++;
  }
  trees.count = placed; trunks.count = placed;
  group.add(trees); group.add(trunks);

  // Towns: instanced houses near each airfield.
  const houseGeo = new THREE.BoxGeometry(12, 8, 10);
  const houseMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  const roofGeo = new THREE.ConeGeometry(9, 5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xa03a2a });
  const houses = [], roofs = [];
  for (const f of AIRFIELDS) {
    for (let i = 0; i < 26; i++) {
      const ang = rng() * Math.PI * 2, dist = 180 + rng() * 260;
      const x = f.x + Math.cos(ang) * dist, z = f.z + Math.sin(ang) * dist;
      const h = terrainHeight(x, z);
      if (h < 4) continue;
      houses.push({ x, z, h, rot: rng() * Math.PI });
      roofs.push({ x, z, h, rot: rng() * Math.PI });
    }
  }
  const hm = new THREE.InstancedMesh(houseGeo, houseMat, houses.length);
  const rm = new THREE.InstancedMesh(roofGeo, roofMat, roofs.length);
  houses.forEach((hh, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hh.rot);
    m.compose(new THREE.Vector3(hh.x, hh.h + 4, hh.z), q, s.set(1, 1, 1));
    hm.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(hh.x, hh.h + 10.5, hh.z), q, s.set(1, 1, 1));
    rm.setMatrixAt(i, m);
  });
  group.add(hm); group.add(rm);
  return group;
}

// Nearest airfield centre distance (for HUD "nearest strip" readout).
export function nearestField(x, z) {
  let best = null, bd = Infinity;
  for (const f of AIRFIELDS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < bd) { bd = d; best = f; }
  }
  return { field: best, dist: bd };
}
