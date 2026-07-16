const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const audioCache = new Map();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml"
};

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleTts(req, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: "ElevenLabs is not configured", code: "TTS_NOT_CONFIGURED" });
  }

  try {
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    const segments = Array.isArray(body.segments)
      ? body.segments.map((segment) => String(segment || "").trim()).filter(Boolean)
      : [];
    const totalText = segments.length ? segments.join(" ") : text;
    if (!totalText || totalText.length > 5_000) return json(res, 400, { error: "Text must be between 1 and 5,000 characters" });

    const primaryVoiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const correspondentVoices = [
      process.env.ELEVENLABS_VOICE_ID_2 || "EXAVITQu4vr4xnSDxMaL",
      process.env.ELEVENLABS_VOICE_ID_3 || "pNInz6obpgDQGcFmaJgB",
      process.env.ELEVENLABS_VOICE_ID_4 || "21m00Tcm4TlvDq8ikWAM"
    ];
    const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
    const voicePlan = segments.map((_, index) => {
      const isOpeningOrClose = index === 0 || index === segments.length - 1;
      return isOpeningOrClose ? primaryVoiceId : correspondentVoices[(index - 1) % correspondentVoices.length];
    });
    if (segments.length) {
      const dialogueKey = crypto.createHash("sha256")
        .update(JSON.stringify(segments.map((segment, index) => ({ text: segment, voice_id: voicePlan[index] }))))
        .digest("hex");
      const cachedDialogue = audioCache.get(dialogueKey);
      if (cachedDialogue) {
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-NewsDJ-Cache": "HIT" });
        return res.end(cachedDialogue);
      }
      const dialogueResponse = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128", {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          inputs: segments.map((segment, index) => ({ text: segment, voice_id: voicePlan[index] })),
          model_id: "eleven_v3",
          language_code: "en"
        })
      });
      if (dialogueResponse.ok) {
        const dialogueAudio = Buffer.from(await dialogueResponse.arrayBuffer());
        audioCache.set(dialogueKey, dialogueAudio);
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-NewsDJ-Cache": "MISS" });
        return res.end(dialogueAudio);
      }
      const detail = await dialogueResponse.text();
      console.error(`ElevenLabs dialogue error ${dialogueResponse.status}; falling back to section synthesis: ${detail.slice(0, 500)}`);
    }
    const audioRequests = segments.length
      ? segments.map((segment, index) => ({ text: segment, voiceId: voicePlan[index] }))
      : [{ text, voiceId: primaryVoiceId }];

    const audioParts = await Promise.all(audioRequests.map(async ({ text: segmentText, voiceId }) => {
      // Flash uses fewer credits for long narration while preserving the selected
      // ElevenLabs voice. Keep the configured model for short onboarding lines.
      const effectiveModelId = segmentText.length > 1_800 ? "eleven_flash_v2_5" : modelId;
      const key = crypto.createHash("sha256").update(`${voiceId}:${effectiveModelId}:${segmentText}`).digest("hex");
      const cached = audioCache.get(key);
      if (cached) return cached;

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: segmentText,
          model_id: effectiveModelId,
          voice_settings: {
            stability: 0.46,
            similarity_boost: 0.78,
            style: 0.18,
            speed: 0.9,
            use_speaker_boost: true
          }
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error(`ElevenLabs error ${response.status}: ${detail.slice(0, 500)}`);
        throw new Error(`TTS_PROVIDER_ERROR:${response.status}`);
      }
      const audioPart = Buffer.from(await response.arrayBuffer());
      audioCache.set(key, audioPart);
      return audioPart;
    }));
    const audio = Buffer.concat(audioParts);
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-NewsDJ-Cache": "MISS" });
    res.end(audio);
  } catch (error) {
    console.error(error);
    json(res, 400, { error: "Could not process voice request" });
  }
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).replace(/<[^>]+>/g, "").trim() : "";
}

const topicSearches = {
  "World": "international affairs diplomacy conflict -sports -football -soccer",
  "U.S.": "United States national news government economy -sports",
  "Technology": "technology industry companies innovation",
  "Business": "business economy companies markets",
  "Politics": "United States politics government policy",
  "Science": "science research discovery study",
  "Culture": "arts culture entertainment media",
  "Sports": "sports tournament championship results",
  "AI": "artificial intelligence technology business",
  "Markets": "financial markets economy investing",
  "New York": "New York City local news",
  "Media": "media industry journalism entertainment",
  "Startups": "startup funding venture capital"
};

