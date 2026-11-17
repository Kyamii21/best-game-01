// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The cavern is drawn dim — gradient floor, glowing crystals, rune circles —
// then a darkness layer is punched with the wisp's light, so the game reads as a little
// lantern in a big dark cave. Text that holds a number is rebuilt only when the number
// changes, so a frame allocates nothing.

import { FIELD, FONT, HEARTS, PALETTE, PLAYER } from './config.js';
import { KIND_BOSS, KIND_BRUTE, KIND_MITE, KIND_RUSHER, KIND_SPITTER, KIND_SPLITTER, KIND_WEAVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 820, top: 140, line: 34, bottom: 80 };

/** Deterministic decor for the cavern floor: a hash of the index, no RNG needed. */
function hashAt(i, a, b) {
  const h = Math.sin(i * a + b) * 43758.5453;
  return h - Math.floor(h);
}
const ROCKS = [];
for (let i = 0; i < 26; i += 1) {
  ROCKS.push({
    x: 30 + hashAt(i, 127.1, 311.7) * (FIELD.width - 60),
    y: 60 + hashAt(i, 269.5, 183.3) * (FIELD.height - 120),
    r: 14 + hashAt(i, 91.7, 77.1) * 46,
  });
}
const CRYSTALS = [];
for (let i = 0; i < 12; i += 1) {
  CRYSTALS.push({
    x: 50 + hashAt(i, 57.3, 401.2) * (FIELD.width - 100),
    y: 70 + hashAt(i, 173.9, 55.5) * (FIELD.height - 140),
    h: 18 + hashAt(i, 211.1, 19.9) * 34,
    lean: (hashAt(i, 311.7, 231.1) - 0.5) * 0.7,
  });
}
const RUNES = [];
for (let i = 0; i < 5; i += 1) {
  RUNES.push({
    x: 160 + hashAt(i, 83.3, 97.7) * (FIELD.width - 320),
    y: 130 + hashAt(i, 149.1, 301.3) * (FIELD.height - 260),
    r: 46 + hashAt(i, 67.7, 141.1) * 40,
  });
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const bestLabel = cachedLabel('Best ');
  const finalLabel = cachedLabel('Score ');
  const comboLabel = cachedLabel('Combo x');
  const levelLabel = cachedLabel('Lv ');
  const killsLabel = cachedLabel('Shades slain ');

  const dark = document.createElement('canvas');
  dark.width = FIELD.width;
  dark.height = FIELD.height;
  const darkCtx = dark.getContext('2d');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Convert screen pixels (e.g. mouse) to field coordinates. */
  function fieldFromScreen(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    return {
      x: ((sx - rect.left) * ratio - view.x) / view.scale,
      y: ((sy - rect.top) * ratio - view.y) / view.scale,
    };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function glowCircle(x, y, r, color, alpha) {
    const g = context.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = alpha;
    context.fillStyle = g;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawBackground(time) {
    const g = context.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, '#0d1229');
    g.addColorStop(0.55, '#1a2347');
    g.addColorStop(1, '#121a38');
    context.fillStyle = g;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Rune circles glow faintly on the floor.
    for (const rune of RUNES) {
      context.strokeStyle = PALETTE.rune;
      context.globalAlpha = 0.9;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(rune.x, rune.y, rune.r, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(rune.x, rune.y, rune.r * 0.62, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    // Rocks.
    for (const rock of ROCKS) {
      context.fillStyle = '#2c3766';
      context.beginPath();
      context.ellipse(rock.x, rock.y, rock.r, rock.r * 0.62, 0.4, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.rockEdge;
      context.lineWidth = 2;
      context.stroke();
    }
    // Crystals pulse gently.
    for (const c of CRYSTALS) {
      const pulse = 0.55 + 0.3 * Math.sin(time * 1.4 + c.x * 0.01);
      context.globalAlpha = pulse;
      context.fillStyle = PALETTE.crystalDim;
      context.beginPath();
      context.moveTo(c.x - 9, c.y);
      context.lineTo(c.x + c.lean * c.h, c.y - c.h);
      context.lineTo(c.x + 9, c.y);
      context.closePath();
      context.fill();
      context.globalAlpha = pulse * 0.8;
      context.fillStyle = PALETTE.crystal;
      context.beginPath();
      context.moveTo(c.x - 3.5, c.y);
      context.lineTo(c.x + c.lean * c.h, c.y - c.h);
      context.lineTo(c.x + 3.5, c.y);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawDarkness(state, light) {
    darkCtx.clearRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.fillStyle = 'rgba(3, 5, 12, 0.58)';
    darkCtx.fillRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.globalCompositeOperation = 'destination-out';
    const p = state.player;
    const g = darkCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, light);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    darkCtx.fillStyle = g;
    darkCtx.beginPath();
    darkCtx.arc(p.x, p.y, light, 0, Math.PI * 2);
    darkCtx.fill();
    // Embers and gems glow through the dark a little.
    for (const ember of state.embers) {
      const eg = darkCtx.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 34);
      eg.addColorStop(0, 'rgba(0,0,0,0.7)');
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      darkCtx.fillStyle = eg;
      darkCtx.beginPath();
      darkCtx.arc(ember.x, ember.y, 34, 0, Math.PI * 2);
      darkCtx.fill();
    }
    for (const gem of state.gems) {
      const gg = darkCtx.createRadialGradient(gem.x, gem.y, 0, gem.x, gem.y, 26);
      gg.addColorStop(0, 'rgba(0,0,0,0.55)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      darkCtx.fillStyle = gg;
      darkCtx.beginPath();
      darkCtx.arc(gem.x, gem.y, 26, 0, Math.PI * 2);
      darkCtx.fill();
    }
    darkCtx.globalCompositeOperation = 'source-over';
    context.drawImage(dark, 0, 0);
  }

  function drawEmbers(state, time) {
    for (const ember of state.embers) {
      const tw = 0.75 + 0.25 * Math.sin(ember.phase);
      glowCircle(ember.x, ember.y, 26, 'rgba(255,179,71,0.5)', tw * 0.7);
      context.fillStyle = PALETTE.ember;
      context.beginPath();
      context.arc(ember.x, ember.y, ember.radius * tw, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.emberCore;
      context.beginPath();
      context.arc(ember.x, ember.y, ember.radius * 0.45 * tw, 0, Math.PI * 2);
      context.fill();
    }
    for (const gem of state.gems) {
      const blink = gem.life < 5 ? (Math.sin(time * 10) > 0 ? 1 : 0.35) : 1;
      context.globalAlpha = blink;
      glowCircle(gem.x, gem.y, 22, 'rgba(122,224,255,0.55)', 0.8);
      context.save();
      context.translate(gem.x, gem.y);
      context.rotate(time * 1.5 + gem.angle);
      context.fillStyle = PALETTE.gem;
      context.beginPath();
      context.moveTo(0, -gem.radius - 3);
      context.lineTo(gem.radius, 0);
      context.lineTo(0, gem.radius + 3);
      context.lineTo(-gem.radius, 0);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.gemCore;
      context.beginPath();
      context.moveTo(0, -4);
      context.lineTo(4, 0);
      context.lineTo(0, 4);
      context.lineTo(-4, 0);
      context.closePath();
      context.fill();
      context.restore();
      context.globalAlpha = 1;
    }
  }

  function drawPowerups(state) {
    for (const p of state.powerups) {
      const bob = Math.sin(p.phase) * 3;
      const y = p.y + bob;
      const color = p.kind === 'heart' ? PALETTE.heart : p.kind === 'nova' ? PALETTE.nova : p.kind === 'shield' ? PALETTE.shield : PALETTE.prism;
      glowCircle(p.x, y, 30, color, 0.5);
      context.fillStyle = '#0d1329';
      context.strokeStyle = color;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(p.x, y, p.radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = color;
      context.font = `bold 17px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const glyph = p.kind === 'heart' ? '♥' : p.kind === 'nova' ? '☀' : p.kind === 'shield' ? '⬡' : '◆';
      context.fillText(glyph, p.x, y + 1);
    }
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    const body = flash ? '#ffffff' : e.kind === KIND_BOSS ? PALETTE.boss
      : e.kind === KIND_SPITTER ? PALETTE.spitter
      : e.kind === KIND_BRUTE ? PALETTE.brute : PALETTE.shade;
    const core = e.kind === KIND_BOSS ? PALETTE.bossCore : PALETTE.shadeCore;
    // Shadow glow under the shade.
    glowCircle(e.x, e.y, e.radius * 2.2, 'rgba(113,92,176,0.55)', 1);
    context.save();
    context.translate(e.x, e.y);
    if (e.kind === KIND_RUSHER && e.mode === 'telegraph') {
      context.rotate(Math.sin(time * 30) * 0.08);
      context.strokeStyle = PALETTE.danger;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
      context.stroke();
    }
    if (e.kind === KIND_BOSS) {
      // Crown of spikes.
      context.fillStyle = PALETTE.gold;
      for (let k = 0; k < 7; k += 1) {
        const a = (k / 7) * Math.PI * 2 + time * 0.2;
        context.beginPath();
        context.moveTo(Math.cos(a) * e.radius * 0.8, Math.sin(a) * e.radius * 0.8);
        context.lineTo(Math.cos(a) * (e.radius + 18), Math.sin(a) * (e.radius + 18));
        context.lineTo(Math.cos(a + 0.3) * e.radius * 0.8, Math.sin(a + 0.3) * e.radius * 0.8);
        context.closePath();
        context.fill();
      }
    }
    context.fillStyle = body;
    context.beginPath();
    if (e.kind === KIND_WEAVER) {
      context.moveTo(0, -e.radius - 4);
      context.lineTo(e.radius, 0);
      context.lineTo(0, e.radius + 4);
      context.lineTo(-e.radius, 0);
      context.closePath();
    } else if (e.kind === KIND_RUSHER) {
      const a = Math.atan2(e.vy || 0.001, e.vx || 0.001);
      context.rotate(a);
      context.moveTo(e.radius + 6, 0);
      context.lineTo(-e.radius, e.radius * 0.8);
      context.lineTo(-e.radius * 0.5, 0);
      context.lineTo(-e.radius, -e.radius * 0.8);
      context.closePath();
    } else if (e.kind === KIND_SPLITTER) {
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (k === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
    } else if (e.kind === KIND_SPITTER) {
      context.rect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
    } else {
      context.arc(0, 0, e.radius, 0, Math.PI * 2);
    }
    context.fill();
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
    context.fill();
    // Eyes: they track the player.
    const ex = e.radius * 0.32;
    const ey = -e.radius * 0.18;
    context.fillStyle = e.kind === KIND_BOSS ? '#ffd94c' : PALETTE.shadeEye;
    context.beginPath();
    context.arc(-ex, ey, e.kind === KIND_BOSS ? 6 : 3.4, 0, Math.PI * 2);
    context.arc(ex, ey, e.kind === KIND_BOSS ? 6 : 3.4, 0, Math.PI * 2);
    context.fill();
    if (e.kind === KIND_BOSS) {
      // Grinning maw.
      context.strokeStyle = '#ffd94c';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, e.radius * 0.25, e.radius * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
      context.stroke();
    }
    if (e.elite) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, e.radius + 5, 0, Math.PI * 2);
      context.stroke();
    }
    // HP bar for tough enemies.
    if ((e.kind === KIND_BRUTE || e.kind === KIND_BOSS || e.elite) && e.hp < e.maxHp) {
      const w = e.radius * 2;
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.fillRect(-w / 2, -e.radius - 14, w, 5);
      context.fillStyle = e.kind === KIND_BOSS ? PALETTE.danger : PALETTE.gold;
      context.fillRect(-w / 2, -e.radius - 14, (w * Math.max(0, e.hp)) / e.maxHp, 5);
    }
    context.restore();
  }

  function drawBolts(state) {
    for (const b of state.bolts) {
      glowCircle(b.x, b.y, 18, 'rgba(255,233,168,0.7)', 0.9);
      context.strokeStyle = PALETTE.bolt;
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.fillStyle = PALETTE.boltCore;
      context.beginPath();
      context.arc(b.x, b.y, 3.4, 0, Math.PI * 2);
      context.fill();
    }
    for (const b of state.enemyBolts) {
      glowCircle(b.x, b.y, 20, 'rgba(224,107,255,0.6)', 0.9);
      context.fillStyle = PALETTE.orb;
      context.beginPath();
      context.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd7ff';
      context.beginPath();
      context.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.sin(time * 30) > 0;
    if (blink) return;
    // Dash trail.
    if (p.dashTime > 0) {
      glowCircle(p.x - p.dashX * 26, p.y - p.dashY * 26, 30, 'rgba(255,217,122,0.5)', 0.8);
    }
    glowCircle(p.x, p.y, 46, 'rgba(255,217,122,0.75)', 0.9);
    // Muzzle flash.
    if (p.muzzle > 0) {
      glowCircle(p.x + p.faceX * 26, p.y + p.faceY * 26, 22, 'rgba(255,243,196,0.9)', 1);
    }
    // Shield ring.
    if (p.shieldTimer > 0) {
      context.strokeStyle = PALETTE.shield;
      context.globalAlpha = 0.6 + 0.3 * Math.sin(time * 5);
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    // Flame body: teardrop leaning toward the aim.
    const aim = Math.atan2(p.aimY || p.faceY, p.aimX || p.faceX);
    context.save();
    context.translate(p.x, p.y);
    context.rotate(aim);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(p.radius + 8, 0);
    context.quadraticCurveTo(p.radius * 0.4, p.radius * 0.95, -p.radius * 0.7, p.radius * 0.55);
    context.quadraticCurveTo(-p.radius * 0.2, 0, -p.radius * 0.7, -p.radius * 0.55);
    context.quadraticCurveTo(p.radius * 0.4, -p.radius * 0.95, p.radius + 8, 0);
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(2, 0, p.radius * 0.5, 0, Math.PI * 2);
    context.fill();
    // Eyes look where the wisp aims.
    context.fillStyle = '#3a2c10';
    context.beginPath();
    context.arc(5, -4.5, 2.2, 0, Math.PI * 2);
    context.arc(5, 4.5, 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Aim reticle.
    const rx = p.x + (p.aimX || p.faceX) * 44;
    const ry = p.y + (p.aimY || p.faceY) * 44;
    context.strokeStyle = 'rgba(255,233,168,0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(rx, ry, 9, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(rx - 13, ry);
    context.lineTo(rx - 5, ry);
    context.moveTo(rx + 5, ry);
    context.lineTo(rx + 13, ry);
    context.moveTo(rx, ry - 13);
    context.lineTo(rx, ry - 5);
    context.moveTo(rx, ry + 5);
    context.lineTo(rx, ry + 13);
    context.stroke();
  }

  function drawFx(state) {
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.font = `bold 15px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const f of state.floaters) {
      context.globalAlpha = Math.min(1, (f.life / f.maxLife) * 1.6);
      context.fillStyle = f.color;
      context.fillText(f.text, f.x, f.y);
    }
    context.font = `bold 17px ${FONT}`;
    for (const d of state.dmgNums) {
      context.globalAlpha = Math.min(1, (d.life / d.maxLife) * 1.8);
      context.fillStyle = d.color;
      context.fillText(d.text, d.x, d.y);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best, time, muted, autoFire) {
    const p = state.player;
    // Top-left: hearts, score, level.
    for (let i = 0; i < p.maxHp; i += 1) {
      context.fillStyle = i < p.hp ? PALETTE.heart : 'rgba(255,93,115,0.25)';
      context.font = '22px sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.fillText('♥', 24 + i * 26, 40);
    }
    text(scoreLabel(state.score), 24, 72, 24, PALETTE.text, 'left');
    text(levelLabel(state.level), 24, 100, 18, PALETTE.gem, 'left');
    // Combo sits under the level, never over the dash hint.
    if (state.combo >= 2) {
      text(comboLabel(state.combo), 24, 128, 20, PALETTE.gold, 'left');
    }
    // Top-right: wave, best, kills.
    text(waveLabel(state.wave) + ` / 12`, FIELD.width - 24, 40, 24, PALETTE.text, 'right');
    text(bestLabel(Math.max(best, state.score)), FIELD.width - 24, 68, 16, PALETTE.muted, 'right');
    text(killsLabel(state.slain), FIELD.width - 24, 92, 16, PALETTE.muted, 'right');
    // Boss bar.
    if (state.boss) {
      const w = 460;
      const x = (FIELD.width - w) / 2;
      const y = 22;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(x - 8, y - 6, w + 16, 34);
      text('GLOOM HERALD', FIELD.width / 2, y + 2, 15, '#ff9db4', 'center');
      context.fillStyle = '#3a1030';
      context.fillRect(x, y + 12, w, 9);
      context.fillStyle = PALETTE.danger;
      context.fillRect(x, y + 12, (w * Math.max(0, state.boss.hp)) / state.bossMaxHp, 9);
    }
    // Bottom: XP bar, energy bar, combo.
    const barW = 560;
    const barX = (FIELD.width - barW) / 2;
    const barY = FIELD.height - 34;
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(barX - 6, barY - 6, barW + 12, 20);
    context.fillStyle = '#12324a';
    context.fillRect(barX, barY, barW, 8);
    context.fillStyle = PALETTE.gem;
    context.fillRect(barX, barY, (barW * state.xp) / state.xpNext, 8);
    text(`XP ${state.xp}/${state.xpNext}`, FIELD.width / 2, barY + 24, 13, PALETTE.muted, 'center');
    // Energy (flare) bar, bottom-left.
    const eW = 180;
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(18, FIELD.height - 40, eW + 12, 26);
    context.fillStyle = '#3a2c10';
    context.fillRect(24, FIELD.height - 34, eW, 9);
    context.fillStyle = state.energy >= PLAYER.flareCost ? PALETTE.gold : '#8a7a3a';
    context.fillRect(24, FIELD.height - 34, (eW * state.energy) / 100, 9);
    text('FLARE [Space]', 24, FIELD.height - 46, 13, PALETTE.muted, 'left');
    // Combo moved to the top-left; the bottom-right keeps dash / auto-fire hints.
    if (autoFire) text('AUTO-FIRE ON [F]', FIELD.width - 24, FIELD.height - 78, 13, PALETTE.gem, 'right');
    const dashReady = p.dashCooldown <= 0;
    text(dashReady ? 'DASH ready [Shift]' : 'DASH …', FIELD.width - 24, FIELD.height - 56, 13, dashReady ? PALETTE.shield : PALETTE.muted, 'right');
    if (autoFire) text('AUTO-FIRE ON [F]', FIELD.width - 24, FIELD.height - 78, 13, PALETTE.gem, 'right');
    if (muted) text('Muted [M]', FIELD.width - 24, 118, 14, PALETTE.muted, 'right');
    // Wave banner.
    if (state.bannerTimer > 0 && state.phase === 'wave') {
      const a = Math.min(1, state.bannerTimer);
      context.globalAlpha = a;
      const label = state.wave % 4 === 0 ? `WAVE ${state.wave} — THE GLOOM HERALD RISES` : `WAVE ${state.wave}`;
      text(label, FIELD.width / 2, 150, 44, '#ffd94c', 'center');
      if (state.wave % 4 === 0) text('Beware the radial bursts — dash through the gaps!', FIELD.width / 2, 186, 17, '#ff9db4', 'center');
      context.globalAlpha = 1;
    }
    if (state.phase === 'calm') {
      text(`Calm — wave ${state.wave + 1} in ${Math.ceil(state.calmTimer)}…`, FIELD.width / 2, 150, 26, PALETTE.gem, 'center');
    }
    void time;
  }

  function drawLevelUp(state) {
    context.fillStyle = 'rgba(4, 6, 14, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('LEVEL UP!', FIELD.width / 2, 130, 52, PALETTE.gold, 'center');
    text('Choose a blessing — press 1, 2 or 3, or click a card', FIELD.width / 2, 172, 19, PALETTE.text, 'center');
    const offer = state.offer ?? [];
    const cardW = 300;
    const cardH = 210;
    const gap = 26;
    const total = offer.length * cardW + (offer.length - 1) * gap;
    let x = (FIELD.width - total) / 2;
    const y = 220;
    offer.forEach((blessing, i) => {
      context.fillStyle = PALETTE.card;
      context.strokeStyle = PALETTE.cardEdge;
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(x, y, cardW, cardH, 14);
      context.fill();
      context.stroke();
      text(blessing.icon, x + cardW / 2, y + 62, 44, PALETTE.gold, 'center');
      text(blessing.name, x + cardW / 2, y + 116, 24, PALETTE.text, 'center');
      text(blessing.desc, x + cardW / 2, y + 150, 17, PALETTE.muted, 'center');
      text(`[${i + 1}]`, x + cardW / 2, y + 186, 16, PALETTE.gem, 'center');
      x += cardW + gap;
    });
  }

  function panel(title, lines, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5, 7, 15, 0.82)';
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 16);
    context.fill();
    context.stroke();
    text(title, FIELD.width / 2, y + 64, 46, accent, 'center');
    lines.forEach((line, i) => {
      text(line.text, FIELD.width / 2, y + 118 + i * PANEL.line, line.size ?? 20, line.color ?? PALETTE.text, 'center');
    });
    return y + height;
  }

  function drawTitle(state, best) {
    panel('LUMENFALL', [
      { text: 'Siege of the Last Lantern', size: 22, color: PALETTE.gold },
      { text: 'You are the last lantern-wisp. Hold the cavern against the shades', size: 19 },
      { text: 'until dawn breaks — 12 waves, three Gloom Heralds, and the dark itself.', size: 19 },
      { text: 'WASD move · Mouse aim · Hold click to fire · Space flare · Shift dash', size: 18, color: PALETTE.muted },
      { text: 'F auto-fire · 1/2/3 choose blessings · P pause · M mute', size: 18, color: PALETTE.muted },
      { text: best > 0 ? bestLabel(best) + ' — press Space or click to begin' : 'Press Space or click to begin', size: 20, color: PALETTE.text },
    ], '#ffd94c');
  }

  function drawOver(state, best) {
    panel('THE LIGHT GOES OUT', [
      { text: `The shades close in on wave ${state.wave}.`, size: 20 },
      { text: finalLabel(state.score), size: 24, color: PALETTE.gold },
      { text: bestLabel(Math.max(best, state.score)), size: 18, color: PALETTE.muted },
      { text: `Shades slain ${state.slain} · Level ${state.level} · Embers ${state.embersEaten}`, size: 18, color: PALETTE.muted },
      { text: 'Press Space or click to try again', size: 19, color: PALETTE.text },
    ], PALETTE.danger);
  }

  function drawWin(state, best) {
    panel('DAWN BREAKS', [
      { text: 'Twelve waves, three Heralds — and the lantern still burns.', size: 20 },
      { text: 'The cavern city wakes in morning light.', size: 20 },
      { text: finalLabel(state.score), size: 26, color: PALETTE.gold },
      { text: bestLabel(Math.max(best, state.score)), size: 18, color: PALETTE.muted },
      { text: `Shades slain ${state.slain} · Level ${state.level} · Embers ${state.embersEaten}`, size: 18, color: PALETTE.muted },
      { text: 'Press Space or click to play again', size: 19, color: PALETTE.text },
    ], '#ffd94c');
  }

  function drawPaused() {
    panel('PAUSED', [
      { text: 'The shades wait in the dark.', size: 20 },
      { text: 'P or Space to resume · M mute', size: 18, color: PALETTE.muted },
    ], PALETTE.text);
  }

  function draw(state, screen, best, light, time, muted, autoFire = false) {
    resize();
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(time);
    drawEmbers(state, time);
    drawPowerups(state);
    for (const enemy of state.enemies) drawEnemy(enemy, time);
    drawBolts(state);
    drawPlayer(state, time);
    drawFx(state);
    drawDarkness(state, light);
    // Flare flash washes the scene white-gold.
    if (state.flareFlash > 0) {
      context.globalAlpha = Math.min(0.55, state.flareFlash);
      context.fillStyle = '#ffe9a8';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(state, best, time, muted, autoFire);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_WIN) drawWin(state, best);
    if (state.phase === 'levelup' && screen === SCREEN_PLAY) drawLevelUp(state);
  }

  return { draw, resize, fieldFromScreen, view };
}
