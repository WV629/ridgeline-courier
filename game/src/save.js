// Pilot profile persistence (localStorage): credits, owned upgrades,
// completed missions with best scores, feats, endless best.
const KEY = 'ridgeline-courier-profile-v1';

export function defaultProfile() {
  return {
    credits: 0,
    upgrades: [],
    completed: {}, // mission id -> {score, time, best}
    feats: [],
    endlessBest: 0,
    flights: 0,
    landings: 0,
    ringsTotal: 0,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    return { ...defaultProfile(), ...p };
  } catch (e) {
    return defaultProfile();
  }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
}

export function hasUpgrade(p, id) { return p.upgrades.includes(id); }
export function engineMultiplier(p) {
  let m = 1;
  if (hasUpgrade(p, 'engine2')) m *= 1.18;
  if (hasUpgrade(p, 'engine3')) m *= 1.15;
  return m;
}
export function awardFeat(p, id) {
  if (!p.feats.includes(id)) {
    p.feats.push(id);
    return true;
  }
  return false;
}
