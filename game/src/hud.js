// HUD: all DOM instruments — airspeed, altitude, vertical speed, heading
// compass, artificial horizon, throttle/fuel/damage bars, mission panel,
// minimap, toasts and warnings. Updated every frame from flight state.
import { AIRFIELDS } from './config.js';
import { terrainHeight } from './terrain.js';
import { clamp } from './random.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['speed', 'alt', 'vs', 'hdg', 'thr', 'fuel', 'dmg', 'score', 'timer', 'objective', 'objectives', 'msg', 'warn', 'minimap', 'horizon', 'gear', 'flaps', 'wind', 'fuelbar', 'dmgbar', 'thrbar', 'credits', 'mission-name', 'combo']) {
      this.el[id] = document.getElementById(id);
    }
    this.msgTimer = 0;
    this.warnText = '';
    this.lastScore = -1;
    this.minimapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.horizonCtx = this.el.horizon ? this.el.horizon.getContext('2d') : null;
  }

  showMessage(text, dur = 3) {
    if (!this.el.msg) return;
    this.el.msg.textContent = text;
    this.el.msg.style.opacity = '1';
    this.msgTimer = dur;
  }

  showWarning(text) {
    this.warnText = text;
    if (this.el.warn) {
      this.el.warn.textContent = text;
      this.el.warn.style.display = text ? 'block' : 'none';
    }
  }

  update(st, mission, runner, dt, opts) {
    const speedKts = Math.round(st.speed * 1.944);
    const altM = Math.max(0, Math.round(st.pos.y - terrainHeight(st.pos.x, st.pos.z)));
    const altFt = Math.round(st.pos.y * 3.281);
    if (this.el.speed) this.el.speed.textContent = speedKts;
    if (this.el.alt) this.el.alt.textContent = `${altM} m · ${altFt} ft`;
    if (this.el.vs) {
      const vs = st.vs;
      this.el.vs.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`;
      this.el.vs.style.color = vs < -6 ? '#ff5a4a' : vs < -3 ? '#ffb84a' : '#cfe8ff';
    }
    if (this.el.hdg) {
      let hdg = ((-st.heading * 180) / Math.PI) % 360;
      if (hdg < 0) hdg += 360;
      this.el.hdg.textContent = String(Math.round(hdg)).padStart(3, '0') + '°';
    }
    if (this.el.thr) this.el.thr.textContent = `${Math.round(st.throttle * 100)}%`;
    if (this.el.thrbar) this.el.thrbar.style.width = `${st.throttle * 100}%`;
    const fuelPct = clamp((st.fuel / (st.fuelMax || 100)) * 100, 0, 100);
    if (this.el.fuel) this.el.fuel.textContent = `${Math.round(fuelPct)}%`;
    if (this.el.fuelbar) {
      this.el.fuelbar.style.width = `${fuelPct}%`;
      this.el.fuelbar.style.background = fuelPct < 20 ? '#ff5a4a' : fuelPct < 40 ? '#ffb84a' : '#37d67a';
    }
    if (this.el.dmg) this.el.dmg.textContent = `${Math.round(st.damage)}%`;
    if (this.el.dmgbar) {
      this.el.dmgbar.style.width = `${clamp(st.damage, 0, 100)}%`;
      this.el.dmgbar.style.background = st.damage > 60 ? '#ff5a4a' : st.damage > 30 ? '#ffb84a' : '#37d67a';
    }
    if (this.el.gear) this.el.gear.textContent = st.gearDown ? 'DOWN' : 'UP';
    if (this.el.flaps) this.el.flaps.textContent = ['UP', 'T/O', 'LAND'][st.flaps] || 'UP';
    if (this.el.wind) this.el.wind.textContent = opts.windText || '';
    if (this.el.score && runner && runner.score !== this.lastScore) {
      this.el.score.textContent = runner.score;
      this.lastScore = runner.score;
    }
    if (this.el.timer && runner) {
      const t = Math.floor(runner.elapsed);
      this.el.timer.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    if (this.el.objective && runner) this.el.objective.textContent = runner.objectiveText();
    if (this.el['mission-name'] && mission) this.el['mission-name'].textContent = `${mission.no}. ${mission.name}`;
    if (this.el.objectives && runner) {
      const lines = runner.objectives.map((o, i) => {
        const mark = o.done ? '✓' : i === runner.current ? '►' : '·';
        let label = '';
        if (o.type === 'rings') label = `Rings ${runner.ringIndex}/${o.points.length}`;
        else if (o.type === 'land') label = `Land at ${AIRFIELDS.find((f) => f.id === o.field).name}`;
        else if (o.type === 'pickup') label = `Pick up at ${o.label}`;
        else if (o.type === 'drop') label = `Water drop: ${o.label}`;
        else if (o.type === 'flyby') label = `Fly by ${o.label}`;
        return `<div class="obj ${o.done ? 'done' : i === runner.current ? 'current' : ''}">${mark} ${label}</div>`;
      }).join('');
      if (this.el.objectives.dataset.html !== lines) {
        this.el.objectives.innerHTML = lines;
        this.el.objectives.dataset.html = lines;
      }
    }
    // Warnings
    let warn = '';
    if (st.crashed) warn = st.crashReason || 'CRASHED';
    else if (st.stalled) warn = '⚠ STALL — LOWER NOSE, FULL THROTTLE';
    else if (st.overspeed) warn = '⚠ OVERSPEED — REDUCE THROTTLE';
    else if (fuelPct < 15 && fuelPct > 0) warn = '⚠ LOW FUEL';
    else if (st.fuel <= 0) warn = '⚠ FUEL EMPTY — GLIDING';
    else if (altM < 60 && !st.onGround && st.vs < -4) warn = '⚠ TERRAIN — PULL UP';
    else if (!st.gearDown && st.onGround === false && altM < 120 && st.vs < -1) warn = '⚠ GEAR UP — LANDING?';
    if (warn !== this.warnText) this.showWarning(warn);
    // Message fade
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0 && this.el.msg) this.el.msg.style.opacity = '0';
    }
    this.drawHorizon(st);
    this.drawMinimap(st, runner);
  }

  drawHorizon(st) {
    const ctx = this.horizonCtx;
    if (!ctx) return;
    const w = 150, h = 84;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(st.roll);
    const pitchPx = clamp(st.pitch * 120, -40, 40);
    ctx.fillStyle = '#3f7fd0';
    ctx.fillRect(-w, -h - pitchPx, w * 2, h + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-w, -pitchPx, w * 2, h + pitchPx);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w, -pitchPx); ctx.lineTo(w, -pitchPx); ctx.stroke();
    ctx.restore();
    // Fixed wings marker
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w / 2 - 28, h / 2); ctx.lineTo(w / 2 - 8, h / 2); ctx.moveTo(w / 2 + 8, h / 2); ctx.lineTo(w / 2 + 28, h / 2); ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.fill();
  }

  drawMinimap(st, runner) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const w = 190, h = 190;
    ctx.clearRect(0, 0, w, h);
    // Sea + land blobs (schematic)
    ctx.fillStyle = '#16394f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2e5d33';
    const blobs = [[95, 105, 62], [32, 40, 34], [155, 62, 30], [72, 168, 22], [168, 150, 24]];
    for (const [x, y, r] of blobs) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const toMap = (x, z) => [95 + (x / 6000) * w, 95 + (z / 6000) * h];
    // Airfields
    ctx.fillStyle = '#ffd23e';
    for (const f of AIRFIELDS) {
      const [mx, mz] = toMap(f.x, f.z);
      ctx.fillRect(mx - 3, mz - 3, 6, 6);
    }
    // Next objective
    if (runner && !runner.finished) {
      const obj = runner.currentObjective();
      let tx = null, tz = null;
      if (obj && obj.type === 'rings' && runner.rings) {
        const ring = runner.rings.rings[runner.ringIndex];
        if (ring) { tx = ring.x; tz = ring.z; }
      } else if (obj && obj.type === 'land') {
        const f = AIRFIELDS.find((ff) => ff.id === obj.field);
        tx = f.x; tz = f.z;
      } else if (obj && (obj.type === 'pickup' || obj.type === 'drop' || obj.type === 'flyby')) {
        tx = obj.x; tz = obj.z;
      }
      if (tx !== null) {
        const [mx, mz] = toMap(tx, tz);
        ctx.strokeStyle = '#ff8a1e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, mz, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, mz, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ff8a1e'; ctx.fill();
      }
    }
    // Plane
    const [px, pz] = toMap(st.pos.x, st.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-st.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
