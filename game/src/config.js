// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
//
// GLOWKEEPER: you are a lantern-wisp in a dark cavern. Gather embers to feed your light,
// keep the shades at bay, and survive all 8 waves until dawn breaks.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Waves to survive before dawn (the win). */
export const WAVES_TO_WIN = 8;

/** Seconds of calm between waves, when bonus embers drift in. */
export const CALM_SECONDS = 4;

export const PLAYER = {
  radius: 16,
  speed: 330,
  /** Light radius at light level 1, and how much each ember level adds (capped at LIGHT_MAX_LEVEL). */
  lightRadius: 130,
  lightPerLevel: 13,
  /** Seconds of invulnerability after a hit. */
  invulnerable: 1.6,
  /** Flare energy (0-100) the wisp starts with. */
  energyStart: 50,
  /** Energy a flare costs, and energy gained per ember. */
  flareCost: 35,
  energyPerEmber: 6,
  /** Dash: cooldown seconds, speed multiplier while dashing, dash length. */
  dashCooldown: 2.2,
  dashTime: 0.16,
  dashSpeed: 2.6,
};

/** The light stops growing here: ten ember-levels would light the whole cavern. */
export const LIGHT_MAX_LEVEL = 8;

export const HEARTS = 3;

/** Ember (collectible light mote) tuning. */
export const EMBER = {
  radius: 9,
  /** Base drift speed; embers wander slowly and twinkle. */
  drift: 26,
  points: 10,
  /** Seconds inside which a pickup chains the combo. */
  comboWindow: 2.5,
  /** Combo multiplier caps at x8. */
  comboMax: 8,
  /** Embers floating at once during a wave; more drift in during the calm. */
  targetCount: 9,
  calmBonus: 5,
};

/** Shade (enemy) tuning, per kind. */
export const SHADE = {
  drifter: { radius: 20, speed: 74, hp: 1, score: 15, weight: 10 },
  weaver: { radius: 16, speed: 96, hp: 1, score: 25, weight: 6, wobble: 2.4, wobbleAmp: 70 },
  rusher: { radius: 14, speed: 78, hp: 1, score: 40, weight: 4, dashSpeed: 275, dashEvery: 2.6, telegraph: 0.45 },
  /** How much faster shades get per wave, and the cap. */
  speedPerWave: 9,
  speedCap: 1.9,
  /** Shades inside the light crawl a little; too close and the glow shoves them back —
      but the shove is weaker than their walk, so a shade always closes in eventually. */
  repelRadius: 40,
  repelForce: 26,
  lightSlow: 0.75,
  /** A shade alive this long grows hungry: faster, and no longer slowed by the light. */
  hungerSeconds: 20,
  hungerSpeed: 1.5,
};

/** How many shades each wave sends, and how fast they arrive. */
export const WAVE = {
  baseCount: 6,
  perWave: 4,
  /** Seconds between spawns at wave 1; shrinks per wave to a floor. */
  interval: 1.3,
  intervalScale: 0.9,
  minInterval: 0.45,
};

/** Power-up tuning: prism (bigger light), heart, nova (free flare). */
export const POWERUP = {
  radius: 15,
  /** Chance a defeated shade drops one, and seconds between ambient drops. */
  dropChance: 0.12,
  ambientEvery: 24,
  prismSeconds: 20,
  lightBonus: 46,
};

export const PALETTE = {
  backdrop: '#070a14',
  cavern: '#141b36',
  cavernDeep: '#10162e',
  rock: '#28325e',
  rockEdge: '#3a467e',
  player: '#ffd97a',
  playerCore: '#fff3c4',
  ember: '#ffb347',
  emberCore: '#ffe9a8',
  shade: '#715cb0',
  shadeCore: '#40306e',
  shadeEye: '#ff5d73',
  flare: '#ffe9a8',
  heart: '#ff5d73',
  prism: '#7ae0ff',
  nova: '#c9a7ff',
  panel: '#121830',
  panelEdge: '#2a3560',
  text: '#f2ead8',
  muted: '#9aa3c0',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'glowkeeper.best';
