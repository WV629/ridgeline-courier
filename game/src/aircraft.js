// Aircraft: the bush plane (built from primitives — an original design,
// "Ridgeline Air" cream-and-teal livery) and its arcade flight model.
// The model rewards throttle and turn discipline: stalls, overspeed damage,
// flaps/gear discipline and fuel all matter.
import * as THREE from 'three';
import { FLIGHT } from './config.js';
import { clamp, lerp } from './random.js';

export function buildPlane() {
  const g = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2e8d5 });
  const teal = new THREE.MeshLambertMaterial({ color: 0x1e7a6e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1a2a3a, shininess: 160, specular: 0xaaccff });
  const orange = new THREE.MeshLambertMaterial({ color: 0xe86a1e });

  // Fuselage
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.75, 7.6, 12), cream);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.4;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 1.6, 12), teal);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 4.9;
  g.add(nose);
  // Canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), glass);
  canopy.scale.set(0.92, 0.75, 1.7);
  canopy.position.set(0, 0.85, 1.6);
  g.add(canopy);
  // Tail cone + fin
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.18, 2.6, 10), cream);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -4.4;
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 1.9), teal);
  fin.position.set(0, 1.1, -5.2);
  fin.rotation.x = -0.25;
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 1.3), cream);
  stab.position.set(0, 0.25, -5.2);
  g.add(stab);
  // Main wings with slight dihedral
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 2.1), cream);
    wing.position.set(s * 3.1, 0.35, 0.9);
    wing.rotation.z = s * 0.06;
    g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 2.1), orange);
    tip.position.set(s * 5.9, 0.53, 0.9);
    tip.rotation.z = s * 0.06;
    g.add(tip);
    // Nav light
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2222 : 0x22ff44 }),
    );
    nav.position.set(s * 6.1, 0.55, 0.9);
    g.add(nav);
    // Strut
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), dark);
    strut.position.set(s * 2.6, -0.75, 0.9);
    strut.rotation.z = s * 0.5;
    g.add(strut);
  }
  // Propeller (spins) — blades semi-transparent so they read as a blur
  // from the cockpit instead of a solid bar.
  const prop = new THREE.Group();
  prop.position.z = 5.85;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), dark);
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33, transparent: true, opacity: 0.45 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.6, 0.12), bladeMat);
    blade.rotation.z = a;
    prop.add(blade);
  }
  g.add(prop);
  g.userData.prop = prop;
  // Landing gear (retractable visually)
  const gear = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), dark);
    leg.position.set(s * 1.1, -1.2, 2.2);
    gear.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.1, -1.95, 2.2);
    gear.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -1.0, -4.6);
  gear.add(tailWheel);
  g.add(gear);
  g.userData.gear = gear;
  // Registration text plate on the tail (original callsign)
  g.userData.callsign = 'RL-214';
  return g;
}

// Flight state, created fresh per sortie.
export function newFlightState(start, headingDeg) {
  return {
    pos: new THREE.Vector3(start.x, start.y, start.z),
    heading: (headingDeg * Math.PI) / 180,
    pitch: 0,
    roll: 0,
    speed: 0,
    vs: 0, // vertical speed m/s
    throttle: 0,
    flaps: 0, // 0 up, 1 takeoff, 2 landing
    gearDown: true,
    onGround: true,
    fuel: 100,
    fuelMax: 100,
    damage: 0,
    stalled: false,
    overspeed: false,
    crashed: false,
    crashReason: '',
    landed: false,
    time: 0,
  };
}

