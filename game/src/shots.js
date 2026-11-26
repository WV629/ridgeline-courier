// Screenshot mode: ?shot=<name>&seed=<n> puts the game into a fixed,
// dense, peak-action state and freezes the interesting bits so a capture
// shows the game at its best. The HUD stays fully lit. Used only for the
// entry's screenshots; normal play never passes ?shot=.
import { MISSIONS, AIRFIELDS } from './config.js';
import { terrainHeight } from './terrain.js';

// Returns { missionId, setup } or null when no ?shot= is present.
export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { shot, seed: Number(q.get('seed') || 1) };
}

// Place the plane mid-mission with rings ahead and a full HUD.
// Called by main.js after the world is built, before the first frame.
// NOTE: game.flight is replaced by startMission, so the state is read
// fresh after each startMission call — never captured before it.
export function applyShot(game, shot) {
  // y is absolute altitude (rings fly high over the ridge, so shots sit
  // near ring height, not near the ground).
  const set = (x, y, z, headingDeg, speed, throttle) => {
    const st = game.flight;
    st.pos.set(x, y, z);
    st.heading = (headingDeg * Math.PI) / 180;
    st.pitch = 0.02;
    st.roll = -0.12;
    st.speed = speed;
    st.throttle = throttle;
    st.onGround = false;
    st.vs = 0;
    st.fuel = 78;
    st.damage = 12;
    st.gearDown = true;
  };
  if (shot === 'cover') {
    // Chase view: Ring Trial gates ahead over the valley, HUD dense.
    game.startMission(MISSIONS[2], { silent: true }); // Ring Trial
    set(180, 745, 680, -39, 62, 0.82);
    game.renderer.cameraMode = 'chase';
  } else if (shot === 'cockpit') {
    // Cockpit view of the same moment as the cover: ring dead ahead.
    game.startMission(MISSIONS[2], { silent: true }); // Ring Trial
    set(180, 745, 680, -39, 62, 0.82);
    game.renderer.cameraMode = 'cockpit';
  } else if (shot === 'landing') {
    // Day final approach to East Bay: on short final, 55 m over the
    // threshold — the lit strip fills the lower frame ahead of the plane.
    game.startMission(MISSIONS[1], { silent: true }); // Mail Run
    const f = AIRFIELDS[2]; // East Bay
    const a = (f.heading * Math.PI) / 180;
    const dist = 120;
    const ax = f.x + Math.sin(a) * dist, az = f.z + Math.cos(a) * dist;
    set(ax, terrainHeight(ax, az) + 55, az, f.heading, 42, 0.42);
    const st = game.flight;
    st.flaps = 2;
    st.gearDown = true;
    st.pitch = -0.06;
    game.renderer.cameraMode = 'chase';
  } else if (shot === 'storm') {
    // Storm front: rain, low cloud, smoke columns and the drop beacon.
    game.startMission(MISSIONS[10], { silent: true }); // Fire Watch
    game.setTimeOfDay('storm');
    set(1350, terrainHeight(1350, -1100) + 220, -1100, -27, 64, 0.85);
    game.renderer.cameraMode = 'chase';
  } else {
    return false;
  }
  // Snap the chase camera to the teleported plane: the chase camera eases,
  // and in a slow software renderer it would otherwise still be hundreds
  // of metres away when the capture fires.
  game.poseCameraSnap();
  // Light up the HUD with a mid-mission state.
  game.hud.showMessage(game.runner ? game.runner.objectiveText() : 'Fly the rings', 999);
  game.shotMode = shot;
  window.__shotReady = true;
  return true;
}
