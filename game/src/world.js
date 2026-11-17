// The game's rules and state, with no drawing and no browser in it: the lantern-wisp,
// its light-bolts, the drifting embers, star-gems and XP levels, the seven kinds of
// shade plus the Gloom Herald bosses, waves, flares, dashes, power-ups, the combo and
// the score. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, announcements) without the world knowing about screens.
// Nothing here allocates after createWorld returns, except the short-lived particle,
// floating-text and damage-number lists, which are capped.

import {
  BLESSINGS, BOSS, BOSS_EVERY, CALM_SECONDS, EMBER, ENEMY, ENEMY_SCALE, FIELD, GEM, HEARTS,
  LIGHT_MAX_LEVEL, PLAYER, POWERUP, UNLOCK, WAVE, WAVES_TO_WIN, xpForLevel,
} from './config.js';

export const KIND_DRIFTER = 0;
export const KIND_WEAVER = 1;
export const KIND_RUSHER = 2;
export const KIND_SPITTER = 3;
export const KIND_SPLITTER = 4;
export const KIND_BRUTE = 5;
export const KIND_MITE = 6;
export const KIND_BOSS = 7;

export const EVENT_HIT = 1;
export const EVENT_EMBER = 2;
export const EVENT_FLARE = 4;
export const EVENT_WAVE = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_POWERUP = 64;
export const EVENT_LEVELUP = 128;
export const EVENT_SHOOT = 256;
export const EVENT_SLAY = 512;
export const EVENT_BOSS = 1024;
export const EVENT_GEM = 2048;

