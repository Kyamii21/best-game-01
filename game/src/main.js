// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, game over and win (dawn breaks).
// Sounds are synthesised (audio.js) and start on the first gesture; M mutes.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|flare|win|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for
// a screenshot. window.__game exposes the live state for automated play-testing.
import { BEST_KEY, HEARTS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_POWERUP, EVENT_WAVE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_FLARE, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
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
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let muted = false;
  let time = 0;
  // One-shot presses taken once per frame: the menu handling reads them, and the first
  // simulation step of the frame reads the flare/dash pair, so a press is never lost
  // and never fires twice.
  let pendingFlare = false;
  let pendingDash = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    // The very press that starts the game must not also spend a flare or a dash.
    pendingFlare = false;
    pendingDash = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startDrone();
    announce(`Playing. ${HEARTS} hearts. Survive 8 waves until dawn.`);
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

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_FLARE) pendingFlare = true;
    if (actions & ACTION_DASH) pendingDash = true;
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
      world.step(STEP, { x: 0, y: 0 }, { flare: false, dash: false }, true);
      return;
    }
    const beforeEaten = world.state.embersEaten;
    const beforeSlain = world.state.shadesSlain;
    const beforeDash = world.state.player.dashCooldown;
    const flare = pendingFlare;
    const dash = pendingDash;
    pendingFlare = false;
    pendingDash = false;
    const events = world.step(STEP, input.vector(), { flare, dash }, false);
    if (world.state.embersEaten > beforeEaten) audio.ember(world.state.combo);
    if (world.state.shadesSlain > beforeSlain) audio.flare(world.state.shadesSlain - beforeSlain);
    if (world.state.player.dashCooldown > beforeDash) audio.dash();
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.hearts === 1 ? 'Hit. 1 heart left.' : `Hit. ${world.state.hearts} hearts left.`);
    }
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_WAVE) {
      audio.waveClear(world.state.wave);
      announce(`Wave ${world.state.wave} cleared. Calm before wave ${world.state.wave + 1}.`);
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
    renderer.draw(world.state, screen, best, world.lightRadius(), time, muted);
  }

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

  announce('Glowkeeper. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
