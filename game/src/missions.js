// Missions: objective state machine, ring gates, scoring and debrief.
// A mission is a list of objectives; the runner tracks the current one,
// detects completion, and tallies score, time and fuel bonuses.
import * as THREE from 'three';
import { AIRFIELDS } from './config.js';
import { terrainHeight } from './terrain.js';

export function fieldById(id) {
  return AIRFIELDS.find((f) => f.id === id);
}

// Runway centre + heading vector for a field. The heading is the takeoff
// heading (compass, 0 = north = -Z): the flight direction is (-sin h, -cos h).
export function fieldPose(field) {
  const a = (field.heading * Math.PI) / 180;
  return {
    x: field.x, z: field.z,
    dirX: -Math.sin(a), dirZ: -Math.cos(a),
    headingDeg: field.heading,
  };
}

// Starting position: on the runway threshold, facing down the strip.
export function takeoffStart(field) {
  const p = fieldPose(field);
  const back = field.length / 2 - 90;
  return {
    x: p.x - p.dirX * back,
    y: terrainHeight(p.x - p.dirX * back, p.z - p.dirZ * back) + 2.5,
    z: p.z - p.dirZ * back,
    heading: field.heading,
  };
}

export function buildRings(scene, points, assist) {
  const group = new THREE.Group();
  const rings = [];
  for (const [x, y, z, r] of points) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, Math.max(1.2, r * 0.09), 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.95 }),
    );
    ring.position.set(x, y, z);
    // Face the ring toward the previous point (or the player start for #0).
    group.add(ring);
    // Inner glow disc so the gate reads at distance
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.82, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.position.copy(ring.position);
    group.add(disc);
    rings.push({ mesh: ring, disc, x, y, z, r: r + (assist ? 12 : 0), done: false });
  }
  scene.add(group);
  return { group, rings };
}

// Orient each ring to face the direction of travel (prev -> this -> next).
export function aimRings(rings, from) {
  let prev = from;
  for (const ring of rings) {
    const target = new THREE.Vector3(ring.x, ring.y, ring.z);
    const dir = target.clone().sub(prev).normalize();
    const look = new THREE.Matrix4().lookAt(target, target.clone().add(dir), new THREE.Vector3(0, 1, 0));
    ring.mesh.quaternion.setFromRotationMatrix(look);
    ring.disc.quaternion.copy(ring.mesh.quaternion);
    prev = target;
  }
}

export function buildDropMarkers(scene, points) {
  const group = new THREE.Group();
  const markers = [];
  for (const p of points) {
    // Smoke column: stacked translucent grey sprites rising from the ground.
    const col = new THREE.Group();
    const gh = terrainHeight(p.x, p.z);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(14 + i * 5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 - i * 0.05 }),
      );
      s.position.set((i % 2 ? 4 : -4) * i, gh + 30 + i * 26, 0);
      col.add(s);
    }
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 260, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(0, gh + 130, 0);
    col.add(beacon);
    col.position.set(p.x, 0, p.z);
    group.add(col);
    markers.push({ group: col, x: p.x, z: p.z, done: false });
  }
  scene.add(group);
  return { group, markers };
}

export class MissionRunner {
  constructor(mission, opts) {
    this.mission = mission;
    this.opts = opts || {};
    this.objectives = mission.objectives.map((o) => ({ ...o, done: false, points: o.points ? o.points.map((p) => [...p]) : undefined }));
    this.current = 0;
    this.ringIndex = 0;
    this.rings = null;
    this.dropMarkers = null;
    this.score = 0;
    this.ringsHit = 0;
    this.dropsHit = 0;
    this.startTime = 0;
    this.elapsed = 0;
    this.finished = false;
    this.failed = false;
    this.pickupTimer = 0;
    this.events = [];
  }
  currentObjective() { return this.objectives[this.current]; }
  isDone() { return this.finished; }