const TWO_PI = Math.PI * 2;
const MAX_PARTICLES = 380;
const MAX_FLOATERS = 24;
const MAX_DMGNUMS = 40;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2,
    radius: PLAYER.radius, hp: PLAYER.hp, maxHp: PLAYER.hp,
    invulnerable: 0, dashTime: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    faceX: 0, faceY: -1, aimX: 0, aimY: -1,
    shieldTimer: 0, fireTimer: 0, muzzle: 0,
  };
  const bolts = [];
  const enemyBolts = [];
  const enemies = [];
  const embers = [];
  const gems = [];
  const powerups = [];
  const particles = [];
  const floaters = [];
  const dmgNums = [];
  const up = {
    damage: 0, rate: 0, multi: 0, speed: 0, magnet: 0,
    pierce: 0, crit: 0, heart: 0, flare: 0, light: 0,
  };
  const state = {
    player, bolts, enemyBolts, enemies, embers, gems, powerups, particles, floaters, dmgNums,
    up, score: 0, wave: 1, phase: 'wave', resumePhase: 'wave',
    calmTimer: 0, spawnLeft: 0, spawnTimer: 0, bannerTimer: 0,
    energy: PLAYER.energyStart, lightLevel: 0, embersEaten: 0,
    combo: 0, comboTimer: 0, prismTimer: 0, ambientTimer: POWERUP.ambientEvery,
    flareFlash: 0, shake: 0, elapsed: 0, slain: 0, gemsEaten: 0,
    xp: 0, xpNext: xpForLevel(1), level: 1, offer: null,
    boss: null, bossMaxHp: 0, kills: 0,
  };

  function lightRadius() {
    return PLAYER.lightRadius + PLAYER.lightPerLevel * state.lightLevel
      + up.light * 30 + (state.prismTimer > 0 ? POWERUP.lightBonus : 0);
  }

  function magnetRadius() {
    return GEM.magnetBase + GEM.magnetPerLevel * up.magnet;
  }

  function boltDamage() {
    return PLAYER.boltDamage * (1 + 0.35 * up.damage);
  }

  function fireInterval() {
    return 1 / (PLAYER.fireRate * (1 + 0.22 * up.rate));
  }

  function speed() {
    return PLAYER.speed * (1 + 0.12 * up.speed);
  }

  function spawnParticle(x, y, color, spd, life, size) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    const angle = random() * TWO_PI;
    const v = spd * (0.4 + random() * 0.8);
    particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life, maxLife: life, size: size * (0.7 + random() * 0.6), color,
    });
  }

  function burst(x, y, color, count, spd, life, size) {
    for (let i = 0; i < count; i += 1) spawnParticle(x, y, color, spd, life, size);
  }

  function floater(x, y, text, color) {
    if (floaters.length >= MAX_FLOATERS) floaters.shift();
    floaters.push({ x, y, text, color, life: 1.2, maxLife: 1.2 });
  }

  function dmgNum(x, y, text, color) {
    if (dmgNums.length >= MAX_DMGNUMS) dmgNums.shift();
    dmgNums.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  }

  function addEmber(x, y) {
    embers.push({
      x, y, radius: EMBER.radius,
      angle: random() * TWO_PI, turn: 0,
      phase: random() * TWO_PI, twinkle: 1.5 + random() * 2,
    });
  }

  function addGem(x, y, value) {
    gems.push({
      x, y, radius: GEM.radius, value, life: GEM.life,
      angle: random() * TWO_PI, speed: 60 + random() * 60,
    });
  }

  function edgePoint(margin) {
    const side = Math.floor(random() * 4);
    if (side === 0) return { x: random() * FIELD.width, y: -margin };
    if (side === 1) return { x: random() * FIELD.width, y: FIELD.height + margin };
    if (side === 2) return { x: -margin, y: random() * FIELD.height };
    return { x: FIELD.width + margin, y: random() * FIELD.height };
  }

  function pickKind(wave) {
    const kinds = ['drifter'];
    const weights = [ENEMY.drifter.weight];
    for (const [kind, atWave] of Object.entries(UNLOCK)) {
      if (wave >= atWave) {
        kinds.push(kind);
        weights.push(ENEMY[kind].weight);
      }
    }
    let total = 0;
    for (const w of weights) total += w;
    let roll = random() * total;
    for (let i = 0; i < kinds.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return kinds[i];
    }
    return 'drifter';
  }

  function makeEnemy(kindName, x, y) {
    const def = ENEMY[kindName];
    const wave = state.wave;
    const speedScale = Math.min(ENEMY_SCALE.speedCap, 1 + ENEMY_SCALE.speedPerWave * (wave - 1));
    const hpScale = 1 + ENEMY_SCALE.hpPerWave * (wave - 1);
    const elite = random() < 0.08 && kindName !== 'mite';
    const hp = Math.max(1, Math.round(def.hp * hpScale * (elite ? 3 : 1)));
    return {
      kind: kindName === 'drifter' ? KIND_DRIFTER
        : kindName === 'weaver' ? KIND_WEAVER
        : kindName === 'rusher' ? KIND_RUSHER
        : kindName === 'spitter' ? KIND_SPITTER
        : kindName === 'splitter' ? KIND_SPLITTER
        : kindName === 'brute' ? KIND_BRUTE : KIND_MITE,
      kindName,
      x, y, radius: def.radius * (elite ? 1.3 : 1),
      speed: def.speed * speedScale, hp, maxHp: hp,
      age: 0, phase: random() * TWO_PI, flash: 0,
      mode: 'stalk', timer: (def.dashEvery ?? 2.8) * (0.5 + random()),
      shotTimer: (def.shotEvery ?? 3) * (0.5 + random()),
      elite, score: def.score * (elite ? 2 : 1), xp: def.xp * (elite ? 3 : 1),
      vx: 0, vy: 0,
    };
  }

  function spawnEnemy() {
    const at = edgePoint(30);
    enemies.push(makeEnemy(pickKind(state.wave), at.x, at.y));
  }

  function spawnBoss() {
    const at = edgePoint(70);
    const hp = Math.round(BOSS.hp * (1 + 0.5 * (state.wave / BOSS_EVERY - 1)));
    const boss = {
      kind: KIND_BOSS, kindName: 'boss',
      x: at.x, y: at.y, radius: BOSS.radius,
      speed: BOSS.speed, hp, maxHp: hp,
      age: 0, phase: 0, flash: 0, mode: 'stalk',
      timer: 0, shotTimer: BOSS.burstEvery, summonTimer: BOSS.summonEvery,
      elite: false, score: BOSS.score, xp: BOSS.xp, vx: 0, vy: 0,
    };
    enemies.push(boss);
    state.boss = boss;
    state.bossMaxHp = hp;
    return boss;
  }

  function spawnPowerup(x, y, forceKind) {
    const kinds = ['prism', 'heart', 'nova', 'shield'];
    const kind = forceKind ?? kinds[Math.floor(random() * kinds.length)];
    powerups.push({ x, y, kind, radius: POWERUP.radius, phase: random() * TWO_PI, life: POWERUP.life });
  }

  function waveCount(wave) {
    return WAVE.baseCount + WAVE.perWave * (wave - 1);
  }

  function waveInterval(wave) {
    return Math.max(WAVE.minInterval, WAVE.interval * WAVE.intervalScale ** (wave - 1));
  }

  function isBossWave(wave) {
    return wave % 4 === 0;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'wave';
    state.bannerTimer = 2.6;
    state.spawnTimer = 0.9;
    if (isBossWave(wave)) {
      spawnBoss();
      state.spawnLeft = 4 + wave;
    } else {
      state.spawnLeft = waveCount(wave);
    }
  }

  function startCalm() {
    state.phase = 'calm';
    state.calmTimer = CALM_SECONDS;
    for (let i = 0; i < EMBER.calmBonus; i += 1) {
      addEmber(80 + random() * (FIELD.width - 160), 80 + random() * (FIELD.height - 160));
    }
  }

  function seedDemo() {
    for (let i = 0; i < 6; i += 1) spawnEnemy();
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.hp = PLAYER.hp;
    player.maxHp = PLAYER.hp;
    player.invulnerable = 0;
    player.dashTime = 0;
    player.dashCooldown = 0;
    player.shieldTimer = 0;
    player.fireTimer = 0;
    player.muzzle = 0;
    bolts.length = 0;
    enemyBolts.length = 0;
    enemies.length = 0;
    embers.length = 0;
    gems.length = 0;
    powerups.length = 0;
    particles.length = 0;
    floaters.length = 0;
    dmgNums.length = 0;
    for (const key of Object.keys(up)) up[key] = 0;
    state.score = 0;
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
    state.slain = 0;
    state.gemsEaten = 0;
    state.xp = 0;
    state.xpNext = xpForLevel(1);
    state.level = 1;
    state.offer = null;
    state.boss = null;
    state.bossMaxHp = 0;
    state.kills = 0;
    for (let i = 0; i < EMBER.targetCount; i += 1) {
      addEmber(80 + random() * (FIELD.width - 160), 80 + random() * (FIELD.height - 160));
    }
    startWave(1);
  }

  function rollOffer() {
    const available = BLESSINGS.filter((b) => up[b.id] < b.max);
    const pool = available.length > 0 ? available : BLESSINGS;
    const picked = [];
    const copy = pool.slice();
    while (picked.length < 3 && copy.length > 0) {
      const idx = Math.floor(random() * copy.length);
      picked.push(copy.splice(idx, 1)[0]);
    }
    return picked;
  }

  function applyBlessing(blessing) {
    up[blessing.id] += 1;
    if (blessing.id === 'heart') {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }
    if (blessing.id === 'light') state.energy = Math.min(100, state.energy + 20);
  }

  /** Choose blessing `index` (0-2) while a level-up is open. Returns true if applied. */
  function chooseUpgrade(index) {
    if (state.phase !== 'levelup' || !state.offer) return false;
    const blessing = state.offer[index];
    if (!blessing) return false;
    applyBlessing(blessing);
    floater(player.x, player.y - 52, blessing.name + '!', '#7ae0ff');
    burst(player.x, player.y, '#7ae0ff', 16, 180, 0.7, 4);
    state.offer = null;
    state.phase = state.resumePhase;
    return true;
  }

  function openLevelUp() {
    state.level += 1;
    state.xp -= state.xpNext;
    state.xpNext = xpForLevel(state.level);
    state.resumePhase = state.phase;
    state.phase = 'levelup';
    state.offer = rollOffer();
  }

  function flare() {
    if (state.energy < PLAYER.flareCost) return 0;
    state.energy -= PLAYER.flareCost;
    const radius = lightRadius() + 40;
    const dmg = 3 * (1 + 0.75 * up.flare);
    let slain = 0;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (d > radius + enemy.radius) continue;
      const kx = d > 1 ? (enemy.x - player.x) / d : 0;
      const ky = d > 1 ? (enemy.y - player.y) / d : 0;
      enemy.x += kx * 60;
      enemy.y += ky * 60;
      if (hurtEnemy(i, dmg, true)) slain += 1;
    }
    state.flareFlash = 0.45;
    state.shake = Math.max(state.shake, 8);
    burst(player.x, player.y, '#ffe9a8', 26, 320, 0.7, 5);
    if (slain > 0) floater(player.x, player.y - 64, `Flare! +${slain} shades`, '#ffe9a8');
    return slain;
  }

  /** Damage enemy at index; returns true if it died. `silent` skips the damage number. */
  function hurtEnemy(index, dmg, silent) {
    const enemy = enemies[index];
    const crit = random() < 0.12 * up.crit;
    const dealt = crit ? dmg * 2 : dmg;
    enemy.hp -= dealt;
    enemy.flash = 0.12;
    if (!silent) dmgNum(enemy.x, enemy.y - enemy.radius - 6, String(Math.round(dealt)), crit ? '#ffd94c' : '#ffffff');
    if (enemy.hp > 0) return false;
    const wasBoss = enemy.kind === KIND_BOSS;
    state.score += enemy.score;
    state.slain += 1;
    state.kills += 1;
    burst(enemy.x, enemy.y, wasBoss ? '#ff7aa8' : '#b9a7ff', wasBoss ? 40 : 12, wasBoss ? 320 : 170, 0.7, 5);
    floater(enemy.x, enemy.y - 18, `+${enemy.score}`, '#d9c8ff');
    addGem(enemy.x, enemy.y, enemy.xp);
    if (enemy.kindName === 'splitter') {
      for (let k = 0; k < 2; k += 1) {
        const mite = makeEnemy('mite', enemy.x + (k === 0 ? -14 : 14), enemy.y);
        enemies.push(mite);
      }
    }
    if (random() < POWERUP.dropChance) spawnPowerup(enemy.x, enemy.y);
    if (wasBoss) {
      state.boss = null;
      state.shake = Math.max(state.shake, 14);
      state.flareFlash = 0.5;
      floater(enemy.x, enemy.y - 70, 'HERALD FALLEN! +500', '#ff5d73');
      for (let k = 0; k < 5; k += 1) addGem(enemy.x + (random() - 0.5) * 90, enemy.y + (random() - 0.5) * 90, 3);
      spawnPowerup(enemy.x, enemy.y - 40, 'heart');
    }
    enemies.splice(index, 1);
    return true;
  }

  function hurtPlayer() {
    if (player.invulnerable > 0 || player.dashTime > 0) return false;
    if (player.shieldTimer > 0) {
      player.shieldTimer = 0;
      player.invulnerable = 1.0;
      floater(player.x, player.y - 52, 'Shield held!', '#8affc1');
      burst(player.x, player.y, '#8affc1', 14, 200, 0.6, 4);
      return false;
    }
    player.hp -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.max(state.shake, 10);
    burst(player.x, player.y, '#ff5d73', 18, 240, 0.7, 5);
    return true;
  }

  function fireBolts(aimX, aimY) {
    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const base = Math.atan2(dy, dx);
    const count = 1 + up.multi;
    const spread = 0.10;
    for (let k = 0; k < count; k += 1) {
      const offset = (k - (count - 1) / 2) * spread;
      const angle = base + offset;
      bolts.push({
        x: player.x + Math.cos(angle) * (player.radius + 8),
        y: player.y + Math.sin(angle) * (player.radius + 8),
        vx: Math.cos(angle) * PLAYER.boltSpeed,
        vy: Math.sin(angle) * PLAYER.boltSpeed,
        radius: PLAYER.boltRadius, dmg: boltDamage(),
        pierce: up.pierce, life: 1.1,
      });
    }
    player.muzzle = 0.06;
    player.faceX = Math.cos(base);
    player.faceY = Math.sin(base);
  }

  function stepFx(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (let i = dmgNums.length - 1; i >= 0; i -= 1) {
      const d = dmgNums[i];
      d.life -= dt;
      d.y -= 44 * dt;
      if (d.life <= 0) dmgNums.splice(i, 1);
    }
    state.flareFlash = Math.max(0, state.flareFlash - dt * 2.2);
    state.shake = Math.max(0, state.shake - dt * 26);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  }

  function stepEmbers(dt, harmless) {
    const light = lightRadius();
    const magnet = magnetRadius();
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
      const d2 = dist2(ember.x, ember.y, player.x, player.y);
      const d = Math.sqrt(d2);
      if (d < magnet && d > 1) {
        const pull = 260 * (1 - d / (magnet + 1)) + 60;
        vx += ((player.x - ember.x) / d) * pull;
        vy += ((player.y - ember.y) / d) * pull;
      } else if (d2 < light * light * 0.56 && d2 > 1) {
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

  function stepGems(dt) {
    const magnet = magnetRadius();
    for (let i = gems.length - 1; i >= 0; i -= 1) {
      const gem = gems[i];
      gem.life -= dt;
      if (gem.life <= 0) { gems.splice(i, 1); continue; }
      const d = Math.hypot(gem.x - player.x, gem.y - player.y) || 1;
      if (d < magnet) {
        const pull = 340 * (1 - d / (magnet + 1)) + 90;
        gem.x += ((player.x - gem.x) / d) * pull * dt;
        gem.y += ((player.y - gem.y) / d) * pull * dt;
      } else {
        gem.x += Math.cos(gem.angle) * gem.speed * dt * 0.3;
        gem.y += Math.sin(gem.angle) * gem.speed * dt * 0.3;
        gem.angle += dt * 0.4;
      }
      if (gem.x < 10) gem.x = 10;
      if (gem.x > FIELD.width - 10) gem.x = FIELD.width - 10;
      if (gem.y < 10) gem.y = 10;
      if (gem.y > FIELD.height - 10) gem.y = FIELD.height - 10;
      if (d < player.radius + gem.radius + 4) {
        gems.splice(i, 1);
        state.gemsEaten += 1;
        state.xp += gem.value;
        state.score += 5 * gem.value;
        burst(gem.x, gem.y, '#7ae0ff', 5, 110, 0.4, 3);
      }
    }
  }

  function stepPowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i -= 1) {
      const p = powerups[i];
      p.phase += dt * 2;
      p.life -= dt;
      if (p.life <= 0) { powerups.splice(i, 1); continue; }
      const rr = player.radius + p.radius;
      if (dist2(p.x, p.y, player.x, player.y) < rr * rr) {
        powerups.splice(i, 1);
        if (p.kind === 'heart') player.hp = Math.min(player.maxHp, player.hp + 1);
        if (p.kind === 'nova') state.energy = 100;
        if (p.kind === 'prism') state.prismTimer = POWERUP.prismSeconds;
        if (p.kind === 'shield') player.shieldTimer = 30;
        floater(p.x, p.y - 16, p.kind === 'heart' ? '+1 Heart' : p.kind === 'nova' ? 'Nova! Energy full' : p.kind === 'prism' ? 'Prism! Wider light' : 'Shield!', p.kind === 'heart' ? '#ff5d73' : p.kind === 'shield' ? '#8affc1' : '#7ae0ff');
        burst(p.x, p.y, '#7ae0ff', 10, 150, 0.6, 4);
      }
    }
  }

  function stepBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i -= 1) {
      const b = bolts[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          const e = enemies[j];
          const rr = b.radius + e.radius;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            const died = hurtEnemy(j, b.dmg, false);
            burst(b.x, b.y, '#ffe9a8', 4, 130, 0.3, 3);
            if (died) state.shake = Math.max(state.shake, 2);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) bolts.splice(i, 1);
    }
    for (let i = enemyBolts.length - 1; i >= 0; i -= 1) {
      const b = enemyBolts[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const rr = b.radius + player.radius;
      if (dist2(b.x, b.y, player.x, player.y) < rr * rr) {
        enemyBolts.splice(i, 1);
        hurtPlayer();
        continue;
      }
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        enemyBolts.splice(i, 1);
      }
    }
  }

  function stepEnemies(dt, harmless) {
    const light = lightRadius();
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      e.phase += dt;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      let vx = 0;
      let vy = 0;
      const hungry = e.age > 20;
      let spd = e.speed * (hungry ? 1.5 : 1);
      if (e.kind === KIND_BOSS) {
        spd = e.speed;
        e.shotTimer -= dt;
        e.summonTimer -= dt;
        if (e.shotTimer <= 0) {
          e.shotTimer = BOSS.burstEvery;
          for (let k = 0; k < BOSS.burstCount; k += 1) {
            const a = (k / BOSS.burstCount) * TWO_PI + e.phase * 0.3;
            enemyBolts.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * BOSS.orbSpeed, vy: Math.sin(a) * BOSS.orbSpeed,
              radius: 8, life: 6,
            });
          }
          burst(e.x, e.y, '#e06bff', 10, 200, 0.5, 4);
        }
        if (e.summonTimer <= 0) {
          e.summonTimer = BOSS.summonEvery;
          for (let k = 0; k < 2; k += 1) {
            enemies.push(makeEnemy(random() < 0.5 ? 'drifter' : 'weaver', e.x + (random() - 0.5) * 160, e.y + (random() - 0.5) * 160));
          }
          floater(e.x, e.y - 70, 'The Herald calls shades!', '#ff5d73');
        }
        vx = nx * spd;
        vy = ny * spd;
      } else if (e.kind === KIND_WEAVER) {
        const wob = Math.sin(e.phase * e.phase * 0 + e.phase * 2.4) * 78;
        const px = -ny;
        const py = nx;
        vx = nx * spd + px * wob * 0.01 * spd;
        vy = ny * spd + py * wob * 0.01 * spd;
      } else if (e.kind === KIND_RUSHER) {
        e.timer -= dt;
        if (e.mode === 'stalk') {
          vx = nx * spd;
          vy = ny * spd;
          if (e.timer <= 0 && d < 420) {
            e.mode = 'telegraph';
            e.timer = 0.5;
            e.vx = nx;
            e.vy = ny;
          }
        } else if (e.mode === 'telegraph') {
          vx = 0;
          vy = 0;
          if (e.timer <= 0) {
            e.mode = 'dash';
            e.timer = 0.45;
          }
        } else {
          vx = e.vx * 290;
          vy = e.vy * 290;
          if (e.timer <= 0) {
            e.mode = 'stalk';
            e.timer = 2.8 * (0.5 + random());
          }
        }
      } else if (e.kind === KIND_SPITTER) {
        e.shotTimer -= dt;
        if (d > 330) {
          vx = nx * spd;
          vy = ny * spd;
        } else if (d < 220) {
          vx = -nx * spd * 0.7;
          vy = -ny * spd * 0.7;
        }
        if (e.shotTimer <= 0 && d < 460) {
          e.shotTimer = 3.1;
          enemyBolts.push({
            x: e.x, y: e.y,
            vx: nx * 165, vy: ny * 165,
            radius: 7, life: 6,
          });
          burst(e.x, e.y, '#e06bff', 4, 100, 0.3, 3);
        }
      } else {
        // Drifter, splitter, brute, mite: straight chase, slowed a little inside the light.
        const slow = d < light ? 0.78 : 1;
        vx = nx * spd * slow;
        vy = ny * spd * slow;
      }
      // The glow shoves shades back a little when they get too close — but the shove is
      // weaker than their walk, so a shade always closes in eventually.
      if (d < 42 && e.kind !== KIND_BOSS) {
        vx -= nx * 26;
        vy -= ny * 26;
      }
      e.x += vx * dt;
      e.y += vy * dt;
      if (e.x < -60) e.x = -60;
      if (e.x > FIELD.width + 60) e.x = FIELD.width + 60;
      if (e.y < -60) e.y = -60;
      if (e.y > FIELD.height + 60) e.y = FIELD.height + 60;
      if (harmless) continue;
      const rr = e.radius + player.radius;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
        if (hurtPlayer()) {
          // A shade that lands a hit is knocked back so it cannot chain-hit instantly.
          e.x -= nx * 34;
          e.y -= ny * 34;
        }
      }
    }
  }

  function step(dt, move, actions, harmless) {
    let events = 0;
    state.elapsed += dt;
    stepFx(dt);
    // A level-up freezes the fight but the sparks keep falling.
    if (state.phase === 'levelup') {
      if (actions && typeof actions.pick === 'number') {
        if (chooseUpgrade(actions.pick)) events |= EVENT_LEVELUP;
      }
      stepEmbers(dt, true);
      return events;
    }
    // Movement.
    const mvx = move?.x ?? 0;
    const mvy = move?.y ?? 0;
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.shieldTimer = Math.max(0, player.shieldTimer - dt);
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);
    player.prismTimer = Math.max(0, state.prismTimer - dt);
    state.prismTimer = player.prismTimer;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer <= 0) state.combo = 0;
    state.ambientTimer -= dt;
    if (state.ambientTimer <= 0) {
      state.ambientTimer = POWERUP.ambientEvery;
      spawnPowerup(80 + random() * (FIELD.width - 160), 80 + random() * (FIELD.height - 160));
    }
    if (actions?.dash && player.dashCooldown <= 0 && (mvx !== 0 || mvy !== 0 || player.dashTime > 0)) {
      player.dashTime = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      const len = Math.hypot(mvx, mvy) || 1;
      player.dashX = mvx / len;
      player.dashY = mvy / len;
      if (mvx === 0 && mvy === 0) {
        player.dashX = player.faceX;
        player.dashY = player.faceY;
      }
      burst(player.x, player.y, '#ffe9a8', 8, 160, 0.4, 3);
    }
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.x += player.dashX * speed() * PLAYER.dashSpeed * dt;
      player.y += player.dashY * speed() * PLAYER.dashSpeed * dt;
    } else {
      player.x += mvx * speed() * dt;
      player.y += mvy * speed() * dt;
    }
    player.x = clamp(player.x, player.radius, FIELD.width - player.radius);
    player.y = clamp(player.y, player.radius, FIELD.height - player.radius);
    if (mvx !== 0 || mvy !== 0) {
      player.faceX = mvx / (Math.hypot(mvx, mvy) || 1);
      player.faceY = mvy / (Math.hypot(mvx, mvy) || 1);
    }
    if (actions?.aimX !== undefined && actions?.aimY !== undefined) {
      const ax = actions.aimX - player.x;
      const ay = actions.aimY - player.y;
      const al = Math.hypot(ax, ay);
      if (al > 1) {
        player.aimX = ax / al;
        player.aimY = ay / al;
      }
    }
    // Firing.
    if (!harmless && actions?.firing && player.fireTimer <= 0) {
      const aimX = actions.aimX !== undefined ? actions.aimX : player.x + player.aimX * 200;
      const aimY = actions.aimY !== undefined ? actions.aimY : player.y + player.aimY * 200;
      fireBolts(aimX, aimY);
      player.fireTimer = fireInterval();
      events |= EVENT_SHOOT;
    }
    // Flare.
    if (!harmless && actions?.flare && state.energy >= PLAYER.flareCost) {
      flare();
      events |= EVENT_FLARE;
    }
    stepEmbers(dt, harmless);
    if (!harmless) {
      stepGems(dt);
      stepPowerups(dt);
      stepBolts(dt);
      stepEnemies(dt, harmless);
      if (player.hp <= 0) {
        events |= EVENT_OVER;
        return events;
      }
      // Wave flow.
      if (state.phase === 'wave') {
        if (state.spawnLeft > 0) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            state.spawnTimer = waveInterval(state.wave);
            state.spawnLeft -= 1;
            spawnEnemy();
          }
        } else if (enemies.length === 0 && !state.boss) {
          if (state.wave >= WAVES_TO_WIN) {
            events |= EVENT_WIN;
            return events;
          }
          startCalm();
          events |= EVENT_WAVE;
        }
      } else if (state.phase === 'calm') {
        state.calmTimer -= dt;
        if (state.calmTimer <= 0) {
          const next = state.wave + 1;
          const wasBoss = isBossWave(next);
          startWave(next);
          if (wasBoss) events |= EVENT_BOSS;
          else events |= EVENT_WAVE;
        }
      }
      // Level-up check: open it once per level, after the wave flow settles.
      if (state.xp >= state.xpNext && state.phase !== 'levelup') {
        openLevelUp();
        events |= EVENT_LEVELUP;
      }
    }
    return events;
  }

  return {
    state,
    reset,
    seedDemo,
    step,
    lightRadius,
    magnetRadius,
    chooseUpgrade,
    applyBlessing,
    /** Stage a boss fight for a screenshot: fresh world, level 4, boss + minions. */
    stageBossScene() {
      reset();
      state.level = 4;
      state.xpNext = xpForLevel(4);
      up.damage = 2;
      up.rate = 1;
      up.multi = 1;
      up.magnet = 1;
      state.score = 2450;
      state.slain = 61;
      state.wave = 4;
      state.phase = 'wave';
      state.spawnLeft = 6;
      state.spawnTimer = 1;
      spawnBoss();
      for (let i = 0; i < 5; i += 1) spawnEnemy();
      for (let i = 0; i < 6; i += 1) addGem(200 + random() * 800, 150 + random() * 420, 2);
      state.bannerTimer = 1.4;
    },
    /** Grant `n` random blessings (used to stage late-game screenshots). */
    grantBlessings(n) {
      for (let i = 0; i < n; i += 1) {
        const available = BLESSINGS.filter((b) => up[b.id] < b.max);
        if (available.length === 0) break;
        applyBlessing(available[Math.floor(random() * available.length)]);
      }
    },
  };
}
