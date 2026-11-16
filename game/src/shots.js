// The screenshot scenes behind ?shot=start|play|flare|win|end. Each one plays the real rules
// forward from a fresh world, steered by an autopilot (seek the nearest ember, flee shades
// that get close, flare when the light is crowded, dash out of trouble), so the frame is
// what a real game looks like and the same seed always gives the same frame. The win scene
// plays all eight waves; the end scene's pilot never flares or dashes, so it is caught out
// as a hurried player is.
import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 30;
const FLARE_LIMIT_SECONDS = 240;
const WIN_LIMIT_SECONDS = 1500;
const END_LIMIT_SECONDS = 600;

/** Steer toward `tx, ty` while keeping clear of shades; returns a normalised vector. */
function steer(state, tx, ty, fleeRadius) {
  const p = state.player;
  let wx = tx - p.x;
  let wy = ty - p.y;
  const wl = Math.hypot(wx, wy) || 1;
  wx /= wl;
  wy /= wl;
  for (const shade of state.shades) {
    const dx = p.x - shade.x;
    const dy = p.y - shade.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < fleeRadius) {
      const push = (1 - d / fleeRadius) * 2.2;
      wx += (dx / d) * push;
      wy += (dy / d) * push;
    }
  }
  const len = Math.hypot(wx, wy) || 1;
  return { x: wx / len, y: wy / len };
}

function nearestEmber(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const ember of state.embers) {
    const d = (ember.x - p.x) ** 2 + (ember.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = ember;
    }
  }
  return best;
}

function nearestShadeDist(state) {
  const p = state.player;
  let best = Infinity;
  for (const shade of state.shades) {
    const d = Math.hypot(shade.x - p.x, shade.y - p.y);
    if (d < best) best = d;
  }
  return best;
}

function shadesInLight(state, radius) {
  const p = state.player;
  let count = 0;
  for (const shade of state.shades) {
    if (Math.hypot(shade.x - p.x, shade.y - p.y) < radius) count += 1;
  }
  return count;
}

/**
 * One autopilot decision. `skilled` pilots flare and dash; a hurried one does neither.
 * Returns { move, flare, dash } for this step.
 */
function autopilot(world, skilled) {
  const state = world.state;
  const p = state.player;
  const ember = nearestEmber(state);
  const target = ember ?? { x: FIELD.width / 2, y: FIELD.height / 2 };
  const move = steer(state, target.x, target.y, skilled ? 150 : 90);
  let flare = false;
  let dash = false;
  if (skilled) {
    const light = world.lightRadius();
    const crowded = shadesInLight(state, light * 0.85) >= 2;
    const cornered = nearestShadeDist(state) < 80;
    if (state.energy >= PLAYER.flareCost && (crowded || cornered)) flare = true;
    if (nearestShadeDist(state) < 64 && p.dashCooldown <= 0) dash = true;
  }
  return { move, flare, dash };
}

function runSteps(world, seconds, skilled, stopAt) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const acts = autopilot(world, skilled);
    const events = world.step(STEP, acts.move, { flare: acts.flare, dash: acts.dash }, false);
    if (stopAt && (events & stopAt)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the best score to
 * show, and whether the scene reached its goal (used by the flare/win/end shots).
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'start' || (name !== 'play' && name !== 'flare' && name !== 'win' && name !== 'end')) {
    world.seedDemo();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, { flare: false, dash: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, reached: true };
  }
  if (name === 'play') {
    runSteps(world, PLAY_SECONDS, true, 0);
    return { screen: SCREEN_PLAY, best: world.state.score, reached: true };
  }
  if (name === 'flare') {
    // Play until a flare slays at least two shades, then stop on the flash.
    const steps = Math.floor(FLARE_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const acts = autopilot(world, true);
      const before = world.state.shadesSlain;
      const events = world.step(STEP, acts.move, { flare: acts.flare, dash: acts.dash }, false);
      if (events & EVENT_OVER) break;
      if (world.state.shadesSlain - before >= 2 && world.state.flareFlash > 0.25) {
        return { screen: SCREEN_PLAY, best: world.state.score, reached: true };
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score, reached: false };
  }
  if (name === 'win') {
    const steps = Math.floor(WIN_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const acts = autopilot(world, true);
      const events = world.step(STEP, acts.move, { flare: acts.flare, dash: acts.dash }, false);
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score, reached: true };
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score, reached: false };
    }
    return { screen: SCREEN_PLAY, best: world.state.score, reached: false };
  }
  // end: the hurried pilot chases embers, never flees, never flares or dashes, and
  // hesitates for a beat every few seconds — as a distracted player does. It gets caught
  // once the shades speed up. The hesitation is a function of game time, so the scene
  // stays deterministic for a fixed seed.
  const steps = Math.floor(END_LIMIT_SECONDS / STEP);
  for (let i = 0; i < steps; i += 1) {
    const hesitating = world.state.elapsed > 5 && (world.state.elapsed % 9) < 0.75;
    const ember = nearestEmber(world.state) ?? { x: FIELD.width / 2, y: FIELD.height / 2 };
    const move = hesitating ? { x: 0, y: 0 } : steer(world.state, ember.x, ember.y, 0);
    const events = world.step(STEP, move, { flare: false, dash: false }, false);
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score, reached: true };
  }
  return { screen: SCREEN_PLAY, best: world.state.score, reached: false };
}
