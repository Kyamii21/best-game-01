// Sound, synthesised with WebAudio: no audio files, nothing to download. A small helper
// builds tones (sine/triangle blips with a pitch glide) and filtered noise bursts; the game
// calls the named effects. The context is created lazily on the first user gesture, and M
// toggles mute. A quiet low drone hums underneath play, so the cavern never feels silent.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let drone = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0 }) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.25, vol = 0.3, freq = 1200, delay = 0 }) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.value = vol;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  function startDrone() {
    if (!ensure() || drone) return;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const osc2 = context.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82.5;
    const gain = context.createGain();
    gain.gain.value = 0.035;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc.start();
    osc2.start();
    lfo.start();
    drone = { osc, osc2, lfo, gain };
  }

  function stopDrone() {
    if (!drone) return;
    try {
      drone.osc.stop();
      drone.osc2.stop();
      drone.lfo.stop();
    } catch {
      // Already stopped.
    }
    drone = null;
  }

  return {
    /** Call on any user gesture so the context may start. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    startDrone,
    stopDrone,
    /** Pickup chime: climbs with the combo, so a chain sounds like a ladder. */
    ember(combo) {
      const base = 520 * 2 ** ((Math.min(combo, 8) - 1) / 12);
      tone({ freq: base, to: base * 1.5, type: 'triangle', dur: 0.16, vol: 0.22 });
      tone({ freq: base * 2, type: 'sine', dur: 0.1, vol: 0.08, delay: 0.02 });
    },
    flare(slains) {
      noise({ dur: 0.4, vol: 0.4, freq: 900 });
      tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.35, vol: 0.18 });
      if (slains > 0) tone({ freq: 660, to: 990, type: 'triangle', dur: 0.2, vol: 0.15, delay: 0.05 });
    },
    hit() {
      noise({ dur: 0.3, vol: 0.35, freq: 500 });
      tone({ freq: 140, to: 50, type: 'square', dur: 0.3, vol: 0.2 });
    },
    dash() {
      noise({ dur: 0.12, vol: 0.14, freq: 2400 });
    },
    powerup() {
      tone({ freq: 523, type: 'triangle', dur: 0.12, vol: 0.2 });
      tone({ freq: 659, type: 'triangle', dur: 0.12, vol: 0.2, delay: 0.07 });
      tone({ freq: 784, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.14 });
    },
    waveClear(wave) {
      const base = 392 + wave * 12;
      tone({ freq: base, type: 'triangle', dur: 0.14, vol: 0.2 });
      tone({ freq: base * 1.25, type: 'triangle', dur: 0.14, vol: 0.2, delay: 0.09 });
      tone({ freq: base * 1.5, type: 'triangle', dur: 0.24, vol: 0.2, delay: 0.18 });
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        tone({ freq, type: 'triangle', dur: 0.5, vol: 0.2, delay: i * 0.12 });
      });
    },
    lose() {
      [392, 330, 262, 196].forEach((freq, i) => {
        tone({ freq, type: 'sine', dur: 0.45, vol: 0.2, delay: i * 0.16 });
      });
    },
  };
}