// One physics step. input: {pitch, roll, yaw, throttleDelta, ...} in -1..1.
// Returns events: array of strings ('stall','overspeed','touchdown',...).
export function stepFlight(st, input, dt, groundH, opts) {
  const ev = [];
  const heavy = opts.heavy ? 1.35 : 0.85;
  const thrustMul = opts.engine || 1;
  const stallSpeed = st.flaps === 2 ? FLIGHT.stallFlaps : FLIGHT.stallClean;
  const maxSpeed = FLIGHT.maxSpeed;

  // Throttle
  st.throttle = clamp(st.throttle + input.throttle * dt * 0.55, 0, 1);
  // Pitch / roll targets from input, eased
  const targetPitch = clamp(input.pitch * 0.42, -0.42, 0.42);
  const targetRoll = clamp(input.roll * 0.9, -0.9, 0.9);
  const ease = st.onGround ? 2.2 : 1.6;
  st.pitch = lerp(st.pitch, targetPitch, Math.min(1, ease * dt));
  st.roll = lerp(st.roll, targetRoll, Math.min(1, ease * dt));
  // Coordinated turn: bank drives heading
  const turnRate = (9.81 * Math.tan(st.roll)) / Math.max(st.speed, 12) * FLIGHT.turnAuthority;
  st.heading -= turnRate * dt;
  st.heading += input.yaw * 0.25 * dt * clamp(st.speed / 40, 0, 1);

  // Speed dynamics
  const thrust = st.throttle * FLIGHT.maxThrust * thrustMul;
  const drag = FLIGHT.dragK * st.speed * st.speed * (st.flaps === 2 ? 1.5 : st.flaps === 1 ? 1.2 : 1);
  const gravityAlong = 9.81 * Math.sin(st.pitch) * (st.onGround ? 0 : 1);
  const accel = thrust - drag - gravityAlong * 1.0;
  st.speed = Math.max(0, st.speed + accel * dt);
  if (st.onGround) st.speed = Math.min(st.speed, 62); // rolling resistance caps taxi speed

  // Lift / vertical speed
  const liftFactor = clamp((st.speed / stallSpeed) ** 2, 0, 1.6);
  const climbAuthority = FLIGHT.climbRate * liftFactor * (st.flaps === 2 ? 0.85 : 1);
  const targetVS = st.onGround ? 0 : Math.sin(st.pitch) * st.speed * 0.9 + (st.throttle > 0.85 ? climbAuthority * 0.25 : 0);
  st.vs = lerp(st.vs, targetVS, Math.min(1, 2.0 * dt));
  if (st.speed < stallSpeed && !st.onGround) {
    st.stalled = true;
    st.vs -= 14 * dt * (1 - liftFactor); // nose drops
    if (!st._stallWarned) { ev.push('stall'); st._stallWarned = true; }
  } else {
    st.stalled = false; st._stallWarned = false;
  }

  // Integrate position
  const fwd = new THREE.Vector3(-Math.sin(st.heading), 0, -Math.cos(st.heading));
  // forward with pitch
  const fwdP = new THREE.Vector3(fwd.x * Math.cos(st.pitch), Math.sin(st.pitch), fwd.z * Math.cos(st.pitch));
  st.pos.addScaledVector(fwdP, st.speed * dt);
  st.pos.y += st.vs * dt;

  // Overspeed
  if (st.speed > maxSpeed && !st.onGround) {
    st.overspeed = true;
    st.damage += (st.speed - maxSpeed) * 0.06 * dt;
    if (!st._overWarned) { ev.push('overspeed'); st._overWarned = true; }
  } else { st.overspeed = false; st._overWarned = false; }

  // Fuel: full throttle burns ~0.35 units/s; a full tank lasts ~4.5 min
  // at full throttle, much longer at cruise. Tank upgrade raises capacity.
  const fuelMax = 100 * (opts.tank ? 1.35 : 1);
  st.fuelMax = fuelMax;
  const burn = st.throttle * 0.35 * dt * (heavy > 1 ? 1.25 : 1);
  st.fuel = Math.max(0, st.fuel - burn);
  if (st.fuel <= 0 && st.throttle > 0) { st.throttle = 0; ev.push('fuel-empty'); }

  // Ground contact
  const ground = groundH(st.pos.x, st.pos.z);
  const wheelY = st.pos.y - FLIGHT.gearHeight;
  if (wheelY <= ground + 0.05) {
    if (!st.onGround) {
      // Touchdown
      const vs = st.vs;
      const gearMul = opts.reinforcedGear ? 0.6 : 1;
      if (!st.gearDown) {
        st.damage += 45 * gearMul; ev.push('belly');
      } else if (vs < FLIGHT.crashVS) {
        st.damage += 60 * gearMul; ev.push('hard-crash');
      } else if (vs < FLIGHT.hardVS) {
        st.damage += (Math.abs(vs) - 4) * 6 * gearMul; ev.push('hard');
      } else {
        ev.push('touchdown');
      }
      st._lastVS = vs;
      st.onGround = true;
    }
    st.pos.y = ground + FLIGHT.gearHeight;
    st.vs = Math.min(st.vs, 0);
    // Takeoff: rotate at speed
    const rotateSpeed = stallSpeed * (st.flaps === 2 ? 0.95 : 1.05) * heavy;
    if (st.speed > rotateSpeed && st.pitch > 0.06) {
      st.onGround = false;
      ev.push('takeoff');
    }
    // Ground roll friction
    st.speed = Math.max(0, st.speed - (st.throttle < 0.2 ? 6 : 0.5) * dt);
    st.pitch = lerp(st.pitch, 0, Math.min(1, 3 * dt));
    st.roll = lerp(st.roll, 0, Math.min(1, 3 * dt));
  } else if (st.onGround && st.speed > stallSpeed * 0.9 && st.pitch > 0.1) {
    st.onGround = false;
    ev.push('takeoff');
  } else if (st.onGround && wheelY > ground + 2) {
    st.onGround = false; // rolled off a cliff edge etc.
  }

  // Terrain strike while airborne
  if (!st.onGround && st.pos.y < ground + 1.2) {
    st.damage = 100;
    st.crashed = true;
    st.crashReason = 'Terrain strike';
    ev.push('crash');
  }
  // Water ditching
  if (!st.onGround && st.pos.y < 1.5 && ground < -5) {
    st.damage = 100;
    st.crashed = true;
    st.crashReason = 'Ditched in the sea';
    ev.push('crash');
  }
  if (st.damage >= 100 && !st.crashed) {
    st.crashed = true;
    st.crashReason = st.overspeed ? 'Airframe broke up in a dive' : 'Aircraft damaged beyond flying';
    ev.push('crash');
  }
  // World bounds: soft turn-back
  if (Math.abs(st.pos.x) > 3400 || Math.abs(st.pos.z) > 3400) {
    st.heading += Math.PI * dt * 0.4;
    ev.push('bounds');
  }
  st.time += dt;
  return ev;
}

// Apply state to the visible mesh.
export function posePlane(mesh, st, dt) {
  mesh.position.copy(st.pos);
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(st.heading + Math.PI); // model faces +Z; heading 0 = -Z
  mesh.rotateX(-st.pitch);
  mesh.rotateZ(st.roll);
  if (mesh.userData.prop) mesh.userData.prop.rotation.z += (2 + st.throttle * 38) * dt;
  if (mesh.userData.gear) mesh.userData.gear.visible = st.gearDown;
}
