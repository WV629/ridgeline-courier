// Ridgeline Courier — game configuration: world layout, airfields, missions,
// upgrades and achievements. Pure data + tuning constants; no rendering here.
export const WORLD = {
  size: 6000, // world spans -3000..3000 m on x and z
  seaLevel: 0,
  seed: 7,
};

// Airfields: position (x,z), runway heading in degrees, length, surface.
export const AIRFIELDS = [
  { id: 'ridgefield', name: 'Ridgefield', x: 0, z: 900, heading: 90, length: 900, width: 34, town: 'Ridgefield Town' },
  { id: 'northport', name: 'Northport', x: -1750, z: -1500, heading: 20, length: 760, width: 30, town: 'Northport' },
  { id: 'eastbay', name: 'East Bay', x: 2050, z: -650, heading: 140, length: 700, width: 30, town: 'East Bay' },
  { id: 'coral', name: 'Coral Strip', x: -600, z: 2150, heading: 0, length: 520, width: 26, town: 'Coral Village' },
];

// Mission objectives:
//  {type:'rings', points:[{x,y,z,r}...]} fly through each ring in order
//  {type:'land', field:'ridgefield'} land on the named strip
//  {type:'pickup', x, z, label} land near the point and wait for boarding
//  {type:'drop', x, z, label, alt} press SPACE over the point below alt
//  {type:'flyby', x, y, z, label} pass within 120 m of the point
export const MISSIONS = [
  {
    id: 'first-light', name: 'First Light', no: 1, time: 'dawn', wind: 3, reward: 120, par: 240,
    brief: 'Your first paid run. Take off from Ridgefield, thread the six dawn rings over the valley, and put her down at Northport. Gentle on the throttle — the old girl stalls if you yank her.',
    objectives: [
      { type: 'rings', points: [[-300, 950, 300, 26], [-700, 670, -300, 26], [-1100, 460, -800, 26], [-1400, 470, -1100, 26], [-1600, 480, -1300, 26], [-1750, 420, -1450, 26]] },
      { type: 'land', field: 'northport' },
    ],
  },
  {
    id: 'mail-run', name: 'Mail Run', no: 2, time: 'day', wind: 5, reward: 180, par: 300,
    brief: 'Three bags of mail, three strips, one morning. Ridgefield to East Bay to Coral Strip and home. The postmaster pays on time, not on style — but style never hurt.',
    objectives: [
      { type: 'land', field: 'eastbay' },
      { type: 'land', field: 'coral' },
      { type: 'land', field: 'ridgefield' },
    ],
  },
  {
    id: 'ring-trial', name: 'Ring Trial', no: 3, time: 'day', wind: 4, reward: 200, par: 210,
    brief: 'Twelve rings over the ridge, against the clock. The courier league times every pilot on this course — beat 3:30 and the bar talks about you for a week.',
    objectives: [
      { type: 'rings', points: [[400, 780, 400, 24], [900, 620, 0, 24], [1200, 440, -600, 24], [900, 200, -1200, 24], [300, 180, -1500, 24], [-300, 320, -1200, 24], [-800, 520, -700, 24], [-1100, 500, -100, 24], [-900, 610, 500, 24], [-400, 550, 900, 24], [100, 860, 700, 24], [0, 700, 950, 24]] },
    ],
  },
  {
    id: 'mountain-pass', name: 'Mountain Pass', no: 4, time: 'day', wind: 8, reward: 240, par: 280,
    brief: 'The pass between the twin peaks is the short way to Northport — climb high, then thread the gates over the ridge. The ridge does not forgive daydreamers.',
    objectives: [
      { type: 'rings', points: [[-200, 790, -400, 26], [-600, 570, -900, 26], [-1000, 450, -1300, 26], [-1350, 510, -1500, 26]] },
      { type: 'land', field: 'northport' },
    ],
  },
  {
    id: 'storm-front', name: 'Storm Front', no: 5, time: 'storm', wind: 14, reward: 300, par: 320,
    brief: 'A squall is sitting on the bay and the clinic on East Island is out of medicine. Rain, gusts, low cloud — fly the needles, trust the instruments, and bring the box in.',
    objectives: [
      { type: 'flyby', x: 1200, y: 480, z: -200, label: 'Clear the headland' },
      { type: 'land', field: 'eastbay' },
    ],
  },
  {
    id: 'night-mail', name: 'Night Mail', no: 6, time: 'night', wind: 4, reward: 320, par: 300,
    brief: 'The night mail does not wait for sunrise. Ridgefield to Coral Strip by runway lights and compass alone. Watch the fuel — there is no second chance in the dark.',
    objectives: [
      { type: 'rings', points: [[-200, 500, 1400, 28], [-400, 370, 1800, 28], [-600, 160, 2100, 28]] },
      { type: 'land', field: 'coral' },
    ],
  },
  {
    id: 'island-hopper', name: 'Island Hopper', no: 7, time: 'day', wind: 6, reward: 360, par: 420,
    brief: 'Five stops, one tank, no refuelling. Plan the route, mind the gauge, and do not climb more than you must — every metre of altitude is fuel you will not get back.',
    objectives: [
      { type: 'land', field: 'northport' },
      { type: 'land', field: 'eastbay' },
      { type: 'land', field: 'coral' },
      { type: 'land', field: 'ridgefield' },
    ],
    fuel: 0.62,
  },
  {
    id: 'rescue', name: 'Rescue at Gull Cove', no: 8, time: 'dusk', wind: 7, reward: 400, par: 360,
    brief: 'A hiker is stranded at Gull Cove with a broken ankle. Land on the beach strip, wait for her to board, then fly her to Northport before dark. Smooth matters more than fast.',
    objectives: [
      { type: 'pickup', x: -2100, z: -500, label: 'Gull Cove beach' },
      { type: 'land', field: 'northport' },
    ],
  },
  {
    id: 'canyon-slalom', name: 'Canyon Slalom', no: 9, time: 'day', wind: 9, reward: 420, par: 240,
    brief: 'Ten slalom gates down the dry canyon, low and fast. The gates alternate left and right — roll her through, do not fight the rudder, and keep the wings out of the rock.',
    objectives: [
      { type: 'rings', points: [[600, 360, 1400, 24], [900, 430, 1100, 24], [600, 620, 800, 24], [950, 540, 500, 24], [650, 710, 200, 24], [1000, 510, -100, 24], [700, 510, -400, 24], [1050, 340, -700, 24], [750, 250, -1000, 24], [1100, 110, -1300, 24]] },
    ],
  },
  {
    id: 'cargo-heavy', name: 'Cargo Heavy', no: 10, time: 'day', wind: 5, reward: 460, par: 340,
    brief: 'A full load of machine parts for Northport, on the shortest strip you have. Heavy means a long takeoff roll and a lazy climb — use every metre of Coral Strip.',
    objectives: [
      { type: 'land', field: 'northport' },
    ],
    startField: 'coral',
    heavy: true,
  },
  {
    id: 'fire-watch', name: 'Fire Watch', no: 11, time: 'dusk', wind: 10, reward: 500, par: 380,
    brief: 'Three smoke columns on the east ridge. Overfly each one and drop a water load with SPACE, then land at East Bay. The forest service counts every direct hit.',
    objectives: [
      { type: 'drop', x: 1500, z: -1400, label: 'Smoke column 1', alt: 420 },
      { type: 'drop', x: 1900, z: -900, label: 'Smoke column 2', alt: 420 },
      { type: 'drop', x: 1300, z: -600, label: 'Smoke column 3', alt: 420 },
      { type: 'land', field: 'eastbay' },
    ],
  },
  {
    id: 'grand-tour', name: 'The Grand Tour', no: 12, time: 'day', wind: 6, reward: 800, par: 600,
    brief: 'The whole archipelago in one sortie: every strip, every island, home by supper. Eight legs, one tank of patience. Finish this and they paint your name on the hangar.',
    objectives: [
      { type: 'rings', points: [[-300, 950, 300, 26], [-900, 470, -600, 26]] },
      { type: 'land', field: 'northport' },
      { type: 'land', field: 'eastbay' },
      { type: 'rings', points: [[1000, 570, 100, 26], [300, 660, 1200, 26]] },
      { type: 'land', field: 'coral' },
      { type: 'land', field: 'ridgefield' },
    ],
  },
];

