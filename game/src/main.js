// Ridgeline Courier — main game: state machine (title / briefing / flying /
// paused / debrief), mission flow, endless rings, upgrades shop, feats and
// the frame loop. The game runs from game/ with no network requests.
import * as THREE from 'three';
import { MISSIONS, UPGRADES, FEATS, AIRFIELDS, FLIGHT } from './config.js';
import { buildPlane, newFlightState, stepFlight, posePlane } from './aircraft.js';
import { terrainHeight } from './terrain.js';
import { Renderer } from './render.js';
import { MissionRunner, fieldById, takeoffStart, buildRings, aimRings, buildDropMarkers } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadProfile, saveProfile, hasUpgrade, engineMultiplier, awardFeat } from './save.js';
import { windAt } from './weather.js';
import { parseShot, applyShot } from './shots.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.profile = loadProfile();
    this.canvas = $('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.input = new Input();
    this.plane = buildPlane();
    this.scene = this.renderer.scene;
    this.state = 'title'; // title | briefing | flying | paused | debrief
    this.mission = null;
    this.runner = null;
    this.flight = null;
    this.mode = 'mission'; // mission | endless | free
    this.endless = null;
    this.timeKey = 'day';
    this.windSpeed = 5;
    this.windDir = 40;
    this.shotMode = null;
    this.cameraSnap = false;
    this.lastTime = performance.now();
    this._boundLoop = (t) => this.loop(t);
    this.buildTitle();
    this.wireButtons();
  }

  // ---------- world / time of day ----------
  setTimeOfDay(key) {
    this.timeKey = key;
    this.renderer.setTimeOfDay(key);
  }

  startWorld(timeKey) {
    if (!this.worldBuilt) {
      this.renderer.buildWorld(timeKey);
      this.scene.add(this.plane);
      this.worldBuilt = true;
    } else {
      this.setTimeOfDay(timeKey);
    }
  }

  // ---------- screens ----------
  showScreen(name) {
    for (const s of ['title', 'briefing', 'debrief', 'paused']) {
      const el = $(`screen-${s}`);
      if (el) el.style.display = s === name ? 'flex' : 'none';
    }
    $('hud').style.display = name === 'flying' ? 'block' : 'none';
    this.state = name === 'flying' ? 'flying' : name;
  }

  buildTitle() {
    const list = $('mission-list');
    list.innerHTML = '';
    for (const m of MISSIONS) {
      const best = this.profile.completed[m.id];
      const btn = document.createElement('button');
      btn.className = 'mission-btn';
      btn.innerHTML = `<span class="m-no">${String(m.no).padStart(2, '0')}</span>
        <span class="m-name">${m.name}</span>
        <span class="m-meta">${m.time} · ${m.reward} cr${best ? ` · best ${best.score}` : ''}${best ? ' ✓' : ''}</span>`;
      btn.addEventListener('click', () => this.openBriefing(m));
      list.appendChild(btn);
    }
    $('credits').textContent = this.profile.credits;
    const ct = $('credits-title');
    if (ct) ct.textContent = this.profile.credits;
    $('feats-count').textContent = `${this.profile.feats.length}/${FEATS.length}`;
    $('endless-best').textContent = this.profile.endlessBest;
    // Upgrades shop
    const shop = $('shop-list');
    shop.innerHTML = '';
    for (const u of UPGRADES) {
      const owned = hasUpgrade(this.profile, u.id);
      const locked = u.needs && !hasUpgrade(this.profile, u.needs);
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `<span class="s-name">${u.name}</span><span class="s-desc">${u.desc}</span>
        <button class="buy-btn" ${owned || locked || this.profile.credits < u.cost ? 'disabled' : ''}>${owned ? 'OWNED' : locked ? 'NEEDS ' + u.needs : u.cost + ' cr'}</button>`;
      row.querySelector('.buy-btn').addEventListener('click', () => {
        if (this.profile.credits >= u.cost && !owned) {
          this.profile.credits -= u.cost;
          this.profile.upgrades.push(u.id);
          saveProfile(this.profile);
          this.audio.chime();
          this.buildTitle();
        }
      });
      shop.appendChild(row);
    }
    // Feats
    const feats = $('feats-list');
    feats.innerHTML = FEATS.map((f) => `<div class="feat ${this.profile.feats.includes(f.id) ? 'got' : ''}">${this.profile.feats.includes(f.id) ? '★' : '☆'} ${f.name} — ${f.desc}</div>`).join('');
  }

  wireButtons() {
    $('btn-free').addEventListener('click', () => this.startFreeFlight());
    $('btn-endless').addEventListener('click', () => this.startEndless());
    $('btn-fly').addEventListener('click', () => this.startMission(this.briefingMission));
    $('btn-back').addEventListener('click', () => { this.buildTitle(); this.showScreen('title'); });
    $('btn-resume').addEventListener('click', () => this.showScreen('flying'));
    $('btn-quit').addEventListener('click', () => { this.buildTitle(); this.showScreen('title'); });
    $('btn-replay').addEventListener('click', () => this.startMission(this.mission));
    $('btn-next').addEventListener('click', () => {
      const idx = MISSIONS.findIndex((m) => m.id === this.mission.id);
      const next = MISSIONS[Math.min(idx + 1, MISSIONS.length - 1)];
      this.openBriefing(next);
    });
    $('btn-menu').addEventListener('click', () => { this.buildTitle(); this.showScreen('title'); });
    $('btn-mute').addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      $('btn-mute').textContent = muted ? '🔇 Muted' : '🔊 Sound';
    });
    $('btn-how').addEventListener('click', () => $('howto').classList.toggle('open'));
  }

  openBriefing(mission) {
    this.briefingMission = mission;
    $('brief-name').textContent = `${mission.no}. ${mission.name}`;
    $('brief-text').textContent = mission.brief;
    $('brief-meta').textContent = `Time: ${mission.time} · Wind: ${mission.wind} m/s · Par: ${Math.floor(mission.par / 60)}:${String(mission.par % 60).padStart(2, '0')} · Reward: ${mission.reward} credits`;
    $('brief-objectives').innerHTML = mission.objectives.map((o) => {
      if (o.type === 'rings') return `<li>Fly ${o.points.length} rings in order</li>`;
      if (o.type === 'land') return `<li>Land at ${fieldById(o.field).name}</li>`;
      if (o.type === 'pickup') return `<li>Pick up at ${o.label}</li>`;
      if (o.type === 'drop') return `<li>Drop water on ${o.label} (SPACE, below ${o.alt} m)</li>`;
      if (o.type === 'flyby') return `<li>Fly by ${o.label}</li>`;
      return '';
    }).join('');
    this.showScreen('briefing');
  }

  // ---------- mission lifecycle ----------
  clearMissionObjects() {
    if (this.runner && this.runner.rings) this.scene.remove(this.runner.rings.group);
    if (this.runner && this.runner.dropMarkers) this.scene.remove(this.runner.dropMarkers.group);
    if (this.endless && this.endless.ringGroup) this.scene.remove(this.endless.ringGroup);
    if (this.endless && this.endless.markerGroup) this.scene.remove(this.endless.markerGroup);
  }

  startMission(mission, opts = {}) {
    this.clearMissionObjects();
    this.mission = mission;
    this.mode = 'mission';
    this.startWorld(mission.time);
    this.windSpeed = mission.wind;
    this.windDir = 40 + mission.no * 17;
    const startField = fieldById(mission.startField || 'ridgefield');
    const s = takeoffStart(startField);
    this.flight = newFlightState(s, startField.heading);
    if (mission.fuel) this.flight.fuel = this.flight.fuelMax * mission.fuel;
    this.runner = new MissionRunner(mission, {});
    // Build rings + drop markers for every objective.
    for (const obj of this.runner.objectives) {
      if (obj.type === 'rings') {
        this.runner.rings = buildRings(this.scene, obj.points, hasUpgrade(this.profile, 'avionics'));
        aimRings(this.runner.rings.rings, new THREE.Vector3(s.x, s.y + 120, s.z));
      }
      if (obj.type === 'drop') {
        const drops = this.runner.objectives.filter((o) => o.type === 'drop');
        this.runner.dropMarkers = buildDropMarkers(this.scene, drops);
        break;
      }
    }
    this.plane.visible = true;
    this.poseCameraSnap();
    this.showScreen('flying');
    if (!opts.silent) {
      this.hud.showMessage(`${mission.no}. ${mission.name} — ${this.runner.objectiveText()}`, 5);
      this.audio.resume();
      this.audio.chime([392, 523, 659]);
    }
    this.profile.flights++;
    saveProfile(this.profile);
  }

  startFreeFlight() {
    this.clearMissionObjects();
    this.mission = null;
    this.mode = 'free';
    this.startWorld('day');
    this.windSpeed = 4;
    const s = takeoffStart(fieldById('ridgefield'));
    this.flight = newFlightState(s, 90);
    this.runner = null;
    this.plane.visible = true;
    this.poseCameraSnap();
    this.showScreen('flying');
    this.hud.showMessage('Free flight — explore the archipelago. Land anywhere, refuel on any strip.', 5);
    this.audio.resume();
  }

  startEndless() {
    this.clearMissionObjects();
    this.mission = null;
    this.mode = 'endless';
    this.startWorld('day');
    this.windSpeed = 5;
    const s = takeoffStart(fieldById('ridgefield'));
    this.flight = newFlightState(s, 90);
    this.runner = null;
    this.endless = { ringsHit: 0, score: 0, ringGroup: null, current: null, nextAt: 0 };
    this.spawnEndlessRing();
    this.plane.visible = true;
    this.poseCameraSnap();
    this.showScreen('flying');
    this.hud.showMessage('Endless Rings — thread every gate. One miss ends nothing, but the clock never stops.', 5);
    this.audio.resume();
  }

  spawnEndlessRing() {
    if (this.endless.ringGroup) this.scene.remove(this.endless.ringGroup);
    const st = this.flight;
    const ahead = 500 + Math.random() * 300;
    const a = st.heading + (Math.random() - 0.5) * 0.7;
    const x = st.pos.x - Math.sin(a) * ahead;
    const z = st.pos.z - Math.cos(a) * ahead;
    const y = Math.max(terrainHeight(x, z) + 120, Math.min(520, st.pos.y + (Math.random() - 0.5) * 160));
    const built = buildRings(this.scene, [[x, y, z, 26]], false);
    aimRings(built.rings, st.pos);
    this.endless.ringGroup = built.group;
    this.endless.current = built.rings[0];
  }

  poseCameraSnap() {
    const st = this.flight;
    const a = st.heading;
    this.renderer.camera.position.set(
      st.pos.x + Math.sin(a) * 26,
      st.pos.y + 8.5,
      st.pos.z + Math.cos(a) * 26,
    );
  }

  // ---------- per-frame ----------
  loop(now) {
    requestAnimationFrame(this._boundLoop);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.state === 'flying' && this.flight) this.update(dt);
    this.renderer.render();
    this.input.endFrame();
  }

  update(dt) {
    const st = this.flight;
    const inp = this.input.flight();
    // Edge-triggered actions
    if (this.input.wasPressed('KeyF')) { st.flaps = (st.flaps + 1) % 3; this.audio.blip(660, 0.08); }
    if (this.input.wasPressed('KeyG')) { st.gearDown = !st.gearDown; this.audio.blip(520, 0.08); }
    if (this.input.wasPressed('KeyC')) {
      this.renderer.cameraMode = this.renderer.cameraMode === 'chase' ? 'cockpit' : this.renderer.cameraMode === 'cockpit' ? 'tower' : 'chase';
      this.hud.showMessage(`Camera: ${this.renderer.cameraMode}`, 1.5);
    }
    if (this.input.wasPressed('KeyM')) { const m = this.audio.toggleMute(); $('btn-mute').textContent = m ? '🔇 Muted' : '🔊 Sound'; }
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) { this.showScreen('paused'); return; }
    if (this.input.wasPressed('KeyR')) {
      if (this.mode === 'mission') this.startMission(this.mission);
      else if (this.mode === 'endless') this.startEndless();
      else this.startFreeFlight();
      return;
    }
    if (this.input.wasPressed('Space')) this.tryDrop();

    // Refuel on the ground at any strip.
    if (st.onGround && st.speed < 3) {
      const near = AIRFIELDS.some((f) => Math.hypot(st.pos.x - f.x, st.pos.z - f.z) < f.length);
      if (near && st.fuel < st.fuelMax) {
        st.fuel = Math.min(st.fuelMax, st.fuel + 12 * dt);
      }
    }

    const opts = {
      engine: engineMultiplier(this.profile),
      tank: hasUpgrade(this.profile, 'tank'),
      reinforcedGear: hasUpgrade(this.profile, 'gear'),
      heavy: this.mission && this.mission.heavy,
    };
    const events = stepFlight(st, inp, dt, terrainHeight, opts);
    // Gentle wind drift
    const w = windAt(st.pos.x, st.pos.z, st.time, this.windSpeed, this.windDir);
    if (!st.onGround) {
      st.pos.x += w.x * dt * 0.35;
      st.pos.z += w.z * dt * 0.35;
    }
    posePlane(this.plane, st, dt);
    this.renderer.updateCamera(st, this.plane, dt, this.input);
    this.renderer.updateAmbient(dt, st.time, this.plane, this.runner ? this.runner.rings : this.endless ? { rings: this.endless.current ? [this.endless.current] : [] } : null);

    // Mission progress
    if (this.mode === 'mission' && this.runner && !this.runner.finished) {
      const evs = this.runner.update(st, dt, this.scene, {});
      for (const e of evs) this.onMissionEvent(e);
      if (this.runner.finished) { this.onMissionFinished(); return; }
    }
    // Endless progress
    if (this.mode === 'endless' && this.endless && this.endless.current) {
      const ring = this.endless.current;
      const d = Math.hypot(st.pos.x - ring.x, st.pos.y - ring.y, st.pos.z - ring.z);
      if (d < ring.r) {
        ring.done = true;
        ring.mesh.material.color.setHex(0x37d67a);
        this.endless.ringsHit++;
        this.endless.score += 100;
        this.audio.blip(988, 0.12);
        this.hud.showMessage(`Ring ${this.endless.ringsHit} — score ${this.endless.score}`, 1.6);
        this.profile.ringsTotal++;
        this.spawnEndlessRing();
      }
    }
    // Crash / out of fuel on the ground
    if (st.crashed) { this.onCrashed(); return; }

    // Events from physics
    for (const e of events) {
      if (e === 'stall') this.audio.blip(220, 0.3, 'square', 0.2);
      if (e === 'overspeed') this.audio.blip(180, 0.3, 'square', 0.2);
      if (e === 'takeoff') { this.audio.chime([523, 784]); this.hud.showMessage('Airborne!', 2); }
      if (e === 'touchdown') {
        this.audio.thud();
        this.profile.landings++;
        if (st._lastVS !== undefined && st._lastVS > -1.5) {
          if (awardFeat(this.profile, 'smooth')) this.hud.showMessage('★ Feat: Butter Smooth!', 3);
        }
        saveProfile(this.profile);
      }
      if (e === 'hard' || e === 'belly' || e === 'hard-crash') this.audio.thud();
      if (e === 'fuel-empty') this.hud.showMessage('Fuel empty — find a strip and glide in!', 4);
    }
    this.audio.setFlight(st.throttle, st.speed, st.onGround);
    const windText = `Wind ${Math.round(w.speed)} m/s`;
    this.hud.update(st, this.mission, this.mode === 'endless' ? this.endlessRunnerProxy() : this.runner, dt, { windText });
  }

  endlessRunnerProxy() {
    return {
      score: this.endless.score,
      elapsed: this.flight.time,
      objectives: [{ type: 'rings', points: new Array(50), done: false }],
      current: 0,
      ringIndex: this.endless.ringsHit,
      rings: { rings: [1] },
      finished: false,
      objectiveText: () => `Endless Rings — ${this.endless.ringsHit} rings · score ${this.endless.score}`,
    };
  }

  tryDrop() {
    if (this.mode !== 'mission' || !this.runner) return;
    const res = this.runner.tryDrop(this.flight);
    if (res && res.hit) {
      this.audio.chime([392, 523]);
      this.hud.showMessage('Direct hit! Water on target.', 2.5);
      if (res.done) this.onMissionFinished();
    } else if (res) {
      this.hud.showMessage('Drop missed — line up over the smoke, below the ceiling.', 2.5);
    }
  }

  onMissionEvent(e) {
    if (e === 'ring') { this.audio.blip(988, 0.12); this.profile.ringsTotal++; if (this.runner.ringsHit >= 10 && awardFeat(this.profile, 'rings10')) this.hud.showMessage('★ Feat: Ring Master!', 3); }
    if (e === 'landed') { this.audio.chime([523, 659]); this.hud.showMessage('Down safe — nice landing.', 2.5); }
    if (e === 'objective') this.hud.showMessage(this.runner.objectiveText(), 3);
    if (e === 'pickup') { this.audio.chime([523, 659, 784]); this.hud.showMessage('Passenger aboard — fly her home!', 3); }
    if (e === 'flyby') { this.audio.blip(784, 0.15); this.hud.showMessage('Checkpoint cleared.', 2); }
    saveProfile(this.profile);
  }

  onMissionFinished() {
    const st = this.flight;
    const fuelBonus = Math.round((st.fuel / st.fuelMax) * 50);
    this.runner.score += fuelBonus;
    const m = this.mission;
    const earned = m.reward;
    this.profile.credits += earned;
    const prev = this.profile.completed[m.id];
    const best = !prev || this.runner.score > prev.score;
    this.profile.completed[m.id] = { score: this.runner.score, time: Math.round(this.runner.elapsed), best: best ? this.runner.score : prev.score };
    if (awardFeat(this.profile, 'first')) this.hud.showMessage('★ Feat: First Paycheck!', 3);
    if (m.id === 'night-mail') awardFeat(this.profile, 'night');
    if (m.id === 'storm-front') awardFeat(this.profile, 'storm');
    if (m.id === 'grand-tour') awardFeat(this.profile, 'tour');
    if (this.profile.credits >= 1000) awardFeat(this.profile, 'rich');
    saveProfile(this.profile);
    this.audio.chime([523, 659, 784, 1047]);
    $('btn-next').style.display = '';
    $('debrief-title').textContent = `Mission complete — ${m.name}`;
    $('debrief-score').textContent = this.runner.score;
    $('debrief-time').textContent = `${Math.floor(this.runner.elapsed / 60)}:${String(Math.floor(this.runner.elapsed % 60)).padStart(2, '0')}`;
    $('debrief-fuel').textContent = `${Math.round((st.fuel / st.fuelMax) * 100)}% (+${fuelBonus})`;
    $('debrief-credits').textContent = `+${earned} credits (balance ${this.profile.credits})`;
    $('debrief-note').textContent = best ? 'New best score for this mission!' : `Best on this mission: ${this.profile.completed[m.id].best}`;
    this.showScreen('debrief');
  }

  onCrashed() {
    const st = this.flight;
    this.audio.thud();
    if (this.mode === 'endless') {
      const score = this.endless.score;
      const best = Math.max(this.profile.endlessBest, this.endless.ringsHit);
      this.profile.endlessBest = best;
      if (this.endless.ringsHit >= 25) awardFeat(this.profile, 'endless25');
      saveProfile(this.profile);
      $('debrief-title').textContent = `Endless Rings — ${st.crashReason}`;
      $('debrief-score').textContent = score;
      $('debrief-time').textContent = `${this.endless.ringsHit} rings`;
      $('debrief-fuel').textContent = '—';
      $('debrief-credits').textContent = `Best: ${best} rings`;
      $('debrief-note').textContent = this.endless.ringsHit >= 25 ? '★ Feat: Endless 25!' : 'Tip: rings spawn ahead of your nose — keep the speed up.';
      $('btn-next').style.display = 'none';
      this.showScreen('debrief');
      return;
    }
    $('debrief-title').textContent = `Crashed — ${st.crashReason}`;
    $('debrief-score').textContent = this.runner ? this.runner.score : 0;
    $('debrief-time').textContent = this.runner ? `${Math.floor(this.runner.elapsed / 60)}:${String(Math.floor(this.runner.elapsed % 60)).padStart(2, '0')}` : '—';
    $('debrief-fuel').textContent = '—';
    $('debrief-credits').textContent = 'No payout for a wreck — the hangar crew sends its regards.';
    $('debrief-note').textContent = 'Tip: keep speed above 70 kt on approach, gear down, flaps to LAND, and flare gently.';
    $('btn-next').style.display = 'none';
    this.showScreen('debrief');
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__game = game;
  game.showScreen('title');
  game.startWorld('day');
  // Title-screen backdrop: park the plane on the Ridgefield apron.
  const s = takeoffStart(fieldById('ridgefield'));
  game.flight = newFlightState(s, 90);
  game.flight.speed = 0;
  game.plane.visible = true;
  posePlane(game.plane, game.flight, 0);
  game.renderer.camera.position.set(s.x + 60, s.y + 26, s.z + 80);
  game.renderer.camera.lookAt(game.plane.position.x, game.plane.position.y + 2, game.plane.position.z);
  // Screenshot mode overrides everything.
  const shot = parseShot();
  if (shot) {
    applyShot(game, shot.shot);
    game.showScreen('flying');
  }
  requestAnimationFrame(game._boundLoop);
});
