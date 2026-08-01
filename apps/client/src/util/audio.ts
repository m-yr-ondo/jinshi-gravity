/**
 * Tiny WebAudio synth. No external files; all sounds are generated procedurally
 * so the project ships zero copyrighted audio. The game still works if audio
 * autoplay is blocked (we only play after the first user gesture).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.ctx) {
      this.ctx.suspend().catch(() => {
        /* ignore */
      });
    } else if (!muted && this.ctx) {
      this.ctx.resume().catch(() => {
        /* ignore */
      });
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    if (this.muted) this.ctx.suspend().catch(() => undefined);
    return this.ctx;
  }

  /** Resume the audio context after a user gesture (browser autoplay policy). */
  resume(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  }

  private blip(
    freqStart: number,
    freqEnd: number,
    durationMs: number,
    type: OscillatorType = "square",
    gain = 0.08,
  ): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + durationMs / 1000);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
  }

  playSwitch(): void {
    this.blip(280, 640, 90, "square", 0.06);
  }

  playCountdown(): void {
    this.blip(440, 440, 120, "triangle", 0.07);
  }

  playFinish(): void {
    this.blip(660, 990, 220, "triangle", 0.08);
  }

  playVictory(): void {
    this.blip(523, 784, 220, "triangle", 0.08);
    setTimeout(() => this.blip(784, 1046, 260, "triangle", 0.09), 180);
    setTimeout(() => this.blip(1046, 1318, 320, "triangle", 0.1), 360);
  }

  playDeath(): void {
    this.blip(220, 60, 260, "sawtooth", 0.07);
  }
}

export const audio = new AudioEngine();