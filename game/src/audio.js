// Sound, synthesised with WebAudio: no audio files, no network. Every sound
// is a short oscillator or filtered-noise burst built once per call from a
// shared AudioContext created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }
  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }
  function tone(freq, duration, gainValue, type = 'square', slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'shotgun') { noise(0.22, 900, 0.9); tone(90, 0.14, 0.5, 'sawtooth', 45); }
      else if (kind === 'rifle') { noise(0.11, 1600, 0.7); tone(160, 0.08, 0.4, 'square', 70); }
      else if (kind === 'smg') { noise(0.07, 2000, 0.5); tone(200, 0.05, 0.3, 'square', 90); }
      else { noise(0.09, 1400, 0.55); tone(180, 0.06, 0.3, 'square', 80); }
    },
    enemyShot(distance) {
      const g = Math.max(0.08, 0.5 - distance * 0.012);
      noise(0.09, 1200, g);
    },
    reload() { tone(500, 0.05, 0.25, 'square'); setTimeout(() => tone(700, 0.05, 0.25, 'square'), 160); },
    dry() { tone(900, 0.03, 0.2, 'square'); },
    hit() { tone(1200, 0.04, 0.3, 'sine'); },
    kill() { tone(880, 0.08, 0.35, 'sine'); setTimeout(() => tone(1320, 0.1, 0.3, 'sine'), 70); },
    plantBeep() { tone(1050, 0.07, 0.3, 'sine'); },
    explosion() { noise(0.7, 300, 1.0); tone(60, 0.6, 0.7, 'sawtooth', 30); },
    roundWin() { tone(523, 0.12, 0.3, 'sine'); setTimeout(() => tone(659, 0.12, 0.3, 'sine'), 120); setTimeout(() => tone(784, 0.2, 0.3, 'sine'), 240); },
    roundLose() { tone(392, 0.15, 0.3, 'sine'); setTimeout(() => tone(311, 0.25, 0.3, 'sine'), 150); },
    buy() { tone(660, 0.05, 0.25, 'sine'); setTimeout(() => tone(990, 0.07, 0.25, 'sine'), 60); },
  };
}
