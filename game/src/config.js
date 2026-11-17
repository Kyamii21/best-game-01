// LUMENFALL — Siege of the Last Lantern. Every tuning number and colour lives here.
// You are the last lantern-wisp of a drowned cavern city. Twin-stick combat: WASD to move,
// mouse to aim, hold click to fire light-bolts. Slain shades drop star-gems; gather enough
// and you level up, choosing 1 of 3 blessings. Survive 12 waves — a Gloom Herald boss
// rises on waves 4, 8 and 12 — until dawn breaks over the cavern.

export const FIELD = { width: 1280, height: 720 };

/** Fixed simulation step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Waves to survive before dawn (the win). Boss waves are multiples of 4. */
export const WAVES_TO_WIN = 12;
export const BOSS_EVERY = 4;

/** Seconds of calm between waves, when bonus embers drift in. */
export const CALM_SECONDS = 5;

export const PLAYER = {
  radius: 15,
  speed: 315,
  hp: 5,
  /** Light radius at light level 1, and how much each ember level adds. */
  lightRadius: 135,
  lightPerLevel: 12,
  /** Seconds of invulnerability after a hit. */
  invulnerable: 1.4,
  /** Flare energy (0-100) the wisp starts with. */
  energyStart: 55,
  /** Energy a flare costs, and energy gained per ember. */
  flareCost: 30,
  energyPerEmber: 7,
  /** Dash: cooldown seconds, dash length, speed multiplier, brief invulnerability. */
  dashCooldown: 2.0,
  dashTime: 0.17,
  dashSpeed: 2.9,
  /** Bolt tuning: base damage, shots per second, bolt speed, bolt radius. */
  boltDamage: 1,
  fireRate: 3.2,
  boltSpeed: 640,
  boltRadius: 6,
};

/** The light stops growing here. */
export const LIGHT_MAX_LEVEL = 10;
export const HEARTS = 5;

/** Ember (collectible light mote) tuning. */
export const EMBER = {
  radius: 9,
  drift: 26,
  points: 10,
  /** Seconds inside which a pickup chains the combo. */
  comboWindow: 2.5,
  comboMax: 10,
  /** Embers floating at once during a wave; more drift in during the calm. */
  targetCount: 10,
  calmBonus: 6,
};

/** Star-gem (XP) tuning. */
export const GEM = {
  radius: 7,
  /** Seconds a gem lasts before fading. */
  life: 25,
  /** Magnet pull radius at magnet level 0, and per magnet upgrade level. */
  magnetBase: 70,
  magnetPerLevel: 42,
};

/** Enemy tuning, per kind. hp is in bolt-damage units. */
export const ENEMY = {
  drifter: { radius: 19, speed: 72, hp: 2, score: 15, xp: 1, weight: 10 },
  weaver: { radius: 15, speed: 98, hp: 2, score: 25, xp: 1, weight: 7, wobble: 2.6, wobbleAmp: 78 },
  rusher: { radius: 13, speed: 80, hp: 2, score: 40, xp: 2, weight: 5, dashSpeed: 290, dashEvery: 2.8, telegraph: 0.5 },
  spitter: { radius: 17, speed: 58, hp: 3, score: 50, xp: 2, weight: 5, range: 330, shotEvery: 3.1, orbSpeed: 165 },
  splitter: { radius: 21, speed: 62, hp: 4, score: 45, xp: 2, weight: 4 },
  brute: { radius: 30, speed: 46, hp: 14, score: 90, xp: 4, weight: 3 },
  mite: { radius: 9, speed: 150, hp: 1, score: 10, xp: 1, weight: 0 },
};

/** Enemy kinds unlocked by wave. */
export const UNLOCK = { weaver: 2, rusher: 2, spitter: 3, splitter: 4, brute: 5 };

export const BOSS = {
  radius: 52,
  hp: 90,
  speed: 52,
  score: 500,
  xp: 25,
  /** Seconds between radial orb bursts and between summon calls. */
  burstEvery: 3.4,
  summonEvery: 7,
  burstCount: 10,
  orbSpeed: 150,
};

/** How much faster enemies get per wave, and the cap. */
export const ENEMY_SCALE = { speedPerWave: 0.055, speedCap: 1.9, hpPerWave: 0.16 };

/** How many ordinary enemies each wave sends, and how fast they arrive. */
export const WAVE = {
  baseCount: 7,
  perWave: 4,
  /** Seconds between spawns at wave 1; shrinks per wave to a floor. */
  interval: 1.25,
  intervalScale: 0.9,
  minInterval: 0.4,
};

/** Power-up tuning: prism (wider light), heart, nova (full energy), shield (one free hit). */
export const POWERUP = {
  radius: 15,
  /** Chance a defeated enemy drops one, and seconds between ambient drops. */
  dropChance: 0.10,
  ambientEvery: 26,
  prismSeconds: 22,
  lightBonus: 50,
  life: 14,
};

/** Level-up blessings offered on each level. `max` is how many times it can be taken. */
export const BLESSINGS = [
  { id: 'damage', name: 'Ember Rounds', desc: '+35% bolt damage', max: 5, icon: '✦' },
  { id: 'rate', name: 'Rapid Wick', desc: '+22% fire rate', max: 5, icon: '≫' },
  { id: 'multi', name: 'Split Flame', desc: '+1 bolt per shot', max: 3, icon: '⁂' },
  { id: 'speed', name: 'Swift Current', desc: '+12% move speed', max: 4, icon: '➤' },
  { id: 'magnet', name: 'Star Magnet', desc: 'Gems & embers fly to you', max: 3, icon: '◎' },
  { id: 'pierce', name: 'Piercing Light', desc: 'Bolts pass through +1 shade', max: 3, icon: '↦' },
  { id: 'crit', name: 'Dawn Edge', desc: '+12% critical hits (×2)', max: 4, icon: '✧' },
  { id: 'heart', name: 'Warm Hearth', desc: 'Heal 1 heart, +1 max heart', max: 3, icon: '♥' },
  { id: 'flare', name: 'Supernova', desc: 'Flare hits twice as hard', max: 3, icon: '☀' },
  { id: 'light', name: 'Bright Halo', desc: '+30 light radius, +20 energy', max: 4, icon: '◉' },
];

/** XP needed for level N (1-based): 6, 12, 20, 30, ... */
export function xpForLevel(level) {
  return 4 + level * (level + 3);
}

export const PALETTE = {
  backdrop: '#05070f',
  cavern: '#131a33',
  cavernDeep: '#0d1329',
  rock: '#26305a',
  rockEdge: '#3b4780',
  crystal: '#5ef2d6',
  crystalDim: '#2a7f8f',
  rune: '#2c3a72',
  player: '#ffd97a',
  playerCore: '#fff3c4',
  bolt: '#ffe9a8',
  boltCore: '#ffffff',
  ember: '#ffb347',
  emberCore: '#ffe9a8',
  gem: '#7ae0ff',
  gemCore: '#dff8ff',
  shade: '#715cb0',
  shadeCore: '#40306e',
  shadeEye: '#ff5d73',
  spitter: '#9a5fd0',
  brute: '#8a4a6b',
  boss: '#c94f7c',
  bossCore: '#5e1f3d',
  orb: '#e06bff',
  heart: '#ff5d73',
  prism: '#7ae0ff',
  nova: '#c9a7ff',
  shield: '#8affc1',
  panel: '#111831',
  panelEdge: '#2e3a68',
  card: '#1a2347',
  cardEdge: '#4a5aa0',
  text: '#f2ead8',
  muted: '#9aa3c0',
  gold: '#f2c94c',
  danger: '#ff5d73',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumenfall.best';
