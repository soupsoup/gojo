const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { produceNewscast } = require("./audio-production");
const { sendEdition } = require("./email-delivery");

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
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-GoJo-Generated-At": new Date().toISOString()
  });
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
  const editorialProfile = { ...profile };
  delete editorialProfile.email;
  delete editorialProfile.freshnessNonce;
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      alert_count: { type: "integer" },
      sections: { type: "array", minItems: 6, maxItems: 12, items: { type: "string", minLength: 20, maxLength: 260 } },
      sources: {
        type: "array", minItems: 2, maxItems: 20,
        items: {
          type: "object",
          properties: { label: { type: "string" }, url: { type: "string" } },
          required: ["label", "url"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "alert_count", "sections", "sources"],
    additionalProperties: false
  };

  const prompt = `You are the editorial engine for GoJo. Today is ${today}.

Create a personalized daily email briefing for this reader profile:
${JSON.stringify(editorialProfile)}

Treat every selected subtopic as an intentional editorial search query. The topicGroups array contains the reader's three main topics in requested order. Search reporting and official schedules published or materially updated within the last twenty-four hours. Spread stories across all three groups before adding more from one group. Aim for two to four useful stories per group when reliable information exists.

Deduplicate by underlying event, not by headline or source. If one story matches multiple main topics or subtopics, include it only once in the earliest relevant position. Multiple outlets reporting the same announcement, transaction, game, filing, release, or decision are still one alert. Use additional reporting to verify or enrich that single alert, never to create a second version of it.

This is a concise morning email, not a podcast and not an essay. Return exactly 6 to 12 alerts and nothing else; aim for 9 distinct alerts when reliable reporting supports them. Do not write an introduction, greeting, date line, recap, conclusion, or outro. Each alert must communicate one specific reported fact, usually in one sentence, and must never exceed 40 words. Include the central event and one concrete detail only when that detail helps state the fact. Every alert must be a complete factual statement with a subject and verb. A topic label or category-level trend such as “AI infrastructure spending is rising” is not a story and is forbidden.

Name the reporting source inside every story. Use natural attribution such as “According to Reuters,” “Reuters reports,” “The Mets announced,” or “MLB’s schedule lists.” The named source must directly support that exact item. Do not cite aggregators when original reporting, an official announcement, filing, schedule, or primary document is available. Put the matching direct story or document URL in the sources array; do not return section pages, homepages, search pages, or invented URLs.

Never put headings, standalone section labels, “Sources,” or empty strings in the sections array. Prefer concrete developments, decisions, scores, schedules, deadlines, countdowns, filings, releases, and verified status updates. A useful alert may say that nothing changed, for example: “According to the Mets’ transaction log, the team made no roster moves today,” but only when that absence is verified from a current authoritative source. Another valid alert is: “MLB’s schedule lists the Mets against the Dodgers today at 3 p.m. Eastern, with Senga scheduled to start.”

Never stretch a headline into commentary. Do not explain why something matters. Do not speculate, add analysis, recap an alert, preview later items, summarize at the end, or use empty phrases such as “what happens next remains to be seen.” Do not mention runtime, duration, podcast length, or how many minutes the reader is getting.

Begin immediately with the first alert. Do not print raw URLs or use parenthetical citations; weave the source name naturally into the sentence. Do not include markdown.

Use at least two independent credible sources for disputed, political, medical, financial, or developing claims. Prefer original reporting, official documents, league and team schedules, filings, and primary sources. Exclude vague, promotional, sensational, or poorly sourced items.

Every factual claim must be supported by sources you consulted. Return a concise source label and direct URL for each source. Never invent facts, quotations, statistics, context, or URLs. If a story cannot be explained from reliable current reporting, exclude it.`;

  function extractConsultedSources(payload) {
    const found = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) {
        let label;
        try { label = value.title || value.name || new URL(value.url).hostname.replace(/^www\./, ""); }
        catch { label = value.title || value.name || "Source"; }
        found.push({ label: String(label).slice(0, 180), url: value.url });
      }
      Object.values(value).forEach(visit);
    };
    visit(payload);
    return found.filter((source, index, all) =>
      all.findIndex((candidate) => candidate.url === source.url) === index);
  }

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
    return { briefing: JSON.parse(raw), raw, consultedSources: extractConsultedSources(payload) };
  }

  async function verifySources(sources) {
    return Promise.all(sources.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(5_000),
          headers: {
            "User-Agent": "GoJo/0.1 source verifier",
            "Range": "bytes=0-1023"
          }
        });
        return { source, valid: response.status !== 404 && response.status !== 410 };
      } catch {
        return { source, valid: false };
      }
    }));
  }

  let result = await requestBriefing(prompt);
  let consultedSources = [...result.consultedSources];
  const alertIsInvalid = (section) => {
    const wordCount = section.trim().split(/\s+/).filter(Boolean).length;
    return wordCount < 8
      || wordCount > 40
      || /^sources?\s*:?$/i.test(section.trim())
      || /\b(today is|good morning|welcome to|why it matters|in summary|to recap|that(?:'s| is) your gojo)\b/i.test(section);
  };
  if (result.briefing.sections.length < 6
    || result.briefing.sections.length > 12
    || result.briefing.sections.some(alertIsInvalid)) {
    result = await requestBriefing(`${prompt}

The previous draft violated the alert format. Return only 6 to 12 alerts. Each alert must state one specific reported fact, usually in one sentence, with a hard maximum of 40 words. Name the source naturally. Delete introductions, greetings, dates, headings, topic labels, “Sources,” empty strings, commentary, “why it matters,” repetition, previews, recaps, conclusions, and filler.

Previous draft:
${result.raw}`);
    consultedSources = [...consultedSources, ...result.consultedSources];
  }
  let briefing = result.briefing;
  briefing.sections = briefing.sections.map((section) =>
    section.replace(/\s*\((?:source:\s*)?[^()]{2,80}\)\s*$/i, "").trim());
  if (briefing.sections.length < 6 || briefing.sections.length > 12 || briefing.sections.some(alertIsInvalid)) {
    throw new Error("One or more alerts failed the concise factual-statement format");
  }
  const sourceCandidates = [...briefing.sources, ...consultedSources]
    .filter((source, index, all) => source?.url
      && all.findIndex((candidate) => candidate?.url === source.url) === index);
  const sourceChecks = await verifySources(sourceCandidates);
  const verifiedSources = sourceChecks.filter((check) => check.valid).map((check) => check.source);
  const usableSources = verifiedSources.length >= 2 ? verifiedSources : sourceCandidates;
  briefing.sources = usableSources
    .filter((source, index, all) => /^https?:\/\//i.test(source.url)
      && all.findIndex((candidate) => candidate.url === source.url) === index)
    .slice(0, 20);
  if (briefing.sources.length < 2) throw new Error("Briefing returned insufficient sources");
  const sourcedAlerts = briefing.sections.filter((alert) => {
    return /\baccording to\b|\b(reports?|says|said|announced|confirmed|lists|stated)\b/i.test(alert);
  });
  const duplicateStopWords = new Set([
    "according", "reports", "reported", "reporting", "says", "said", "announced", "confirmed",
    "today", "yesterday", "tomorrow", "their", "there", "about", "after", "before", "from", "with",
    "that", "this", "will", "would", "could", "into", "over", "under", "more", "than", "news",
    "sports", "technology", "business", "culture", "politics", "science", "world"
  ]);
  const eventTokens = (alert) => new Set(alert.toLowerCase().match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 3 && !duplicateStopWords.has(token)) || []);
  const uniqueAlerts = [];
  const uniqueTokenSets = [];
  for (const alert of sourcedAlerts) {
    const tokens = eventTokens(alert);
    const isDuplicate = uniqueTokenSets.some((existing) => {
      const shared = [...tokens].filter((token) => existing.has(token)).length;
      const smallerSet = Math.min(tokens.size, existing.size);
      return smallerSet > 0 && shared / smallerSet >= 0.62;
    });
    if (!isDuplicate) {
      uniqueAlerts.push(alert);
      uniqueTokenSets.push(tokens);
    }
  }
  if (uniqueAlerts.length < 6) throw new Error("Briefing returned fewer than six distinct alerts with verified source attribution");
  briefing.sections = uniqueAlerts.slice(0, 12);
  briefing.alert_count = briefing.sections.length;
  briefing.generated_at = new Date().toISOString();
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
      for (const candidate of result.value) {
        const fingerprint = candidate.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        stories.push(candidate);
        if (stories.length === 12) break;
      }
      if (stories.length === 12) break;
    }
    if (stories.length < 6) throw new Error("Fewer than six current stories returned");

    const sections = stories.map((story) => {
      const alert = `${story.source} reports ${story.title.replace(/[.!?]+$/, "")}.`;
      return alert.split(/\s+/).slice(0, 40).join(" ");
    });
    json(res, 200, {
      title: stories.map((story) => story.preference).slice(0, 2).join(" + ") + ", right now",
      alert_count: stories.length,
      sections,
      generated_at: new Date().toISOString(),
      sources: stories.map((story) => ({ label: `${story.source} — ${story.title}`, url: story.url, publishedAt: story.publishedAt }))
    });
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not curate a live briefing", code: "BRIEFING_UNAVAILABLE" });
  }
}

