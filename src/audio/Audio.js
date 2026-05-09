// WebAudio synth — no asset deps. Generates SFX procedurally.
class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.unlock = this.unlock.bind(this);
    addEventListener('pointerdown', this.unlock, { once: true });
    addEventListener('keydown', this.unlock, { once: true });
    addEventListener('touchstart', this.unlock, { once: true });
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Resume on visibility return
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx?.state === 'suspended') this.ctx.resume();
    });
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  _env(node, t0, attack, hold, release, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    node.connect(g); g.connect(this.master);
    return g;
  }

  beep(freq = 440, dur = 0.1, type = 'square', vol = 0.4) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    this._env(o, t, 0.005, dur * 0.4, dur * 0.6, vol);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur = 0.2, vol = 0.3, filterFreq = 2000) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const n = this.ctx.createBufferSource(); n.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    n.connect(f);
    this._env(f, t, 0.005, dur * 0.2, dur * 0.7, vol);
    n.start(t);
  }

  sweep(f1, f2, dur, type = 'sawtooth', vol = 0.3) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    this._env(o, t, 0.005, dur * 0.4, dur * 0.6, vol);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // High-level cues
  jump() { this.sweep(280, 480, 0.15, 'square', 0.18); }
  land() { this.noise(0.08, 0.18, 800); }
  punch() { this.sweep(180, 60, 0.08, 'square', 0.3); this.noise(0.05, 0.18, 1000); }
  hit() { this.sweep(220, 80, 0.12, 'sawtooth', 0.35); this.noise(0.08, 0.25, 1500); }
  shoot() { this.sweep(800, 200, 0.08, 'square', 0.25); this.noise(0.04, 0.2, 4000); }
  explode() { this.noise(0.5, 0.5, 600); this.sweep(120, 40, 0.4, 'sawtooth', 0.4); }
  pickup() { this.beep(660, 0.05, 'square', 0.18); setTimeout(() => this.beep(990, 0.08, 'square', 0.2), 50); }
  death() { this.sweep(440, 80, 0.5, 'sawtooth', 0.35); }
  spawn() { this.beep(880, 0.06, 'sine', 0.25); setTimeout(() => this.beep(1320, 0.08, 'sine', 0.25), 60); }
  swing() { this.sweep(2000, 500, 0.1, 'square', 0.12); }
  click() { this.beep(880, 0.03, 'square', 0.15); }
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.15, 'square', 0.3), i * 100)); }
  break() { this.noise(0.2, 0.3, 3000); this.sweep(400, 200, 0.15, 'square', 0.2); }
  bonk() { this.beep(120, 0.18, 'sine', 0.4); }
}

export const audio = new Synth();