  // Called every frame while flying. Returns event strings.
  update(st, dt, scene, helpers) {
    const ev = [];
    this.elapsed += dt;
    const obj = this.currentObjective();
    if (!obj || this.finished) return ev;
    if (obj.type === 'rings') {
      const ring = this.rings.rings[this.ringIndex];
      if (ring && !ring.done) {
        const d = Math.hypot(st.pos.x - ring.x, st.pos.y - ring.y, st.pos.z - ring.z);
        if (d < ring.r) {
          ring.done = true;
          ring.mesh.material.color.setHex(0x37d67a);
          ring.disc.material.color.setHex(0x37d67a);
          this.ringsHit++;
          this.score += 100;
          ev.push('ring');
          this.ringIndex++;
          if (this.ringIndex >= this.rings.rings.length) {
            obj.done = true;
            this.current++;
            this.ringIndex = 0;
            ev.push('objective');
            if (this.current >= this.objectives.length) this.finish(ev);
          }
        }
      }
    } else if (obj.type === 'land') {
      const f = fieldById(obj.field);
      const onStrip = st.onGround && Math.abs(st.pos.x - f.x) < f.length / 2 + 40 && Math.abs(st.pos.z - f.z) < f.width / 2 + 160;
      // Land check uses distance to the strip centre in the strip's frame.
      const p = fieldPose(f);
      const dx = st.pos.x - f.x, dz = st.pos.z - f.z;
      const along = Math.abs(dx * p.dirX + dz * p.dirZ);
      const across = Math.abs(dx * p.dirZ - dz * p.dirX);
      if (st.onGround && st.speed < 8 && along < f.length / 2 + 30 && across < f.width / 2 + 30) {
        obj.done = true;
        this.score += 250;
        this.current++;
        ev.push('landed');
        if (this.current >= this.objectives.length) this.finish(ev);
        else ev.push('objective');
      }
      void onStrip;
    } else if (obj.type === 'pickup') {
      const d = Math.hypot(st.pos.x - obj.x, st.pos.z - obj.z);
      if (st.onGround && st.speed < 5 && d < 120) {
        this.pickupTimer += dt;
        if (this.pickupTimer > 3) {
          obj.done = true;
          this.score += 200;
          this.current++;
          ev.push('pickup');
          if (this.current >= this.objectives.length) this.finish(ev);
          else ev.push('objective');
        }
      } else {
        this.pickupTimer = 0;
      }
    } else if (obj.type === 'drop') {
      // Drop is triggered by the player pressing SPACE (main.js calls tryDrop).
      void dt; void scene; void helpers;
    } else if (obj.type === 'flyby') {
      const d = Math.hypot(st.pos.x - obj.x, st.pos.y - obj.y, st.pos.z - obj.z);
      if (d < 130) {
        obj.done = true;
        this.score += 150;
        this.current++;
        ev.push('flyby');
        if (this.current >= this.objectives.length) this.finish(ev);
        else ev.push('objective');
      }
    }
    return ev;
  }

  tryDrop(st) {
    const obj = this.currentObjective();
    if (!obj || obj.type !== 'drop' || this.finished) return null;
    const d = Math.hypot(st.pos.x - obj.x, st.pos.z - obj.z);
    const alt = st.pos.y - terrainHeight(st.pos.x, st.pos.z);
    if (d < 90 && alt < obj.alt) {
      obj.done = true;
      this.dropsHit++;
      this.score += 200;
      this.current++;
      const done = this.current >= this.objectives.length;
      if (done) this.finish([]);
      return { hit: true, done };
    }
    return { hit: false, done: false };
  }

  finish(ev) {
    this.finished = true;
    const par = this.mission.par || 300;
    const timeBonus = Math.max(0, Math.round((par - this.elapsed) * 2));
    const fuelBonus = 0; // fuel bonus added by main.js (needs flight state)
    this.score += timeBonus;
    ev.push('finished');
    void fuelBonus;
  }

  // Human-readable current objective line for the HUD.
  objectiveText() {
    const obj = this.currentObjective();
    if (!obj) return this.finished ? 'Mission complete!' : '—';
    if (obj.type === 'rings') return `Fly through ring ${this.ringIndex + 1} of ${this.rings ? this.rings.rings.length : obj.points.length}`;
    if (obj.type === 'land') return `Land at ${fieldById(obj.field).name}`;
    if (obj.type === 'pickup') return `Land at ${obj.label} — wait for boarding (${Math.max(0, 3 - this.pickupTimer).toFixed(0)}s)`;
    if (obj.type === 'drop') return `Drop water on ${obj.label} — press SPACE below ${obj.alt} m`;
    if (obj.type === 'flyby') return `Fly by: ${obj.label}`;
    return '';
  }
}
