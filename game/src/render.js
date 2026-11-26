// Rendering: Three.js scene, chase / cockpit / tower cameras, ring glow
// pulse, runway-light blinking, cloud drift and rain follow.
import * as THREE from 'three';
import { buildTerrain, buildAirfields, buildVegetation } from './terrain.js';
import { buildSky, buildClouds, buildRain, applyLights } from './weather.js';
import { clamp, lerp } from './random.js';

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 12000);
    this.cameraMode = 'chase'; // chase | cockpit | tower
    this.camAngle = 0; // mouse-drag orbit offset
    this.camPitch = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildWorld(timeKey) {
    this.timeKey = timeKey;
    this.lightGroup = new THREE.Group();
    this.scene.add(this.lightGroup);
    const { sun } = applyLights(this.lightGroup, timeKey);
    this.sun = sun;
    const sky = buildSky(timeKey);
    this.skyGroup = sky.group;
    this.scene.add(this.skyGroup);
    const t = sky.config;
    this.scene.fog = new THREE.Fog(t.fog, 900, 6500);
    this.scene.background = new THREE.Color(t.skyBottom);
    this.scene.add(buildTerrain());
    this.scene.add(buildAirfields());
    this.scene.add(buildVegetation());
    const clouds = buildClouds(timeKey);
    this.cloudGroup = clouds.group;
    this.scene.add(this.cloudGroup);
    this.clouds = clouds.clouds;
    this.rain = buildRain();
    this.scene.add(this.rain);
    this.rain.visible = timeKey === 'storm';
  }

  // Swap sky, lights, fog and clouds for a new time of day without
  // rebuilding the terrain. Used when a mission starts.
  setTimeOfDay(timeKey) {
    if (timeKey === this.timeKey) return;
    this.timeKey = timeKey;
    if (this.skyGroup) this.scene.remove(this.skyGroup);
    if (this.cloudGroup) this.scene.remove(this.cloudGroup);
    if (this.lightGroup) this.scene.remove(this.lightGroup);
    this.lightGroup = new THREE.Group();
    this.scene.add(this.lightGroup);
    applyLights(this.lightGroup, timeKey);
    const sky = buildSky(timeKey);
    this.skyGroup = sky.group;
    this.scene.add(this.skyGroup);
    const t = sky.config;
    this.scene.fog = new THREE.Fog(t.fog, 900, 6500);
    this.scene.background = new THREE.Color(t.skyBottom);
    const clouds = buildClouds(timeKey);
    this.cloudGroup = clouds.group;
    this.scene.add(this.cloudGroup);
    this.clouds = clouds.clouds;
    if (this.rain) this.rain.visible = timeKey === 'storm';
  }

  updateCamera(st, plane, dt, input) {
    this.camAngle = lerp(this.camAngle, 0, Math.min(1, 1.5 * dt));
    this.camAngle += (input ? input.dragX : 0) * 0.003;
    this.camPitch = clamp(this.camPitch + (input ? -input.dragY : 0) * 0.002, -0.3, 0.35);
    const cam = this.camera;
    if (this.cameraMode === 'cockpit') {
      // Above the canopy, looking forward over the nose: the nose is a thin
      // strip at the bottom of the frame and the world stays open.
      const fwd = new THREE.Vector3(-Math.sin(st.heading), 0, -Math.cos(st.heading));
      const eye = st.pos.clone().addScaledVector(fwd, 0.5);
      eye.y += 2.6;
      cam.position.copy(eye);
      const look = st.pos.clone().addScaledVector(fwd, 60);
      look.y += Math.sin(st.pitch) * 40;
      cam.lookAt(look);
      cam.fov = 74;
      cam.updateProjectionMatrix();
    } else if (this.cameraMode === 'tower') {
      cam.position.set(st.pos.x + 220, st.pos.y + 90, st.pos.z + 220);
      cam.lookAt(st.pos);
      cam.fov = 55;
      cam.updateProjectionMatrix();
    } else {
      // Chase: behind and above, eased, with a hint of bank.
      const back = 26, up = 8.5;
      const a = st.heading + this.camAngle;
      const target = new THREE.Vector3(
        st.pos.x + Math.sin(a) * back,
        st.pos.y + up + this.camPitch * 20,
        st.pos.z + Math.cos(a) * back,
      );
      cam.position.lerp(target, Math.min(1, 5 * dt));
      const look = st.pos.clone();
      look.y += 1.5;
      look.x -= Math.sin(a) * 20;
      look.z -= Math.cos(a) * 20;
      cam.lookAt(look);
      cam.fov = 62;
      cam.updateProjectionMatrix();
      // Subtle roll with the plane
      cam.rotation.z += st.roll * 0.12;
    }
  }

  updateAmbient(dt, t, plane, rings) {
    // Clouds drift with the wind.
    if (this.clouds) {
      for (const c of this.clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 3400) c.position.x = -3400;
      }
    }
    // Rain follows the plane.
    if (this.rain && this.rain.visible && plane) {
      this.rain.position.set(plane.position.x, plane.position.y - 60, plane.position.z);
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 190 * dt;
        if (y < 0) y = 260;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    // Pulse the next ring.
    if (rings && rings.rings) {
      const next = rings.rings.find((r) => !r.done);
      if (next) {
        const s = 1 + Math.sin(t * 5) * 0.06;
        next.mesh.scale.setScalar(s);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
