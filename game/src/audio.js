// Audio: fully synthesised WebAudio — engine hum, wind, chimes. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windSrc = null;
    this.windGain = null;
    this.muted = false;
    this.started = false;
  }
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: two detuned saws through a lowpass.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sawtooth';
      this.engineOsc2.frequency.value = 55.7;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt);
      this.engineOsc2.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();
      // Wind: looped noise buffer.
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.windSrc = this.ctx.createBufferSource();
      this.windSrc.buffer = buf;
      this.windSrc.loop = true;
      const wf = this.ctx.createBiquadFilter();
      wf.type = 'bandpass';
      wf.frequency.value = 500;
      wf.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      this.windSrc.connect(wf);
      wf.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windSrc.start();
      this.started = true;
    } catch (e) {
      this.ctx = null;
    }
  }
  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setFlight(throttle, speed, onGround) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 40 + throttle * 65 + speed * 0.25;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.012, t, 0.1);
    this.engineGain.gain.setTargetAtTime(onGround ? 0.02 + throttle * 0.06 : 0.03 + throttle * 0.09, t, 0.15);
    this.windGain.gain.setTargetAtTime(Math.min(0.16, (speed / 96) * 0.16), t, 0.2);
  }
  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.18) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  chime(notes = [523, 659, 784]) {
    if (!this.ctx || this.muted) return;
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sine', 0.22), i * 110));
  }
  thud() {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.4, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + 0.22);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
