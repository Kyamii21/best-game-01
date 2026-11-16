// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The cavern is drawn dim, then a darkness layer is punched with the wisp's light,
// so the game reads as a little lantern in a big dark cave. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.
import { FIELD, FONT, HEARTS, PALETTE, PLAYER } from './config.js';
import { KIND_RUSHER, KIND_WEAVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 780, top: 150, line: 32, bottom: 76 };

/** Deterministic rock blobs for the cavern floor: a hash of the index, no RNG needed. */
function rockAt(i) {
  const h = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const frac = h - Math.floor(h);
  const h2 = Math.sin(i * 269.5 + 183.3) * 28001.8384;
  const frac2 = h2 - Math.floor(h2);
  return {
    x: 30 + frac * (FIELD.width - 60),
    y: 60 + frac2 * (FIELD.height - 120),
    r: 14 + frac * 46,
  };
}
const ROCKS = [];
for (let i = 0; i < 26; i += 1) ROCKS.push(rockAt(i));

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

  // The darkness layer is drawn once per frame into this offscreen canvas, then punched
  // with the light and composited over the scene.
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

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.2, y, x - s * 0.6, y - s * 0.9, x, y - s * 0.25);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.2, y, x, y + s * 0.9);
    ctx.closePath();
  }

  function drawCavern() {
    context.fillStyle = PALETTE.cavern;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const rock of ROCKS) {
      context.fillStyle = PALETTE.cavernDeep;
      context.beginPath();
      context.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.rock;
      context.lineWidth = 2;
      context.stroke();
    }
    // Faint crystal glints on the cavern walls.
    context.fillStyle = 'rgba(122, 224, 255, 0.16)';
    for (let i = 0; i < 8; i += 1) {
      const r = ROCKS[i * 3];
      context.beginPath();
      context.moveTo(r.x - 4, r.y - r.r * 0.4);
      context.lineTo(r.x, r.y - r.r * 0.4 - 9);
      context.lineTo(r.x + 4, r.y - r.r * 0.4);
      context.closePath();
      context.fill();
    }
    // Dust motes drifting in the dark, so the black is never empty.
    context.fillStyle = 'rgba(143, 163, 255, 0.20)';
    for (let i = 0; i < 42; i += 1) {
      const d = rockAt(i + 100);
      context.beginPath();
      context.arc(d.x, d.y, 1.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawEmbers(state) {
    for (const ember of state.embers) {
      const twinkle = 0.65 + 0.35 * Math.sin(ember.phase);
      const glow = context.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 26);
      glow.addColorStop(0, `rgba(255, 179, 71, ${0.5 * twinkle})`);
      glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(ember.x, ember.y, 26, 0, Math.PI * 2);
      context.fill();
      // A four-point star, brighter when it twinkles up.
      context.fillStyle = PALETTE.emberCore;
      context.globalAlpha = twinkle;
      context.beginPath();
      context.moveTo(ember.x, ember.y - ember.radius);
      context.quadraticCurveTo(ember.x, ember.y, ember.x + ember.radius, ember.y);
      context.quadraticCurveTo(ember.x, ember.y, ember.x, ember.y + ember.radius);
      context.quadraticCurveTo(ember.x, ember.y, ember.x - ember.radius, ember.y);
      context.quadraticCurveTo(ember.x, ember.y, ember.x, ember.y - ember.radius);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawShades(state) {
    for (const shade of state.shades) {
      const wobble = 1 + 0.08 * Math.sin(shade.phase * 3);
      const r = shade.radius * wobble;
      const glow = context.createRadialGradient(shade.x, shade.y, 0, shade.x, shade.y, r * 2.6);
      glow.addColorStop(0, 'rgba(113, 92, 176, 0.75)');
      glow.addColorStop(1, 'rgba(113, 92, 176, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(shade.x, shade.y, r * 2.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.shade;
      context.beginPath();
      context.arc(shade.x, shade.y, r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.shadeCore;
      context.beginPath();
      context.arc(shade.x, shade.y, r * 0.62, 0, Math.PI * 2);
      context.fill();
      // Eyes look toward the wisp.
      const dx = state.player.x - shade.x;
      const dy = state.player.y - shade.y;
      const d = Math.hypot(dx, dy) || 1;
      const ex = (dx / d) * r * 0.25;
      const ey = (dy / d) * r * 0.25;
      context.fillStyle = PALETTE.shadeEye;
      context.beginPath();
      context.arc(shade.x - r * 0.3 + ex, shade.y - r * 0.15 + ey, 3.4, 0, Math.PI * 2);
      context.arc(shade.x + r * 0.3 + ex, shade.y - r * 0.15 + ey, 3.4, 0, Math.PI * 2);
      context.fill();
      if (shade.kind === KIND_RUSHER && shade.mode === 'telegraph') {
        context.strokeStyle = `rgba(255, 93, 115, ${0.4 + 0.6 * Math.abs(Math.sin(shade.phase * 14))})`;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(shade.x, shade.y, r + 7, 0, Math.PI * 2);
        context.stroke();
        // The dash line it is about to take.
        context.strokeStyle = 'rgba(255, 93, 115, 0.45)';
        context.lineWidth = 2;
        context.setLineDash([8, 8]);
        context.beginPath();
        context.moveTo(shade.x, shade.y);
        context.lineTo(shade.x + shade.aimX * 130, shade.y + shade.aimY * 130);
        context.stroke();
        context.setLineDash([]);
      }
      if (shade.kind === KIND_WEAVER) {
        context.strokeStyle = 'rgba(185, 167, 255, 0.5)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(shade.x, shade.y, r + 5, shade.phase, shade.phase + 1.6);
        context.stroke();
      }
    }
  }

  function drawPowerups(state) {
    for (const p of state.powerups) {
      const bob = Math.sin(p.phase * 2) * 3;
      const y = p.y + bob;
      const alpha = p.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 6)) : 1;
      context.globalAlpha = alpha;
      const glowColor = p.kind === 'heart' ? '255, 93, 115' : p.kind === 'prism' ? '122, 224, 255' : '201, 167, 255';
      const glow = context.createRadialGradient(p.x, y, 0, p.x, y, 34);
      glow.addColorStop(0, `rgba(${glowColor}, 0.5)`);
      glow.addColorStop(1, `rgba(${glowColor}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(p.x, y, 34, 0, Math.PI * 2);
      context.fill();
      if (p.kind === 'heart') {
        context.fillStyle = PALETTE.heart;
        heartPath(context, p.x, y, 11);
        context.fill();
      } else if (p.kind === 'prism') {
        context.fillStyle = PALETTE.prism;
        context.beginPath();
        context.moveTo(p.x, y - 13);
        context.lineTo(p.x + 10, y);
        context.lineTo(p.x, y + 13);
        context.lineTo(p.x - 10, y);
        context.closePath();
        context.fill();
        context.fillStyle = '#eafcff';
        context.beginPath();
        context.moveTo(p.x, y - 6);
        context.lineTo(p.x + 4, y);
        context.lineTo(p.x, y + 6);
        context.lineTo(p.x - 4, y);
        context.closePath();
        context.fill();
      } else {
        context.fillStyle = PALETTE.nova;
        context.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? 14 : 6;
          const px = p.x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    const flicker = 1 + 0.06 * Math.sin(time * 9) + 0.04 * Math.sin(time * 23);
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0;
    if (blink) return;
    const glow = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, 64 * flicker);
    glow.addColorStop(0, 'rgba(255, 217, 122, 0.75)');
    glow.addColorStop(0.5, 'rgba(255, 179, 71, 0.28)');
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(p.x, p.y, 64 * flicker, 0, Math.PI * 2);
    context.fill();
    // The wisp: a warm flame body with a bright core and two eyes.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(p.x, p.y - p.radius * 1.35 * flicker);
    context.quadraticCurveTo(p.x + p.radius, p.y - p.radius * 0.2, p.x + p.radius * 0.8, p.y + p.radius * 0.7);
    context.quadraticCurveTo(p.x, p.y + p.radius * 1.05, p.x - p.radius * 0.8, p.y + p.radius * 0.7);
    context.quadraticCurveTo(p.x - p.radius, p.y - p.radius * 0.2, p.x, p.y - p.radius * 1.35 * flicker);
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(p.x, p.y + 2, p.radius * 0.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3a2c10';
    context.beginPath();
    context.arc(p.x - 5, p.y - 2, 2.4, 0, Math.PI * 2);
    context.arc(p.x + 5, p.y - 2, 2.4, 0, Math.PI * 2);
    context.fill();
    if (p.dashTime > 0) {
      context.strokeStyle = 'rgba(255, 233, 168, 0.8)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawParticles(state) {
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawFloaters(state) {
    for (const f of state.floaters) {
      context.globalAlpha = Math.max(0, f.life / f.maxLife);
      text(f.text, f.x, f.y, 20, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  /** The darkness: everything outside the light is nearly black. */
  function drawDarkness(state, lightRadius) {
    darkCtx.setTransform(1, 0, 0, 1, 0, 0);
    darkCtx.globalCompositeOperation = 'source-over';
    darkCtx.clearRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.fillStyle = 'rgba(4, 6, 16, 0.48)';
    darkCtx.fillRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.globalCompositeOperation = 'destination-out';
    const p = state.player;
    const hole = darkCtx.createRadialGradient(p.x, p.y, lightRadius * 0.25, p.x, p.y, lightRadius);
    hole.addColorStop(0, 'rgba(0, 0, 0, 1)');
    hole.addColorStop(0.75, 'rgba(0, 0, 0, 0.85)');
    hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
    darkCtx.fillStyle = hole;
    darkCtx.beginPath();
    darkCtx.arc(p.x, p.y, lightRadius, 0, Math.PI * 2);
    darkCtx.fill();
    // Embers shine a little of their own light.
    for (const ember of state.embers) {
      const g = darkCtx.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 30);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      darkCtx.fillStyle = g;
      darkCtx.beginPath();
      darkCtx.arc(ember.x, ember.y, 30, 0, Math.PI * 2);
      darkCtx.fill();
    }
    context.drawImage(dark, 0, 0);
  }

  function drawHud(state, best, muted) {
    // Top bar: score, wave, hearts.
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave) + ' / 8', FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    const heartSize = 11;
    const gap = 10;
    const total = HEARTS * (heartSize * 2 + gap) - gap;
    const startX = FIELD.width - 24 - total;
    for (let i = 0; i < HEARTS; i += 1) {
      const cx = startX + i * (heartSize * 2 + gap) + heartSize;
      context.fillStyle = i < state.hearts ? PALETTE.heart : 'rgba(255, 93, 115, 0.25)';
      heartPath(context, cx, 30, heartSize);
      context.fill();
    }
    if (state.combo > 1) {
      text(comboLabel(state.combo), FIELD.width / 2, 54, 24, PALETTE.gold, 'center');
    }
    if (state.phase === 'calm') {
      text(`Calm — wave ${state.wave + 1} in ${Math.ceil(state.calmTimer)}…`, FIELD.width / 2, 54, 22, PALETTE.muted, 'center');
    }
    if (state.prismTimer > 0) {
      text(`Prism light ${Math.ceil(state.prismTimer)}s`, 24, 54, 20, PALETTE.prism, 'left');
    }
    // Bottom bar: flare energy and dash.
    const barX = 24;
    const barY = FIELD.height - 44;
    const barW = 260;
    const barH = 16;
    context.fillStyle = 'rgba(18, 24, 48, 0.9)';
    context.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
    context.fillStyle = '#2a3560';
    context.fillRect(barX, barY, barW, barH);
    const energyW = (barW * state.energy) / 100;
    const energyGrad = context.createLinearGradient(barX, barY, barX + barW, barY);
    energyGrad.addColorStop(0, '#ffb347');
    energyGrad.addColorStop(1, '#ffe9a8');
    context.fillStyle = energyGrad;
    context.fillRect(barX, barY, energyW, barH);
    text('FLARE  [Space]', barX, barY - 26, 18, state.energy >= PLAYER.flareCost ? PALETTE.gold : PALETTE.muted, 'left');
    const dashX = barX + barW + 28;
    text('DASH  [Shift]', dashX, barY - 26, 18, state.player.dashCooldown <= 0 ? PALETTE.text : PALETTE.muted, 'left');
    context.fillStyle = '#2a3560';
    context.fillRect(dashX, barY, 90, barH);
    if (state.player.dashCooldown <= 0) {
      context.fillStyle = PALETTE.prism;
      context.fillRect(dashX, barY, 90, barH);
    } else {
      const frac = 1 - state.player.dashCooldown / 2.2;
      context.fillStyle = PALETTE.prism;
      context.fillRect(dashX, barY, 90 * frac, barH);
    }
    text(`Best ${best}`, FIELD.width - 24, barY - 26, 18, PALETTE.muted, 'right');
    if (muted) text('Muted [M]', FIELD.width - 24, 54, 18, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 10, 20, 0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent ?? PALETTE.panelEdge;
    context.lineWidth = 3;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'Gather embers to feed your light.',
    'Keep the shades at bay until dawn breaks after wave 8.',
    'Move with WASD or arrows · Space flares · Shift dashes · P pauses',
    '',
  ];
  const PAUSED_LINES = ['The shades will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the cavern, the game, the darkness, then the HUD or a panel. */
  function draw(state, screen, best, lightRadius, time, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawCavern();
    drawEmbers(state);
    drawPowerups(state);
    drawShades(state);
    drawPlayer(state, time);
    drawParticles(state);
    drawDarkness(state, lightRadius);
    drawFloaters(state);
    // A flare whites the screen out for a beat.
    if (state.flareFlash > 0) {
      context.fillStyle = `rgba(255, 233, 168, ${state.flareFlash * 0.3})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('✦  GLOWKEEPER  ✦', TITLE_LINES, 'Press Space or click to begin', PALETTE.gold);
      return;
    }
    drawHud(state, best, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to keep the light alive');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `The dark took the light on wave ${state.wave} of 8.`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('The light went out', OVER_LINES, 'Press Space or click to try again', PALETTE.shadeEye);
    } else if (screen === SCREEN_WIN) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = 'Dawn breaks over the cavern. You kept the light alive.';
      OVER_LINES[2] = bestLabel(best);
      drawPanel('☀  Dawn breaks  ☀', OVER_LINES, 'Press Space or click to play again', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