// Upgrades bought with mission credits between sorties.
export const UPGRADES = [
  { id: 'engine2', name: 'Engine Mk II', cost: 250, desc: '+18% thrust, faster climb' },
  { id: 'engine3', name: 'Engine Mk III', cost: 600, desc: '+15% thrust over Mk II', needs: 'engine2' },
  { id: 'tank', name: 'Long-Range Tank', cost: 300, desc: '+35% fuel capacity' },
  { id: 'gear', name: 'Reinforced Gear', cost: 220, desc: 'Hard landings hurt 40% less' },
  { id: 'avionics', name: 'Avionics Suite', cost: 350, desc: 'Rings glow brighter, +40 m ring assist' },
  { id: 'strobe', name: 'Landing Lights', cost: 150, desc: 'Night landings: runway lights reach further' },
];

export const FEATS = [
  { id: 'first', name: 'First Paycheck', desc: 'Finish your first mission' },
  { id: 'rings10', name: 'Ring Master', desc: 'Fly 10 rings in one sortie' },
  { id: 'smooth', name: 'Butter Smooth', desc: 'Land with vertical speed under 1.5 m/s' },
  { id: 'night', name: 'Night Owl', desc: 'Finish the Night Mail' },
  { id: 'storm', name: 'Storm Rider', desc: 'Finish the Storm Front' },
  { id: 'tour', name: 'Hangar Name', desc: 'Finish The Grand Tour' },
  { id: 'endless25', name: 'Endless 25', desc: 'Score 25 rings in Endless Rings' },
  { id: 'rich', name: 'High Roller', desc: 'Hold 1,000 credits at once' },
];