function isClearHeadline(item, isBroadTopic) {
  const words = item.title.split(/\s+/).filter(Boolean);
  if (words.length < 8 || words.length > 28) return false;
  if (/^(the|a|an) .{0,45} (stage|story|moment)$/i.test(item.title)) return false;
  if (/^(what to know|meet |inside |here'?s |watch:|photos:|opinion:)/i.test(item.title)) return false;
  if (/\b(photo gallery|live updates|newsletter|podcast|sponsored)\b/i.test(item.title)) return false;
  if (isBroadTopic && /\b(university|college|school|department|campus)\b/i.test(item.source)) return false;
  return true;
}

function responseText(payload) {
  return (payload.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

async function generateModelBriefing(profile) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured");
  const model = process.env.OPENAI_SUMMARY_MODEL || "gpt-5.6-terra";
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(new Date());
  const requestedMinutes = [1, 2, 5].includes(Number.parseInt(profile.length, 10))
    ? Number.parseInt(profile.length, 10)
    : 5;
  const durationPlans = {
    1: {
      seconds: 60, stories: 1, minWords: 110, targetWords: 135, maxWords: 180,
      structure: "Write exactly three natural spoken sections: a dated opening of five to twelve words, one story of one hundred to one hundred twenty-five words, and a close of ten to fifteen words. The complete script must contain one hundred twenty to one hundred fifty words."
    },
    2: {
      seconds: 120, stories: 2, minWords: 220, targetWords: 270, maxWords: 340,
      structure: "Write exactly four natural spoken sections: a dated opening of five to twelve words, two story sections of one hundred five to one hundred thirty words each, and a close of fifteen to twenty-five words. The complete script must contain two hundred forty to three hundred words."
    },
    5: {
      seconds: 300, stories: 4, minWords: 425, targetWords: 650, maxWords: 850,
      structure: "Write exactly six natural spoken sections: a dated opening of five to twelve words, four story sections of one hundred forty to one hundred sixty words each, and a close of twenty-five to forty words. The complete script must contain at least six hundred words and no more than seven hundred words."
    }
  };
  const plan = durationPlans[requestedMinutes];

  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      estimated_seconds: { type: "integer" },
      sections: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, url: { type: "string" } },
          required: ["label", "url"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "estimated_seconds", "sections", "sources"],
    additionalProperties: false
  };

  const prompt = `You are the editorial engine for GoJo. Today is ${today}.

Create a personalized ${requestedMinutes}-minute spoken news briefing for this listener profile:
${JSON.stringify(profile)}

Treat every selected subtopic as an intentional editorial search query, including narrow phrases, named people, companies, teams, places, and ongoing themes. The topicGroups array contains the listener's three main topics in their requested audio rundown order, followed by the five selected subtopics within each. Sequence the briefing by that main-topic order and spread coverage across the three groups before adding a second story from any one group. Within each group, select the strongest consequential development matching one or more chosen subtopics. If a group has no consequential, reliably sourced development today, skip it instead of forcing a weak story, then continue with the next group. Preserve the specificity of the selected subtopics; do not flatten them into broad categories. Search the web for reporting published or materially updated within the last twenty-four hours. Select exactly ${plan.stories} consequential ${plan.stories === 1 ? "story" : "stories"} with the strongest direct relevance to the listener's stated topics. Include a major story outside those interests only when it is genuinely essential.

For every story, explain in plain language: what happened, essential background, why it matters, and what to watch next. Use at least two independent credible sources for disputed, political, medical, financial, or developing claims. Prefer original reporting, official documents, and primary sources. Exclude vague, promotional, sensational, or poorly sourced items.

${plan.structure} The opening must say only the listener's name and today's date, for example: “Anthony, today is Wednesday, July fifteenth.” Do not say good morning, good afternoon, a clock time, or any other time-of-day phrase. Do not preview or list the stories. Begin the first story immediately after the date. Every story after the first must open with a brief broadcast segue that names the new subject area and flows directly into the story, for example: “Switching over to sports, in baseball the Mets’ deadline decision is becoming clearer.” Vary the segue language—such as “Turning to business,” “Over in politics,” or “Switching to sports”—so the briefing sounds smoothly edited rather than numbered. Do not finish early. Use the available space for concrete background and explanation, not repetition. Use short sentences and conversational transitions. Do not include markdown or read URLs aloud.

Every factual claim must be supported by sources you consulted. Return a concise source label and direct URL for each source. Never invent facts, quotations, statistics, context, or URLs. If a story cannot be explained from reliable current reporting, exclude it.`;

  async function requestBriefing(requestPrompt) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...(model.startsWith("gpt-5") ? { reasoning: { effort: "low" } } : {}),
        tools: [{
          type: "web_search",
          search_context_size: "high",
          filters: { blocked_domains: ["reddit.com", "quora.com", "wikipedia.org"] }
        }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        input: requestPrompt,
        max_output_tokens: 4000,
        text: { format: { type: "json_schema", name: "newsdj_briefing", strict: true, schema } }
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI briefing failed ${response.status}: ${detail.slice(0, 600)}`);
    }
    const payload = await response.json();
    const raw = responseText(payload);
    if (!raw) throw new Error("OpenAI returned no briefing text");
    return { briefing: JSON.parse(raw), raw };
  }

  let result = await requestBriefing(prompt);
  let words = result.briefing.sections.join(" ").trim().split(/\s+/).length;
  if (words < plan.targetWords * 0.92) {
    result = await requestBriefing(`${prompt}

The previous draft below was only ${words} words and did not provide enough context for the requested ${requestedMinutes}-minute runtime. Research each selected story more deeply by opening and comparing multiple reports. Rewrite it to approximately ${plan.targetWords} words. For each story, explicitly identify the central event, the people or organizations involved, the relevant background, the concrete consequences, and the next development to watch. Do not pad or repeat. Replace unclear headline language with a self-contained explanation a listener can understand without prior knowledge.

Previous draft:
${result.raw}`);
    words = result.briefing.sections.join(" ").trim().split(/\s+/).length;
  }
  const briefing = result.briefing;
  if (words < plan.minWords || words > plan.maxWords) throw new Error(`Briefing length outside safe range after expansion: ${words} words`);
  briefing.estimated_seconds = plan.seconds;
  briefing.sources = briefing.sources.filter((source) => /^https?:\/\//i.test(source.url)).slice(0, 12);
  if (briefing.sources.length < 2) throw new Error("Briefing returned insufficient sources");
  return briefing;
}

async function fetchNewsFor(preference) {
  const search = topicSearches[preference] || `"${preference}" news`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${search} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, { headers: { "User-Agent": "GoJo/0.1 news briefing prototype" } });
  if (!response.ok) throw new Error(`News search failed: ${response.status}`);
  const xml = await response.text();
  const isBroadTopic = Object.prototype.hasOwnProperty.call(topicSearches, preference);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 14).map((match) => {
    const item = match[1];
    const rawTitle = xmlValue(item, "title");
    const source = xmlValue(item, "source") || rawTitle.split(" - ").pop();
    const title = rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    return { title, source, url: xmlValue(item, "link"), publishedAt: xmlValue(item, "pubDate"), preference };
  }).filter((item) => item.title && item.url && isClearHeadline(item, isBroadTopic));
}

async function handleBriefing(req, res) {
  try {
    const body = await readBody(req);
    if (process.env.OPENAI_API_KEY) {
      try {
        const generated = await generateModelBriefing(body);
        return json(res, 200, generated);
      } catch (error) {
        console.error("Model briefing unavailable:", error.message);
        return json(res, 502, { error: "The full briefing could not be researched safely", code: "MODEL_BRIEFING_UNAVAILABLE" });
      }
    }
    const topics = Array.isArray(body.topics) ? body.topics.filter(Boolean).slice(0, 3) : [];
    const follows = String(body.follows || "").trim();
    const queries = [...new Set([...topics, ...(follows && follows !== "Other" ? [follows] : [])])].slice(0, 4);
    if (!queries.length) queries.push("top news");

    const results = await Promise.allSettled(queries.map(fetchNewsFor));
    const seen = new Set();
    const stories = [];
    for (let queryIndex = 0; queryIndex < results.length; queryIndex++) {
      const result = results[queryIndex];
      if (result.status !== "fulfilled") continue;
      const candidate = result.value.find((item) => {
        const fingerprint = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      });
      if (candidate) stories.push(candidate);
      if (stories.length === 4) break;
    }
    if (stories.length < 2) throw new Error("Not enough current stories returned");

    const name = String(body.name || "there").trim().slice(0, 40);
    const spokenDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long", month: "long", day: "numeric"
    }).format(new Date());
    const requestedMinutes = [1, 2, 5].includes(Number.parseInt(body.length, 10)) ? Number.parseInt(body.length, 10) : 5;
    const focus = topics.length ? topics.join(", ") : "your priorities";
    const sections = [
      `${name}, today is ${spokenDate}.`,
      ...stories.map((story, index) => `${index === 0 ? "Your lead" : index === 1 ? "Next" : "One more development"} is in ${story.preference}. ${story.source} reports: ${story.title.replace(/[.!?]+$/, "")}.`),
      `That is your ${requestedMinutes}-minute GoJo briefing for now. Your next edition will keep learning from what you follow, skip, and ask to hear more about.`
    ];
    json(res, 200, {
      title: stories.map((story) => story.preference).slice(0, 2).join(" + ") + ", right now",
      estimated_seconds: requestedMinutes * 60,
      sections,
      sources: stories.map((story) => ({ label: `${story.source} — ${story.title}`, url: story.url, publishedAt: story.publishedAt }))
    });
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not curate a live briefing", code: "BRIEFING_UNAVAILABLE" });
  }
}

function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(root, requested);
  if (!filePath.startsWith(root + path.sep)) return json(res, 403, { error: "Forbidden" });

  fs.readFile(filePath, (error, data) => {
    if (error) return json(res, error.code === "ENOENT" ? 404 : 500, { error: "Not found" });
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

async function handler(req, res) {
  if (req.method === "POST" && req.url === "/api/tts") return handleTts(req, res);
  if (req.method === "POST" && req.url === "/api/briefing") return handleBriefing(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  json(res, 405, { error: "Method not allowed" });
}

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(port, () => {
    console.log(`GoJo listening at http://localhost:${port}`);
    console.log(process.env.ELEVENLABS_API_KEY ? "ElevenLabs voice: ready" : "ElevenLabs voice: add ELEVENLABS_API_KEY to enable");
  });
}

module.exports = handler;
