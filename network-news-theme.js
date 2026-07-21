const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function wavHeader(dataBytes, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + dataBytes, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(dataBytes, 40);
  return header;
}

function midi(note) { return 440 * 2 ** ((note - 69) / 12); }
function envelope(age, attack, decay) {
  if (age < 0) return 0;
  return Math.min(1, age / attack) * Math.exp(-age / decay);
}

async function createNetworkNewsTheme(duration = 48) {
  const rate = 44100;
  const frames = Math.floor(duration * rate);
  const pcm = Buffer.alloc(frames * 2);
  const beat = 60 / 126;
  const roots = [48, 44, 51, 46]; // C minor, A-flat, E-flat, B-flat
  const chordIntervals = [0, 3, 7, 12];
  let noiseState = 0x6d2b79f5;
  const noise = () => {
    noiseState ^= noiseState << 13; noiseState ^= noiseState >>> 17; noiseState ^= noiseState << 5;
    return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
  };

  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const beatIndex = Math.floor(t / beat);
    const bar = Math.floor(beatIndex / 4);
    const root = roots[bar % roots.length];
    const beatAge = t - beatIndex * beat;
    const eighthIndex = Math.floor(t / (beat / 2));
    const eighthAge = t - eighthIndex * (beat / 2);
    let value = 0;

    // Authoritative low brass/timpani pulse.
    const bassEnv = envelope(beatAge, 0.006, beatIndex % 4 === 0 ? 0.34 : 0.18);
    const bassFreq = midi(root - 12);
    value += bassEnv * (Math.sin(2 * Math.PI * bassFreq * t) * 0.19
      + Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.055);

    // Tight newsroom clock: bright, short eighth-note motif.
    const motif = [12, 19, 15, 19, 12, 22, 19, 15];
    const tickFreq = midi(root + motif[eighthIndex % motif.length]);
    const tickEnv = envelope(eighthAge, 0.003, 0.055);
    value += tickEnv * (Math.sin(2 * Math.PI * tickFreq * t) * 0.065
      + Math.sin(2 * Math.PI * tickFreq * 2.01 * t) * 0.018);

    // Orchestral chord stabs at the top and midpoint of each bar.
    const barAge = t - bar * beat * 4;
    const stabAge = barAge < beat * 2 ? barAge : barAge - beat * 2;
    const stabEnv = envelope(stabAge, 0.025, barAge < beat * 2 ? 0.42 : 0.24);
    for (const interval of chordIntervals) {
      const frequency = midi(root + interval);
      value += stabEnv * (Math.sin(2 * Math.PI * frequency * t) * 0.035
        + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.015
        + Math.sin(2 * Math.PI * frequency * 3 * t) * 0.007);
    }

    // Restrained snare/cymbal punctuation, avoiding a synthetic drone.
    if (beatIndex % 4 === 1 || beatIndex % 4 === 3) {
      value += noise() * envelope(beatAge, 0.002, 0.075) * 0.055;
    }
    value += noise() * envelope(eighthAge, 0.001, 0.018) * 0.018;

    // Strong opening signature and gentle overall fade.
    const opening = t < 1.5 ? 1 + (1.5 - t) * 0.18 : 1;
    const fade = Math.min(1, t / 0.18, (duration - t) / 1.2);
    const sample = Math.max(-1, Math.min(1, value * opening * fade * 1.7));
    pcm.writeInt16LE(Math.round(sample * 32767), i * 2);
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gojo-network-theme-"));
  const wav = path.join(dir, "network-news.wav");
  await fs.writeFile(wav, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
  return { dir, wav };
}

module.exports = { createNetworkNewsTheme };