// Flight tuning (arcade with discipline).
export const FLIGHT = {
  maxThrust: 26, // m/s^2 at full throttle, sea level
  dragK: 0.0038, // quadratic drag
  stallClean: 34, // m/s stall speed, flaps up
  stallFlaps: 27, // m/s stall speed, flaps down
  maxSpeed: 96, // structural limit; beyond it damage accrues
  climbRate: 9, // base climb authority m/s
  turnAuthority: 1.0,
  fuelBurn: 0.011, // fraction per second at full throttle
  fuelCapacity: 100,
  gearHeight: 2.5, // wheels below fuselage centre
  crashVS: -6.5, // vertical speed that breaks the gear
  hardVS: -4.0, // vertical speed that hurts
};

export const TIMES_OF_DAY = {
  dawn: { sun: [0.45, 0.28, 0.85], skyTop: 0x7fa8d8, skyBottom: 0xffc98a, fog: 0xd8c2a8, sunColor: 0xffd9a0, ambient: 0.55, hemi: 0.75, sunIntensity: 1.6 },
  day: { sun: [0.5, 0.9, 0.4], skyTop: 0x3f7fd0, skyBottom: 0xbfe3f2, fog: 0xcfe0ea, sunColor: 0xfff2d0, ambient: 0.7, hemi: 0.9, sunIntensity: 2.2 },
  dusk: { sun: [-0.6, 0.22, 0.75], skyTop: 0x4a4a8a, skyBottom: 0xff9a5c, fog: 0xc99a7a, sunColor: 0xff8a4a, ambient: 0.5, hemi: 0.65, sunIntensity: 1.4 },
  night: { sun: [0.3, 0.5, -0.8], skyTop: 0x060a1e, skyBottom: 0x1a2440, fog: 0x0d1428, sunColor: 0xbfd0ff, ambient: 0.22, hemi: 0.3, sunIntensity: 0.5 },
  storm: { sun: [0.2, 0.55, 0.6], skyTop: 0x3a4250, skyBottom: 0x6a7078, fog: 0x5a6068, sunColor: 0xd8d8d8, ambient: 0.45, hemi: 0.55, sunIntensity: 0.9 },
};
