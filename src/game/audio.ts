let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    sfx.gain.value = 0.35;
    master.gain.value = muted ? 0 : 0.7;
    sfx.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.7, ctx.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, vol = 0.12) {
  if (!ctx || !sfx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

export function sfxSelect() {
  beep(420, 0.06, "triangle", 0.06);
}
export function sfxMove() {
  beep(180, 0.08, "sine", 0.05);
}
export function sfxTrain() {
  beep(260, 0.1, "square", 0.04);
  beep(390, 0.12, "triangle", 0.04);
}
export function sfxShot() {
  beep(140 + Math.random() * 40, 0.05, "sawtooth", 0.04);
}
export function sfxBoom() {
  beep(70, 0.22, "sawtooth", 0.08);
}
export function sfxWin() {
  beep(330, 0.18, "triangle", 0.08);
  beep(440, 0.22, "triangle", 0.08);
}
export function sfxLose() {
  beep(160, 0.3, "sine", 0.08);
}
