/**
 * useGameSounds — procedural Web Audio sound engine for Teen Patti.
 * No external files needed: every sound is synthesised from oscillators,
 * noise buffers, and gain envelopes straight in the browser.
 */

// ─── Shared AudioContext (lazy, created on first interaction) ────────────────
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// ─── Low-level helpers ───────────────────────────────────────────────────────
function playTone(
  ctx: AudioContext,
  freq: number,
  type: OscillatorType,
  volume: number,
  duration: number,
  delay = 0,
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  env.gain.setValueAtTime(0, ctx.currentTime + delay);
  env.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

function playNoise(ctx: AudioContext, volume: number, duration: number, delay = 0, highpass = 800) {
  const frames = Math.ceil(ctx.sampleRate * (duration + 0.1));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = highpass;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, ctx.currentTime + delay);
  env.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  src.connect(filt);
  filt.connect(env);
  env.connect(ctx.destination);
  src.start(ctx.currentTime + delay);
  src.stop(ctx.currentTime + delay + duration + 0.05);
}

// ─── Individual sounds ───────────────────────────────────────────────────────

/**
 * CHAAL — Warm chip-stack slide: layered coin clicks that feel like chips
 * being pushed across the felt. Satisfying, weighty, decisive.
 */
function soundChaal() {
  const ctx = getCtx();
  const numClicks = 4;
  for (let i = 0; i < numClicks; i++) {
    const delay = i * 0.055;
    playTone(ctx, 900 - i * 40, 'sine', 0.35, 0.08, delay);
    playTone(ctx, 1600 - i * 60, 'triangle', 0.18, 0.06, delay);
    playTone(ctx, 3200, 'sine', 0.08, 0.04, delay);
    playNoise(ctx, 0.12, 0.05, delay, 1200);
  }
  // Final settling thud
  playTone(ctx, 220, 'sine', 0.2, 0.12, numClicks * 0.055);
  playNoise(ctx, 0.18, 0.08, numClicks * 0.055, 400);
}

/**
 * PACK / FOLD — Card whoosh + soft thud on the discard pile.
 */
function soundPack() {
  const ctx = getCtx();
  playNoise(ctx, 0.35, 0.18, 0, 600);
  // Pitch descend — "dropping" feel
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.22);
  env.gain.setValueAtTime(0, ctx.currentTime);
  env.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.28);
  // Soft thud
  playNoise(ctx, 0.22, 0.07, 0.15, 200);
  playTone(ctx, 110, 'sine', 0.18, 0.1, 0.15);
}

/**
 * RAISE / DOUBLE — Ascending chip-stack sound: heavier, more coins,
 * rising pitch — communicates power and aggression.
 */
function soundRaise() {
  const ctx = getCtx();
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const delay = i * 0.065;
    const freqBase = 700 + i * 80;
    playTone(ctx, freqBase, 'sine', 0.28 + i * 0.04, 0.09, delay);
    playTone(ctx, freqBase * 1.8, 'triangle', 0.14, 0.07, delay);
    playNoise(ctx, 0.1 + i * 0.02, 0.055, delay, 1400);
  }
  // Triumphant landing
  playTone(ctx, 440, 'sine', 0.3, 0.2, steps * 0.065);
  playTone(ctx, 660, 'sine', 0.2, 0.18, steps * 0.065);
  playNoise(ctx, 0.25, 0.12, steps * 0.065, 350);
}

/**
 * SHOW — Dramatic card reveal. Tension build → release.
 */
function soundShow() {
  const ctx = getCtx();
  playNoise(ctx, 0.25, 0.35, 0, 400);
  // Rising arpeggio
  const notes = [261, 329, 392, 523];
  notes.forEach((freq, i) => {
    playTone(ctx, freq, 'sine', 0.25, 0.28, i * 0.07);
    playTone(ctx, freq * 2, 'triangle', 0.1, 0.22, i * 0.07);
  });
  // Reveal shimmer
  const shimmerT = notes.length * 0.07 + 0.04;
  playTone(ctx, 1046, 'sine', 0.35, 0.5, shimmerT);
  playTone(ctx, 1318, 'sine', 0.25, 0.45, shimmerT + 0.04);
  playTone(ctx, 1568, 'sine', 0.2, 0.4, shimmerT + 0.08);
  for (let i = 0; i < 3; i++) playNoise(ctx, 0.15, 0.06, shimmerT + i * 0.05, 900);
}

/**
 * DEAL CARDS — Rapid card-dealing sequence.
 */
