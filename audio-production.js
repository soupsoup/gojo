const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createNetworkNewsTheme } = require("./network-news-theme");

function responseText(payload) {
  return (payload.output || []).flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text").map((item) => item.text).join("");
}

async function writeNewscastScript({ briefing, profile }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured");
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric"
  }).format(new Date());
  const model = process.env.OPENAI_SUMMARY_MODEL || "gpt-5.6-terra";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...(model.startsWith("gpt-5") ? { reasoning: { effort: "low" } } : {}),
      input: `You are the senior producer of GoJo, a polished personalized daily audio newscast.

Write a spoken script from the verified briefing below. This is not an AI reading of the email and not a stream of breaking alerts. It should sound like a confident, modern public-radio host delivering a tightly edited personal newscast.

Open with exactly: "Good morning${profile?.name ? `, ${String(profile.name).split(/\\s+/)[0]}` : ""}. It's ${date}." Then move directly into the lead story. Use the facts supplied and do not add, infer, update, or invent facts. Preserve source attribution naturally in speech. Group related items, vary sentence rhythm, and add short conversational segues between subject areas, such as "Switching over to sports," or "Now to technology." Do not announce headings, item numbers, runtime, or the number of stories. Avoid hype, filler, generic analysis, a recap, and phrases like "why it matters." End with one short, warm sign-off.

Target 325 to 475 spoken words. If the supplied facts cannot support that length without padding, be shorter. Return plain text only.

Verified briefing:
${JSON.stringify({ sections: briefing.sections, sources: briefing.sources })}`,
      max_output_tokens: 1400
    })
  });
  if (!response.ok) throw new Error(`Newscast script failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const script = responseText(await response.json()).trim();
  if (script.length < 200) throw new Error("Newscast script was too short");
  return script;
}

async function synthesizeVoice(script) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs is not configured");
  // Keep the newscast anchor independent from onboarding and utility speech.
  // The default is a mature, authoritative American male voice; deployments
  // can audition and replace it without changing the rest of the product.
  const voiceId = process.env.ELEVENLABS_NEWSCAST_VOICE_ID || "pqHfZKP75CvOlQylNhV4";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: script,
      model_id: process.env.ELEVENLABS_NEWSCAST_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.58,
        similarity_boost: 0.82,
        style: 0.14,
        speed: 0.96,
        use_speaker_boost: true
      }
    })
  });
  if (!response.ok) throw new Error(`Voice production failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function createMusicBed() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      prompt: "Original instrumental news theme for a modern personalized morning newscast. Crisp restrained percussion, warm bass, subtle marimba pulse and confident editorial energy. No vocals, no drones, no humming, no cinematic booms, no sound effects. Designed to sit quietly under speech with a clean opening and ending.",
      music_length_ms: 45000
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`ElevenLabs music unavailable; using GoJo's built-in bed: ${response.status} ${detail.slice(0, 180)}`);
    return createBuiltInMusicBed();
  }
  return Buffer.from(await response.arrayBuffer());
}

async function createBuiltInMusicBed() {
  const theme = await createNetworkNewsTheme();
  const dir = theme.dir;
  const outputPath = path.join(dir, "gojo-bed.mp3");
  try {
    await runFfmpeg([
      "-y", "-i", theme.wav,
      "-af", "highpass=f=45,lowpass=f=11000,acompressor=threshold=0.22:ratio=2.5:attack=12:release=180,loudnorm=I=-22:TP=-3:LRA=6",
      "-c:a", "libmp3lame", "-b:a", "160k", outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    let bundledFfmpeg;
    try { bundledFfmpeg = require("ffmpeg-static"); } catch {}
    const child = spawn(process.env.FFMPEG_PATH || bundledFfmpeg || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Audio mix failed: ${error.slice(-500)}`)));
  });
}

async function mixNewscast(voice, music) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gojo-newscast-"));
  const voicePath = path.join(dir, "voice.mp3");
  const musicPath = path.join(dir, "music.mp3");
  const outputPath = path.join(dir, "gojo-daily.mp3");
  await Promise.all([fs.writeFile(voicePath, voice), fs.writeFile(musicPath, music)]);
  try {
    await runFfmpeg([
      "-y", "-i", voicePath, "-stream_loop", "-1", "-i", musicPath,
      "-filter_complex",
      "[0:a]adelay=3200|3200,volume=1.0,apad=pad_dur=2.4,asplit=2[voice_sc][voice_mix];[1:a]volume=0.16,afade=t=in:st=0:d=0.7[bed];[bed][voice_sc]sidechaincompress=threshold=0.018:ratio=12:attack=8:release=520[ducked];[ducked][voice_mix]amix=inputs=2:duration=first:normalize=0,acompressor=threshold=0.8:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=7[out]",
      "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", "-shortest", outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

let musicPromise;
async function produceNewscast(input) {
  const script = await writeNewscastScript(input);
  const voice = await synthesizeVoice(script);
  let audio = voice;
  let production = "voice-only";
  try {
    musicPromise ||= createMusicBed().catch((error) => { musicPromise = null; throw error; });
    audio = await mixNewscast(voice, await musicPromise);
    production = "music-and-voice";
  } catch (error) {
    console.error("Music mix unavailable; delivering clean host track:", error.message);
  }
  return { audio, script, production, id: crypto.randomUUID() };
}

module.exports = { produceNewscast, writeNewscastScript, synthesizeVoice, createBuiltInMusicBed, mixNewscast };
