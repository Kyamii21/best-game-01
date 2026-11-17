// The screenshot scenes behind ?shot=start|play|boss|win. Each one plays the real rules
// forward from a fresh world, steered by an autopilot (kite the shades, aim at the
// nearest one, hold fire, flare when crowded, dash out of trouble, take the best
// blessing on level-up), so the frame is what a real game looks like and the same seed
// always gives the same frame. The boss scene stages wave 4 with the Herald already
// risen; the win scene plays all twelve waves for real.

import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 45;
const BOSS_SECONDS = 14;
const WIN_LIMIT_SECONDS = 1500;

/** Blessing preference for the autopilot (best first). */
const PICK_ORDER = ['multi', 'damage', 'rate', 'pierce', 'crit', 'magnet', 'flare', 'speed', 'light', 'heart'];

function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    const d = (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return best;
}

function nearestPickup(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const gem of state.gems) {
    const d = (gem.x - p.x) ** 2 + (gem.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = gem;
    }
  }
  if (best) return best;
  for (const ember of state.embers) {
    const d = (ember.x - p.x) ** 2 + (ember.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = ember;
    }
  }
  return best;
}

/** One autopilot decision per step. Returns { move, aim, firing, flare, dash, pick }. */
function autopilot(world) {
  const state = world.state;
  const p = state.player;
  if (state.phase === 'levelup' && state.offer) {
    let pick = 0;
    let bestRank = Infinity;
    state.offer.forEach((blessing, i) => {
      let rank = PICK_ORDER.indexOf(blessing.id);
      if (rank < 0) rank = 99;
      if (blessing.id === 'heart' && p.hp <= 2) rank = -1;
      if (rank < bestRank) {
        bestRank = rank;
        pick = i;
      }
    });
    return { move: { x: 0, y: 0 }, aim: null, firing: false, flare: false, dash: false, pick };
  }
  const enemy = nearestEnemy(state);
  const pickup = nearestPickup(state);
  // Kite: drift toward the nearest pickup, but run from anything close, and keep a
  // little distance from the boss while still shooting it.
  let wx = 0;
  let wy = 0;
  if (pickup) {
    wx = pickup.x - p.x;
    wy = pickup.y - p.y;
    const wl = Math.hypot(wx, wy) || 1;
    wx /= wl;
    wy /= wl;
  }
  for (const e of state.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const fleeR = e.kind === 7 ? 260 : 130;
    if (d < fleeR) {
      const push = (1 - d / fleeR) * 2.4;
      wx += (dx / d) * push;
      wy += (dy / d) * push;
    }
  }
  // Stay inside the field with a margin.
  if (p.x < 90) wx += 1;
  if (p.x > FIELD.width - 90) wx -= 1;
  if (p.y < 90) wy += 1;
  if (p.y > FIELD.height - 90) wy -= 1;
  const len = Math.hypot(wx, wy) || 1;
  const move = { x: wx / len, y: wy / len };
  const aim = enemy ? { x: enemy.x, y: enemy.y } : { x: p.x, y: p.y - 100 };
  const enemyDist = enemy ? Math.hypot(enemy.x - p.x, enemy.y - p.y) : Infinity;
  const firing = enemy !== null && enemyDist < 560;
  let crowded = 0;
  const light = world.lightRadius();
  for (const e of state.enemies) {
    if (Math.hypot(e.x - p.x, e.y - p.y) < light * 0.9) crowded += 1;
  }
  const flare = state.energy >= PLAYER.flareCost && (crowded >= 3 || enemyDist < 70);
  const dash = enemyDist < 58 && p.dashCooldown <= 0;
  return { move, aim, firing, flare, dash, pick: -1 };
}

function runSteps(world, seconds, stopAt) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const acts = autopilot(world);
    const actions = {
      firing: acts.firing,
      aimX: acts.aim ? acts.aim.x : undefined,
      aimY: acts.aim ? acts.aim.y : undefined,
      flare: acts.flare,
      dash: acts.dash,
      pick: acts.pick >= 0 ? acts.pick : undefined,
    };
    const events = world.step(STEP, acts.move, actions, false);
    if (stopAt && (events & stopAt)) return events;
    if (events & EVENT_OVER) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the best score
 * to show, and whether the scene reached its goal.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'start' || (name !== 'play' && name !== 'boss' && name !== 'win')) {
    world.seedDemo();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, { firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, reached: true };
  }
  if (name === 'play') {
    runSteps(world, PLAY_SECONDS, 0);
    return { screen: SCREEN_PLAY, best: world.state.score, reached: true };
  }
  if (name === 'boss') {
    world.stageBossScene();
    for (let i = 0; i < 8 / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, { firing: false }, true);
    }
    runSteps(world, BOSS_SECONDS, 0);
    const alive = world.state.boss !== null && world.state.player.hp > 0;
    return { screen: SCREEN_PLAY, best: world.state.score, reached: alive };
  }
  // win: play all twelve waves for real.
  const steps = Math.floor(WIN_LIMIT_SECONDS / STEP);
  for (let i = 0; i < steps; i += 1) {
    const acts = autopilot(world);
    const actions = {
      firing: acts.firing,
      aimX: acts.aim ? acts.aim.x : undefined,
      aimY: acts.aim ? acts.aim.y : undefined,
      flare: acts.flare,
      dash: acts.dash,
      pick: acts.pick >= 0 ? acts.pick : undefined,
    };
    const events = world.step(STEP, acts.move, actions, false);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score, reached: true };
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score, reached: false };
  }
  return { screen: SCREEN_PLAY, best: world.state.score, reached: false };
}