function soundDeal(playerCount = 4) {
  const ctx = getCtx();
  const rounds = 3;
  for (let round = 0; round < rounds; round++) {
    for (let p = 0; p < playerCount; p++) {
      const delay = round * playerCount * 0.1 + p * 0.1;
      playNoise(ctx, 0.2, 0.08, delay, 700);
      playTone(ctx, 800 - p * 30, 'sine', 0.12, 0.07, delay);
    }
  }
}

/**
 * SEE CARDS — Gentle peek sound. Soft whoosh as cards lift slightly.
 */
function soundSeeCards() {
  const ctx = getCtx();
  playNoise(ctx, 0.18, 0.14, 0, 800);
  playTone(ctx, 600, 'sine', 0.15, 0.12, 0.04);
  playTone(ctx, 900, 'sine', 0.08, 0.1, 0.08);
}

/**
 * SIDESHOW REQUEST — Tense, expectant. Short rising two-note stab.
 */
function soundSideshow() {
  const ctx = getCtx();
  playTone(ctx, 392, 'sawtooth', 0.2, 0.12, 0);
  playTone(ctx, 523, 'sawtooth', 0.22, 0.15, 0.1);
  playNoise(ctx, 0.12, 0.1, 0.05, 600);
}

/**
 * WINNER — Full victory fanfare. Ascending triumphant chord progression.
 */
function soundWinner() {
  const ctx = getCtx();
  // Celebratory chip rain first
  for (let i = 0; i < 6; i++) {
    const delay = i * 0.04;
    playNoise(ctx, 0.14, 0.07, delay, 1100);
    playTone(ctx, 800 + i * 100, 'sine', 0.18, 0.09, delay);
  }
  // Victory chord: C-E-G-C' ascending
  const fanfareStart = 0.28;
  const chord = [261, 329, 392, 523, 659];
  chord.forEach((freq, i) => {
    playTone(ctx, freq, 'sine', 0.3, 0.7 - i * 0.06, fanfareStart + i * 0.06);
    playTone(ctx, freq * 2, 'triangle', 0.12, 0.5, fanfareStart + i * 0.06);
  });
  // Final shimmer
  const endT = fanfareStart + chord.length * 0.06 + 0.1;
  playTone(ctx, 1046, 'sine', 0.28, 0.8, endT);
  playTone(ctx, 1318, 'sine', 0.2, 0.7, endT + 0.06);
  playTone(ctx, 1568, 'sine', 0.15, 0.6, endT + 0.12);
  playNoise(ctx, 0.2, 0.3, endT, 500);
}

/**
 * SIDESHOW ACCEPT — Positive two-tone chime.
 */
function soundSideshowAccept() {
  const ctx = getCtx();
  playTone(ctx, 523, 'sine', 0.28, 0.25, 0);
  playTone(ctx, 659, 'sine', 0.25, 0.22, 0.1);
  playNoise(ctx, 0.1, 0.08, 0, 1000);
}

/**
 * SIDESHOW DECLINE — Low negative blip.
 */
function soundSideshowDecline() {
  const ctx = getCtx();
  playTone(ctx, 220, 'sine', 0.28, 0.2, 0);
  playTone(ctx, 180, 'sine', 0.22, 0.18, 0.08);
  playNoise(ctx, 0.12, 0.08, 0, 300);
}

/**
 * TIP DEALER — Generous coin cascade. Multiple gold coins land in rapid
 * succession with an ascending sparkle finish. Warm, celebratory, appreciative.
 */
function soundTip() {
  const ctx = getCtx();
  // Rapid sequence of coin clinks — like tossing a handful of chips
  const coins = 7;
  for (let i = 0; i < coins; i++) {
    const delay = i * 0.068;
    const freq = 820 + i * 110; // ascending pitch = generosity
    playTone(ctx, freq, 'sine', 0.3, 0.1, delay);
    playTone(ctx, freq * 1.6, 'triangle', 0.14, 0.08, delay);
    playNoise(ctx, 0.09 + i * 0.015, 0.055, delay, 1500);
  }
  // Warm "thank you" sparkle at the end
  const endT = coins * 0.068 + 0.03;
  playTone(ctx, 880, 'sine', 0.26, 0.32, endT);
  playTone(ctx, 1108, 'sine', 0.18, 0.26, endT + 0.07);
  playTone(ctx, 1320, 'sine', 0.12, 0.2, endT + 0.14);
  playNoise(ctx, 0.14, 0.18, endT, 900);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGameSounds() {
  return {
    playChaal: soundChaal,
    playPack: soundPack,
    playRaise: soundRaise,
    playShow: soundShow,
    playDeal: soundDeal,
    playSeeCards: soundSeeCards,
    playSideshow: soundSideshow,
    playWinner: soundWinner,
    playSideshowAccept: soundSideshowAccept,
    playSideshowDecline: soundSideshowDecline,
    playTip: soundTip,
  };
}
