// Keyboard and pointer input for a twin-stick game. WASD or arrows steer; the mouse
// aims (the loop converts screen pixels to field coordinates); holding the left button
// — or holding Space — fires; Space also flares on a tap... no: Space is the flare, and
// firing is mouse-only plus an auto-fire toggle, so the two hands never fight. One-shot
// presses (flare, dash, pause, mute, level-up picks, confirm) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_FLARE = 2;
export const ACTION_DASH = 4;
export const ACTION_PAUSE = 8;
export const ACTION_MUTE = 16;
export const ACTION_PICK1 = 32;
export const ACTION_PICK2 = 64;
export const ACTION_PICK3 = 128;
export const ACTION_AUTOFIRE = 256;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const FLARE = new Set(['Space']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyJ']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const PICK1 = new Set(['Digit1', 'Numpad1']);
const PICK2 = new Set(['Digit2', 'Numpad2']);
const PICK3 = new Set(['Digit3', 'Numpad3']);
const AUTOFIRE = new Set(['KeyF']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let firing = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (FLARE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FLARE | ACTION_CONFIRM;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICK1.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK1;
    } else if (PICK2.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK2;
    } else if (PICK3.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK3;
    } else if (AUTOFIRE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_AUTOFIRE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    up = false; down = false; left = false; right = false; firing = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseSeen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseSeen = true;
    if (event.button === 0) {
      firing = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised steering vector {x, y}, each component in [-1, 1]. */
    vector() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** Is the fire button held right now? */
    get firing() { return firing; },
    /** Last mouse position in screen pixels, or null before the first move. */
    get mouse() { return mouseSeen ? { x: mouseX, y: mouseY } : null; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