async function handleNewscast(req, res) {
  try {
    const body = await readBody(req);
    if (!body.briefing?.sections?.length) return json(res, 400, { error: "A current briefing is required" });
    const result = await produceNewscast({ briefing: body.briefing, profile: body.profile || {} });
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="gojo-${new Date().toISOString().slice(0, 10)}.mp3"`,
      "Cache-Control": "no-store",
      "X-GoJo-Production": result.production,
      "X-GoJo-Newscast-Id": result.id
    });
    res.end(result.audio);
  } catch (error) {
    console.error("Newscast unavailable:", error.message);
    json(res, 502, { error: "The produced audio edition is temporarily unavailable", code: "NEWSCAST_UNAVAILABLE" });
  }
}

async function handleDailyDelivery(req, res) {
  const expectedSecret = process.env.CRON_SECRET || process.env.GOJO_DELIVERY_SECRET;
  if (!expectedSecret) return json(res, 503, { error: "Daily delivery is not configured" });
  if (expectedSecret && req.headers.authorization !== `Bearer ${expectedSecret}`) {
    return json(res, 401, { error: "Unauthorized" });
  }
  try {
    const supplied = req.method === "POST" ? await readBody(req) : {};
    const configured = process.env.GOJO_DAILY_PROFILE_JSON ? JSON.parse(process.env.GOJO_DAILY_PROFILE_JSON) : {};
    const profile = supplied.profile || configured.profile || configured;
    const to = supplied.to || profile.email || process.env.GOJO_TEST_RECIPIENTS?.split(",").map((item) => item.trim()).filter(Boolean);
    if (!to || (Array.isArray(to) && !to.length)) return json(res, 400, { error: "No delivery recipient is configured" });
    const briefing = await generateModelBriefing({ ...profile, freshnessNonce: crypto.randomUUID() });
    let audio;
    let audioStatus = "attached";
    try {
      audio = (await produceNewscast({ briefing, profile })).audio;
    } catch (error) {
      audioStatus = "text-only-fallback";
      console.error("Daily audio unavailable; sending text edition:", error.message);
    }
    const delivery = await sendEdition({ to, profile, briefing, audio });
    json(res, 200, { ok: true, delivery_id: delivery.id, generated_at: briefing.generated_at, audio: audioStatus });
  } catch (error) {
    console.error("Daily delivery unavailable:", error.message);
    json(res, 502, { error: "Daily edition could not be delivered", code: "DELIVERY_UNAVAILABLE" });
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
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  if (req.method === "POST" && pathname === "/api/tts") return handleTts(req, res);
  if (req.method === "POST" && pathname === "/api/briefing") return handleBriefing(req, res);
  if (req.method === "POST" && pathname === "/api/newscast") return handleNewscast(req, res);
  if ((req.method === "GET" || req.method === "POST") && pathname === "/api/daily-delivery") return handleDailyDelivery(req, res);
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
