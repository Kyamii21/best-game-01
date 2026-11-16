// The game's rules and state, with no drawing and no browser in it: the lantern-wisp, its
// light, the drifting embers, the three kinds of shade, waves, flares, power-ups, the combo
// and the score. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, announcements) without the world knowing about screens.
// Nothing here allocates after createWorld returns, except the short-lived particle and
// floating-text lists, which are capped.

import { CALM_SECONDS, EMBER, FIELD, HEARTS, LIGHT_MAX_LEVEL, PLAYER, POWERUP, SHADE, WAVE, WAVES_TO_WIN } from './config.js';

export const KIND_DRIFTER = 0;
export const KIND_WEAVER = 1;
export const KIND_RUSHER = 2;

export const EVENT_HIT = 1;
export const EVENT_EMBER = 2;
export const EVENT_FLARE = 4;
export const EVENT_WAVE = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_POWERUP = 64;

const TWO_PI = Math.PI * 2;
const MAX_PARTICLES = 320;
const MAX_FLOATERS = 24;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2,
    radius: PLAYER.radius, invulnerable: 0,
    dashTime: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    faceX: 0, faceY: -1,
  };
  const embers = [];
  const shades = [];
  const powerups = [];
  const particles = [];
  const floaters = [];
  const state = {
    player, embers, shades, powerups, particles, floaters,
    score: 0, hearts: HEARTS, wave: 1, phase: 'wave',
    calmTimer: 0, spawnLeft: 0, spawnTimer: 0,
    energy: PLAYER.energyStart, lightLevel: 0, embersEaten: 0,
    combo: 0, comboTimer: 0, prismTimer: 0, ambientTimer: POWERUP.ambientEvery,
    flareFlash: 0, shake: 0, elapsed: 0, shadesSlain: 0,
  };

  function lightRadius() {
    return PLAYER.lightRadius + PLAYER.lightPerLevel * state.lightLevel
      + (state.prismTimer > 0 ? POWERUP.lightBonus : 0);
  }

  function spawnParticle(x, y, color, speed, life, size) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    const angle = random() * TWO_PI;
    const v = speed * (0.4 + random() * 0.8);
    particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life, maxLife: life, size: size * (0.7 + random() * 0.6), color,
    });
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) spawnParticle(x, y, color, speed, life, size);
  }

  function floater(x, y, text, color) {
    if (floaters.length >= MAX_FLOATERS) floaters.shift();
    floaters.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
  }

  function addEmber(x, y) {
    embers.push({
      x, y, radius: EMBER.radius,
      angle: random() * TWO_PI, turn: 0,
      phase: random() * TWO_PI, twinkle: 1.5 + random() * 2,
    });
  }

  function edgePoint(margin) {
    const side = Math.floor(random() * 4);
    if (side === 0) return { x: random() * FIELD.width, y: -margin };
    if (side === 1) return { x: random() * FIELD.width, y: FIELD.height + margin };
    if (side === 2) return { x: -margin, y: random() * FIELD.height };
    return { x: FIELD.width + margin, y: random() * FIELD.height };
  }

  function pickShadeKind(wave) {
    const weights = [
      ['drifter', SHADE.drifter.weight],
      ['weaver', wave >= 2 ? SHADE.weaver.weight : 0],
      ['rusher', wave >= 3 ? SHADE.rusher.weight : 0],
    ];
    let total = 0;
    for (const [, w] of weights) total += w;
    let roll = random() * total;
    for (const [kind, w] of weights) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return 'drifter';
  }

  function spawnShade() {
    const kind = pickShadeKind(state.wave);
    const def = SHADE[kind];
    const at = edgePoint(30);
    const speedScale = Math.min(SHADE.speedCap, 1 + SHADE.speedPerWave * (state.wave - 1) / 100);
    shades.push({
      kind: kind === 'drifter' ? KIND_DRIFTER : kind === 'weaver' ? KIND_WEAVER : KIND_RUSHER,
      x: at.x, y: at.y, radius: def.radius,
      speed: def.speed * speedScale,
      age: 0,
      phase: random() * TWO_PI,
      mode: 'stalk', timer: SHADE.rusher.dashEvery * (0.5 + random()),
      aimX: 0, aimY: 0, flash: 0,
    });
  }

  function spawnPowerup(x, y, forceKind) {
    const kinds = ['prism', 'heart', 'nova'];
    const kind = forceKind ?? kinds[Math.floor(random() * kinds.length)];
    powerups.push({ x, y, kind, radius: POWERUP.radius, phase: random() * TWO_PI, life: 12 });
  }

  function waveCount(wave) {
    return WAVE.baseCount + WAVE.perWave * (wave - 1);
  }

  function waveInterval(wave) {
    return Math.max(WAVE.minInterval, WAVE.interval * WAVE.intervalScale ** (wave - 1));
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'wave';
    state.spawnLeft = waveCount(wave);
    state.spawnTimer = 0.8;
  }

  function startCalm() {
    state.phase = 'calm';
    state.calmTimer = CALM_SECONDS;
    for (let i = 0; i < EMBER.calmBonus; i += 1) {
      addEmber(80 + random() * (FIELD.width - 160), 80 + random() * (FIELD.height - 160));
    }
  }

  function seedDemo() {
    // A few shades drifting in the dark behind the title screen: the cavern feels alive
    // before the first game starts.
    for (let i = 0; i < 5; i += 1) spawnShade();
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.invulnerable = 0;
    player.dashTime = 0;
    player.dashCooldown = 0;
    embers.length = 0;
    shades.length = 0;
    powerups.length = 0;
    particles.length = 0;
    floaters.length = 0;
    state.score = 0;
    state.hearts = HEARTS;
    state.energy = PLAYER.energyStart;
    state.lightLevel = 0;
    state.embersEaten = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.prismTimer = 0;
    state.ambientTimer = POWERUP.ambientEvery;
    state.flareFlash = 0;
    state.shake = 0;
    state.elapsed = 0;
    state.shadesSlain = 0;
    for (let i = 0; i < EMBER.targetCount; i += 1) {
      addEmber(80 + random() * (FIELD.width - 160), 80 + random() * (FIELD.height - 160));
    }
    startWave(1);
  }

  /** A flare: burns energy to turn every shade inside the light into embers. */
  function flare() {
    if (state.energy < PLAYER.flareCost) return 0;
    state.energy -= PLAYER.flareCost;
    const radius = lightRadius() + 40;
    let slain = 0;
    for (let i = shades.length - 1; i >= 0; i -= 1) {
      const shade = shades[i];
      if (dist2(shade.x, shade.y, player.x, player.y) > radius * radius) continue;
      const def = shade.kind === KIND_DRIFTER ? SHADE.drifter : shade.kind === KIND_WEAVER ? SHADE.weaver : SHADE.rusher;
      state.score += def.score;
      state.shadesSlain += 1;
      slain += 1;
      burst(shade.x, shade.y, '#b9a7ff', 10, 150, 0.6, 4);
      addEmber(shade.x, shade.y);
      if (random() < POWERUP.dropChance) spawnPowerup(shade.x, shade.y);
      shades.splice(i, 1);
    }
    state.flareFlash = 0.4;
    state.shake = Math.max(state.shake, 7);
    if (slain > 0) floater(player.x, player.y - 64, `Flare! +${slain} shades`, '#ffe9a8');
    return slain;
  }

  function stepEmbers(dt, harmless) {
    const light = lightRadius();
    for (let i = embers.length - 1; i >= 0; i -= 1) {
      const ember = embers[i];
      ember.phase += dt * ember.twinkle;
      ember.turn -= dt;
      if (ember.turn <= 0) {
        ember.angle += (random() - 0.5) * 1.6;
        ember.turn = 0.6 + random() * 1.2;
      }
      let vx = Math.cos(ember.angle) * EMBER.drift;
      let vy = Math.sin(ember.angle) * EMBER.drift;
      // Embers caught in the light drift gently toward the wisp: the glow gathers them.
      const d2 = dist2(ember.x, ember.y, player.x, player.y);
      if (d2 < light * light * 0.56 && d2 > 1) {
        const d = Math.sqrt(d2);
        const pull = 55 * (1 - d / light);
        vx += ((player.x - ember.x) / d) * pull;
        vy += ((player.y - ember.y) / d) * pull;
      }
      ember.x += vx * dt;
      ember.y += vy * dt;
      if (ember.x < 12) { ember.x = 12; ember.angle = Math.PI - ember.angle; }
      if (ember.x > FIELD.width - 12) { ember.x = FIELD.width - 12; ember.angle = Math.PI - ember.angle; }
      if (ember.y < 12) { ember.y = 12; ember.angle = -ember.angle; }
      if (ember.y > FIELD.height - 12) { ember.y = FIELD.height - 12; ember.angle = -ember.angle; }
      if (harmless) continue;
      const rr = player.radius + ember.radius;
      if (d2 < rr * rr) {
        embers.splice(i, 1);
        state.embersEaten += 1;
        state.combo = state.comboTimer > 0 ? Math.min(state.combo + 1, EMBER.comboMax) : 1;
        state.comboTimer = EMBER.comboWindow;
        const gained = EMBER.points * state.combo;
        state.score += gained;
        state.energy = Math.min(100, state.energy + PLAYER.energyPerEmber);
        state.lightLevel = Math.min(LIGHT_MAX_LEVEL, Math.floor(state.embersEaten / 10));
        burst(ember.x, ember.y, '#ffcf5e', 8, 120, 0.5, 3.5);
        floater(ember.x, ember.y - 14, `+${gained}`, '#ffe9a8');
      }
    }
    if (!harmless) {
      const target = state.phase === 'calm' ? EMBER.targetCount + EMBER.calmBonus : EMBER.targetCount;
      while (embers.length < target) {
        addEmber(60 + random() * (FIELD.width - 120), 60 + random() * (FIELD.height - 120));
      }
    }
  }

  function stepShades(dt, harmless) {
    const light = lightRadius();
    for (let i = shades.length - 1; i >= 0; i -= 1) {
      const shade = shades[i];
      shade.phase += dt;
      shade.age += dt;
      shade.flash = Math.max(0, shade.flash - dt);
      const dx = player.x - shade.x;
      const dy = player.y - shade.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      // A hungry shade is faster and no longer slowed by the light: no wave can stall.
      const hungry = shade.age > SHADE.hungerSeconds;
      let speed = shade.speed * (hungry ? SHADE.hungerSpeed : 1);
      let mx = ux;
      let my = uy;
      if (shade.kind === KIND_WEAVER) {
        const wob = Math.sin(shade.phase * SHADE.weaver.wobble) * SHADE.weaver.wobbleAmp;
        mx = ux + -uy * (wob / 140);
        my = uy + ux * (wob / 140);
        const len = Math.hypot(mx, my) || 1;
        mx /= len;
        my /= len;
      } else if (shade.kind === KIND_RUSHER) {
        shade.timer -= dt;
        if (shade.mode === 'stalk') {
          speed = shade.speed * 0.8;
          if (shade.timer <= 0) {
            shade.mode = 'telegraph';
            shade.timer = SHADE.rusher.telegraph;
            shade.aimX = ux;
            shade.aimY = uy;
            shade.flash = SHADE.rusher.telegraph;
          }
        } else if (shade.mode === 'telegraph') {
          speed = 0;
          if (shade.timer <= 0) {
            shade.mode = 'dash';
            shade.timer = 0.45;
          }
        } else {
          mx = shade.aimX;
          my = shade.aimY;
          speed = SHADE.rusher.dashSpeed;
          if (shade.timer <= 0) {
            shade.mode = 'stalk';
            shade.timer = SHADE.rusher.dashEvery * (0.7 + random() * 0.6);
          }
        }
      }
      // The light slows shades inside the glow and shoves back the closest ones — but the
      // shove is weaker than their walk (and a dash ignores it), so a shade always closes in.
      if (d < light && !hungry && shade.mode !== 'dash') speed *= SHADE.lightSlow;
      if (d < SHADE.repelRadius && d > 1) {
        shade.x -= ux * SHADE.repelForce * dt;
        shade.y -= uy * SHADE.repelForce * dt;
      }
      shade.x += mx * speed * dt;
      shade.y += my * speed * dt;
      if (harmless) continue;
      const rr = player.radius + shade.radius - 4;
      if (d < rr && player.invulnerable === 0) {
        state.hearts -= 1;
        state.combo = 0;
        state.comboTimer = 0;
        player.invulnerable = PLAYER.invulnerable;
        state.shake = Math.max(state.shake, 10);
        burst(player.x, player.y, '#ff5d73', 16, 220, 0.7, 5);
        // The shade is knocked away, not destroyed: the hit costs a heart, not a kill.
        shade.x -= ux * 70;
        shade.y -= uy * 70;
        if (state.hearts <= 0) return EVENT_OVER;
        return EVENT_HIT;
      }
    }
    return 0;
  }

  function stepPowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i -= 1) {
      const p = powerups[i];
      p.phase += dt;
      p.life -= dt;
      if (p.life <= 0) {
        powerups.splice(i, 1);
        continue;
      }
      const rr = player.radius + p.radius;
      if (dist2(p.x, p.y, player.x, player.y) < rr * rr) {
        powerups.splice(i, 1);
        if (p.kind === 'heart') {
          if (state.hearts < HEARTS) state.hearts += 1;
          else state.score += 250;
          floater(p.x, p.y - 16, state.hearts < HEARTS ? '+1 heart' : '+250', '#ff8fa3');
        } else if (p.kind === 'prism') {
          state.prismTimer = POWERUP.prismSeconds;
          floater(p.x, p.y - 16, 'Prism! Wider light', '#7ae0ff');
        } else {
          state.energy = 100;
          floater(p.x, p.y - 16, 'Nova! Full energy', '#c9a7ff');
        }
        burst(p.x, p.y, '#ffffff', 12, 160, 0.6, 4);
        return EVENT_POWERUP;
      }
    }
    return 0;
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  /**
   * One fixed step. `move` is the normalised steering vector, `acts` holds the one-shot
   * flags { flare, dash }. With `harmless` set (the title screen's backdrop) things drift
   * but nothing scores, nothing hurts and no wave runs.
   */
  function step(dt, move, acts, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.flareFlash > 0) state.flareFlash = Math.max(0, state.flareFlash - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.prismTimer > 0) state.prismTimer -= dt;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    // Steering: dash bursts in the steered (or faced) direction.
    if (!harmless && acts.dash && player.dashCooldown <= 0) {
      player.dashTime = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      const dx = move.x !== 0 || move.y !== 0 ? move.x : player.faceX;
      const dy = move.x !== 0 || move.y !== 0 ? move.y : player.faceY;
      const len = Math.hypot(dx, dy) || 1;
      player.dashX = dx / len;
      player.dashY = dy / len;
      burst(player.x, player.y, '#ffe9a8', 6, 90, 0.35, 3);
    }
    let speed = PLAYER.speed;
    let mx = move.x;
    let my = move.y;
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      speed = PLAYER.speed * PLAYER.dashSpeed;
      mx = player.dashX;
      my = player.dashY;
    }
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + mx * speed * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + my * speed * dt));
    if (move.x !== 0 || move.y !== 0) {
      player.faceX = move.x;
      player.faceY = move.y;
    }

    if (!harmless && acts.flare) {
      const slain = flare();
      if (slain > 0) events |= EVENT_FLARE;
      else if (state.energy < PLAYER.flareCost) floater(player.x, player.y - 44, 'Not enough energy', '#9aa3c0');
    }

    stepEmbers(dt, harmless);

    if (!harmless) {
      if (state.phase === 'wave') {
        state.spawnTimer -= dt;
        if (state.spawnLeft > 0 && state.spawnTimer <= 0) {
          spawnShade();
          state.spawnLeft -= 1;
          state.spawnTimer += waveInterval(state.wave);
        } else if (state.spawnLeft === 0 && shades.length === 0) {
          if (state.wave >= WAVES_TO_WIN) {
            state.score += 500 + state.hearts * 250;
            return EVENT_WIN;
          }
          state.score += 100 * state.wave;
          events |= EVENT_WAVE;
          startCalm();
        }
      } else {
        state.calmTimer -= dt;
        if (state.calmTimer <= 0) startWave(state.wave + 1);
      }
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        state.ambientTimer += POWERUP.ambientEvery;
        const at = edgePoint(40);
        spawnPowerup(Math.min(FIELD.width - 40, Math.max(40, at.x)), Math.min(FIELD.height - 40, Math.max(40, at.y)));
      }
      events |= stepPowerups(dt);
      const hit = stepShades(dt, false);
      if (hit & EVENT_OVER) return events | EVENT_OVER;
      if (hit & EVENT_HIT) events |= EVENT_HIT;
    } else {
      stepShades(dt, true);
    }

    stepParticles(dt);
    return events;
  }

  reset();
  return { state, reset, step, flare, lightRadius, seedDemo };
}
