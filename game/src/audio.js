// audio.js — all sound synthesized with WebAudio, no audio files.
// The AudioContext is created lazily in unlock() (user gesture) and every
// method no-ops safely until then. One 1 s white-noise buffer is shared by
// every noise-based sound; one master gain sits at 0.22.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let ambient = null; // { src, gain, lfo, lfoGain }
  let muted = false;

  function makeNoiseBuffer() {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Short oscillator blip. freq -> end (optional slide), Hz.
  function tone(freq, dur, type, vol, delay, end) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Filtered burst from the shared noise buffer. freq -> end sweeps the filter.
  function noise(dur, vol, freq, delay, end, type) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type || 'lowpass';
    flt.frequency.setValueAtTime(freq, t0);
    if (end) flt.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Small metallic click used by reload / dry fire.
  function click(delay, freq, vol) {
    tone(freq || 1400, 0.03, 'square', vol || 0.12, delay);
    noise(0.03, (vol || 0.12) * 0.8, 4000, delay, 1500, 'bandpass');
  }

  function notes(freqs, dur, gap, type, vol) {
    for (let i = 0; i < freqs.length; i++) {
      tone(freqs[i], dur, type || 'sine', vol || 0.2, i * gap);
    }
  }

  return {
    unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.22;
        master.connect(ctx.destination);
        noiseBuf = makeNoiseBuffer();
      }
      if (ctx.state === 'suspended') ctx.resume();
    },

    shot(kind) {
      if (!ctx) return;
      // rifle loudest/longest, smg shortest, pistol in between.
      const cfg = {
        rifle: { dur: 0.16, vol: 0.55, freq: 2800, thump: 160 },
        smg: { dur: 0.07, vol: 0.32, freq: 3400, thump: 200 },
        pistol: { dur: 0.11, vol: 0.42, freq: 3000, thump: 180 },
      }[kind] || { dur: 0.11, vol: 0.42, freq: 3000, thump: 180 };
      noise(cfg.dur, cfg.vol, cfg.freq, 0, 300);
      tone(cfg.thump, 0.09, 'square', cfg.vol * 0.5, 0, 60);
    },

    dryFire() {
      if (!ctx) return;
      click(0, 1800, 0.15);
    },

    reload() {
      if (!ctx) return;
      click(0, 1100, 0.16);
      click(0.25, 900, 0.18);
    },

    hit(kill) {
      if (!ctx) return;
      tone(880, 0.07, 'sine', 0.25, 0);
      if (kill) tone(1320, 0.1, 'sine', 0.25, 0.07);
    },

    hurt() {
      if (!ctx) return;
      tone(110, 0.25, 'sine', 0.5, 0, 45);
      noise(0.18, 0.25, 500, 0, 120);
    },

    footstep(run) {
      if (!ctx) return;
      noise(0.06, run ? 0.18 : 0.11, 420, 0, 150);
    },

    explosion() {
      if (!ctx) return;
      noise(0.9, 0.9, 3000, 0, 80);
      tone(120, 0.7, 'sine', 0.7, 0, 30);
    },

    beep() {
      if (!ctx) return;
      tone(1000, 0.12, 'sine', 0.2, 0);
    },

    plant() {
      if (!ctx) return;
      notes([523, 659, 784], 0.14, 0.1, 'sine', 0.22);
    },

    defuse() {
      if (!ctx) return;
      notes([784, 659, 523], 0.14, 0.1, 'sine', 0.22);
    },

    roundStart() {
      if (!ctx) return;
      tone(196, 0.2, 'sawtooth', 0.16, 0);
      tone(294, 0.28, 'sawtooth', 0.16, 0.2);
    },

    roundWin(won) {
      if (!ctx) return;
      if (won) notes([523, 659, 784], 0.22, 0.12, 'triangle', 0.22);
      else notes([392, 311], 0.3, 0.16, 'triangle', 0.2);
    },

    buy() {
      if (!ctx) return;
      tone(1200, 0.06, 'sine', 0.2, 0);
      tone(1600, 0.1, 'sine', 0.2, 0.07);
    },

    bounce() {
      if (!ctx) return;
      tone(180, 0.08, 'sine', 0.3, 0, 90);
      noise(0.05, 0.12, 600, 0, 200);
    },

    ambientStart() {
      if (!ctx || ambient) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      // Slow LFO breathing on the wind gain.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(flt);
      flt.connect(gain);
      gain.connect(master);
      src.start();
      lfo.start();
      ambient = { src, gain, lfo, lfoGain };
    },

    ambientStop() {
      if (!ctx || !ambient) return;
      try { ambient.src.stop(); } catch (e) { /* already stopped */ }
      try { ambient.lfo.stop(); } catch (e) { /* already stopped */ }
      ambient.src.disconnect();
      ambient.lfo.disconnect();
      ambient.lfoGain.disconnect();
      ambient.gain.disconnect();
      ambient = null;
    },

    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.22;
    },
  };
}
