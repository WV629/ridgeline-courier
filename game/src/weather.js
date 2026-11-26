// Weather and sky: gradient sky dome, sun, drifting clouds, rain and wind.
// Time of day comes from the mission (dawn / day / dusk / night / storm).
import * as THREE from 'three';
import { TIMES_OF_DAY } from './config.js';
import { mulberry32, clamp } from './random.js';

export function buildSky(timeKey) {
  const t = TIMES_OF_DAY[timeKey] || TIMES_OF_DAY.day;
  const group = new THREE.Group();
  // Gradient dome
  const geo = new THREE.SphereGeometry(9000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(t.skyTop) },
      bottom: { value: new THREE.Color(t.skyBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, pow(max(h,0.0), 0.75)), 1.0); }',
  });
  const dome = new THREE.Mesh(geo, mat);
  group.add(dome);
  // Sun disc
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(260, 24),
    new THREE.MeshBasicMaterial({ color: t.sunColor, fog: false }),
  );
  const sd = new THREE.Vector3(...t.sun).normalize().multiplyScalar(8200);
  sun.position.copy(sd);
  sun.lookAt(0, 0, 0);
  group.add(sun);
  // Stars at night
  const stars = new THREE.Group();
  if (timeKey === 'night') {
    const rng = mulberry32(55);
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 600; i++) {
      const a = rng() * Math.PI * 2, e = rng() * Math.PI * 0.45 + 0.08;
      pts.push(Math.cos(a) * Math.cos(e) * 8500, Math.sin(e) * 8500, Math.sin(a) * Math.cos(e) * 8500);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    stars.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 18, sizeAttenuation: false, fog: false })));
  }
  group.add(stars);
  return { group, sun, config: t };
}

export function buildClouds(timeKey) {
  // Soft billboard puffs from a runtime canvas texture (no external files).
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const group = new THREE.Group();
  const rng = mulberry32(777);
  const dark = timeKey === 'night' || timeKey === 'storm';
  const mat = new THREE.SpriteMaterial({ map: tex, color: dark ? 0x5a6068 : 0xffffff, transparent: true, opacity: dark ? 0.75 : 0.85, depthWrite: false });
  const clouds = [];
  const count = timeKey === 'storm' ? 70 : 42;
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat);
    const sc = 220 + rng() * 420;
    s.scale.set(sc, sc * 0.42, 1);
    s.position.set((rng() - 0.5) * 6500, 420 + rng() * (timeKey === 'storm' ? 260 : 420), (rng() - 0.5) * 6500);
    s.userData.drift = 2 + rng() * 4;
    group.add(s);
    clouds.push(s);
  }
  return { group, clouds };
}

export function buildRain() {
  const N = 900;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const rng = mulberry32(4242);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() - 0.5) * 500;
    pos[i * 3 + 1] = rng() * 260;
    pos[i * 3 + 2] = (rng() - 0.5) * 500;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaac4d8, size: 1.6, transparent: true, opacity: 0.55 }));
  rain.visible = false;
  rain.userData.count = N;
  return rain;
}

// Wind field: base wind from mission + gusts that vary with position/time.
export function windAt(x, z, t, baseSpeed, baseDirDeg) {
  const a = (baseDirDeg * Math.PI) / 180;
  const gust = Math.sin(x * 0.004 + t * 0.7) * Math.cos(z * 0.003 - t * 0.5) * baseSpeed * 0.35;
  const s = baseSpeed + gust;
  return { x: Math.sin(a) * s, z: Math.cos(a) * s, speed: s };
}

export function applyLights(parent, timeKey) {
  const t = TIMES_OF_DAY[timeKey] || TIMES_OF_DAY.day;
  const sun = new THREE.DirectionalLight(t.sunColor, t.sunIntensity);
  sun.position.set(t.sun[0] * 1000, t.sun[1] * 1000 + 200, t.sun[2] * 1000);
  parent.add(sun);
  const hemi = new THREE.HemisphereLight(t.skyTop, 0x3a4a3a, t.hemi);
  parent.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, t.ambient * 0.5);
  parent.add(amb);
  parent.fog = null;
  return { sun, hemi, amb };
}
export function clamp01(v) { return clamp(v, 0, 1); }
