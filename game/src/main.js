// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and win
// (dawn breaks), with a level-up card overlay inside play. Sounds are synthesised
// (audio.js) and start on the first gesture; M mutes.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|boss|win (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. window.__game exposes the live state for automated play-testing.

import { BEST_KEY, FIELD, HEARTS, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOSS, EVENT_EMBER, EVENT_FLARE, EVENT_GEM, EVENT_HIT,
  EVENT_LEVELUP, EVENT_OVER, EVENT_POWERUP, EVENT_SHOOT, EVENT_SLAY,
  EVENT_WAVE, EVENT_WIN,
} from './world.js';
import {
  ACTION_AUTOFIRE, ACTION_CONFIRM, ACTION_DASH, ACTION_FLARE, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PICK1, ACTION_PICK2, ACTION_PICK3, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.lightRadius(), 0, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__shotReached = scene.reached;
      window.__shotScore = world.state.score;
    }
  }
  requestAnimationFrame(paint);
}

/** Level-up card geometry, shared with render.js: three 300x210 cards, 26px gaps. */
function cardIndexAt(fieldX, fieldY) {
  const offer = world.state.offer;
  if (!offer) return -1;
  const cardW = 300;
  const cardH = 210;
  const gap = 26;
  const total = offer.length * cardW + (offer.length - 1) * gap;
  const x0 = (FIELD.width - total) / 2;
  const y0 = 220;
  for (let i = 0; i < offer.length; i += 1) {
    const x = x0 + i * (cardW + gap);
    if (fieldX >= x && fieldX <= x + cardW && fieldY >= y0 && fieldY <= y0 + cardH) return i;
  }
  return -1;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let muted = false;
  let autoFire = false;
  let time = 0;
  // One-shot presses taken once per frame: the menu handling reads them, and the first
  // simulation step of the frame reads the flare/dash pair, so a press is never lost
  // and never fires twice.
  let pendingFlare = false;
  let pendingDash = false;
  let pendingPick = -1;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    pendingFlare = false;
    pendingDash = false;
    pendingPick = -1;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startDrone();
    announce(`Playing. ${HEARTS} hearts. Survive 12 waves until dawn.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.stopDrone();
    if (won) {
      audio.win();
      announce(`Dawn breaks. You kept the light alive. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over on wave ${world.state.wave}. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function nearestEnemyAim() {
    const p = world.state.player;
    let bestEnemy = null;
    let bestD = Infinity;
    for (const enemy of world.state.enemies) {
      const d = (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestEnemy = enemy;
      }
    }
    if (bestEnemy) return { x: bestEnemy.x, y: bestEnemy.y };
    return { x: p.x + p.faceX * 200, y: p.y + p.faceY * 200 };
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_AUTOFIRE) {
      autoFire = !autoFire;
      announce(autoFire ? 'Auto-fire on.' : 'Auto-fire off.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_FLARE) pendingFlare = true;
    if (actions & ACTION_DASH) pendingDash = true;
    if (actions & ACTION_PICK1) pendingPick = 0;
    else if (actions & ACTION_PICK2) pendingPick = 1;
    else if (actions & ACTION_PICK3) pendingPick = 2;
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopDrone();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      audio.startDrone();
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, { firing: false }, true);
      return;
    }
    // A level-up freezes the fight: only the pick advances the world.
    if (world.state.phase === 'levelup') {
      const pick = pendingPick;
      pendingPick = -1;
      if (pick >= 0) {
        const events = world.step(STEP, { x: 0, y: 0 }, { pick }, false);
        if (events & EVENT_LEVELUP) {
          audio.levelup();
          announce('Blessing chosen.');
        }
      } else {
        world.step(STEP, { x: 0, y: 0 }, {}, false);
      }
      return;
    }
    const beforeEaten = world.state.embersEaten;
    const beforeGems = world.state.gemsEaten;
    const beforeSlain = world.state.slain;
    const beforeDash = world.state.player.dashCooldown;
    const beforeLevel = world.state.level;
    const flare = pendingFlare;
    const dash = pendingDash;
    pendingFlare = false;
    pendingDash = false;
    const mouse = input.mouse;
    const aim = mouse ? renderer.fieldFromScreen(mouse.x, mouse.y) : nearestEnemyAim();
    const firing = input.firing || autoFire;
    const events = world.step(STEP, input.vector(), {
      firing, aimX: aim.x, aimY: aim.y, flare, dash,
    }, false);
    if (events & EVENT_SHOOT) audio.shoot();
    if (world.state.slain > beforeSlain) audio.slay();
    if (world.state.embersEaten > beforeEaten) audio.ember(world.state.combo);
    if (world.state.gemsEaten > beforeGems) audio.gem();
    if (world.state.player.dashCooldown > beforeDash) audio.dash();
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.player.hp === 1 ? 'Hit. 1 heart left.' : `Hit. ${world.state.player.hp} hearts left.`);
    }
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_LEVELUP) {
      audio.levelup();
      announce(`Level ${world.state.level}! Choose a blessing: 1, 2 or 3.`);
    }
    if (events & EVENT_BOSS) {
      audio.boss();
      audio.startBossPulse();
      announce(`Wave ${world.state.wave}: the Gloom Herald rises!`);
    }
    if (events & EVENT_WAVE) {
      audio.waveClear(world.state.wave);
      audio.stopBossPulse();
      announce(`Wave ${world.state.wave} cleared. Calm before wave ${world.state.wave + 1}.`);
    }
    if (world.state.level > beforeLevel && !(events & EVENT_LEVELUP)) {
      // Level rose without the flag (offer already open): nothing to do.
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    handleActions(input.takeActions());
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.lightRadius(), time, muted, autoFire);
  }

  // Clicking a level-up card picks that blessing.
  canvas.addEventListener('pointerdown', (event) => {
    if (screen !== SCREEN_PLAY || world.state.phase !== 'levelup') return;
    const at = renderer.fieldFromScreen(event.clientX, event.clientY);
    const idx = cardIndexAt(at.x, at.y);
    if (idx >= 0) pendingPick = idx;
  });

  // Leaving the tab pauses a running game rather than letting shades close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopDrone();
      announce('Paused.');
    }
  });

  // A handle for automated play-testing: the live world and the current screen.
  window.__game = {
    get state() {
      return world.state;
    },
    get screen() {
      return screen;
    },
    world,
  };

  announce('Lumenfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
