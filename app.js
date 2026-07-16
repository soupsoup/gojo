const subtopicsByMainTopic = {
  "World": ["Geopolitics", "Global economy", "Conflict + security", "Climate diplomacy", "Human rights", "Migration", "International trade", "Asia", "Europe", "Middle East", "Africa", "Latin America"],
  "U.S.": ["Federal policy", "Courts", "Elections", "Cities + states", "Education", "Immigration", "Housing", "Labor", "Public safety", "Transportation", "Social policy", "Local government"],
  "Technology": ["Artificial intelligence", "Cybersecurity", "Big Tech", "Startups", "Consumer tech", "Space", "Semiconductors", "Robotics", "Enterprise software", "Social platforms", "Tech policy", "Venture capital"],
  "Business": ["Markets", "Companies", "Economy", "Media", "Leadership", "Future of work", "Retail", "Real estate", "Banking", "Energy", "Trade", "Small business"],
  "Politics": ["White House", "Congress", "Campaigns", "Public policy", "Political movements", "Governors", "Voting rights", "Foreign policy", "Political media", "Polling", "Regulation", "State legislatures"],
  "Science": ["Health research", "Climate science", "Energy", "Space science", "Biotechnology", "Medicine", "Public health", "Environment", "Physics", "Genetics", "Oceans", "Scientific policy"],
  "Culture": ["Film", "Television", "Music", "Books", "Art + design", "Food", "Theater", "Fashion", "Gaming", "Architecture", "Museums", "Celebrity"],
  "Sports": ["Baseball", "Basketball", "Football", "Soccer", "Tennis", "Motorsport", "Hockey", "Golf", "College sports", "Olympics", "Combat sports", "Sports business"]
};

// Keep the variable-duration experience ready for a future release without
// exposing it in onboarding yet.
const ENABLE_BRIEFING_LENGTH = false;
// Keep the freeform topic builder ready for a future release without exposing
// it in the current onboarding flow.
const ENABLE_FREEFORM_TOPICS = false;
// Keep briefing depth and delivery-tone controls ready for a later release.
const ENABLE_STYLE_SETTINGS = false;
// Keep delivery scheduling ready for a future release.
const ENABLE_DELIVERY_SETTINGS = false;

const subtopicQuestions = [0, 1, 2].map((topicIndex) => ({
  key: `subtopics${topicIndex + 1}`,
  kicker: (profile) => `${profile.mainTopics?.[topicIndex] || "Your topic"} · fine tuning`,
  question: (profile) => `What matters most in ${profile.mainTopics?.[topicIndex] || "this topic"}?`,
  hint: "Choose up to five subtopics.",
  multi: true,
  max: 5,
  options: (profile) => subtopicsByMainTopic[profile.mainTopics?.[topicIndex]] || [],
  when: (profile) => Boolean(profile.mainTopics?.[topicIndex])
}));

const questions = [
  { key: "topicMode", kicker: "First, choose your route", question: "How do you want to tune your GoJo?", hint: "Start from your own exact priorities, or explore our editorial map.", options: ["Enter and rank my topics", "Explore topic bubbles"], when: () => ENABLE_FREEFORM_TOPICS },
  { key: "topics", kicker: "Build your priority list", question: "What should GoJo track first?", hint: "Enter topics from most to least important, separated by commas.", tags: true, when: (profile) => ENABLE_FREEFORM_TOPICS && profile.topicMode === "Enter and rank my topics" },
  { key: "mainTopics", kicker: "Choose your main signals", question: "Which parts of the world should lead your briefing?", hint: "Choose exactly three. We’ll open each one into more precise subtopics next.", multi: true, min: 3, max: 3, options: Object.keys(subtopicsByMainTopic), when: (profile) => !ENABLE_FREEFORM_TOPICS || profile.topicMode === "Explore topic bubbles" },
  ...subtopicQuestions,
  { key: "briefingOrder", kicker: "Set your rundown", question: "What should you hear first?", hint: "Drag your three main topics into the order you want them to appear in your audio briefing.", rank: true, when: (profile) => !ENABLE_FREEFORM_TOPICS || profile.topicMode === "Explore topic bubbles" },
  { key: "length", kicker: "Set the runtime", question: "How long should your briefing be?", hint: "Choose a quick signal or make room for more context.", options: ["1 minute", "2 minutes", "5 minutes"], when: () => ENABLE_BRIEFING_LENGTH },
  { key: "depth", kicker: "Set the depth", question: "How should your briefing feel?", hint: "Choose how much explanation belongs behind each headline.", options: ["Headlines only", "Headlines + context", "Explain why it matters"], when: () => ENABLE_STYLE_SETTINGS },
  { key: "tone", kicker: "Choose the voice", question: "What tone should greet you?", hint: "The reporting stays factual. The delivery is yours.", options: ["Straight + neutral", "Calm", "Conversational", "Energetic"], when: () => ENABLE_STYLE_SETTINGS },
  { key: "delivery", kicker: "Pick the moment", question: "When should your briefing arrive?", hint: "This prototype saves your preferred morning window.", options: ["6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "On my first commute"], when: () => ENABLE_DELIVERY_SETTINGS },
  { key: "name", kicker: "One last thing", question: "What should your GoJo call you?", hint: "Say your name or type it below.", text: true }
];

const todayBriefing = {
  title: "AI momentum meets a riskier market",
  sections: [
    "{{name}}, today is Wednesday, July fifteenth. Artificial intelligence is again becoming a familiar force in the market.",
    "Technology shares are leading markets higher today after several uneven weeks. As of midmorning Eastern time, the S and P five hundred was up four-tenths of a percent, while the Nasdaq had gained six-tenths. Companies tied to the artificial-intelligence buildout were among the leaders. But this is not a simple risk-on story. Oil remains near a one-month high because of the war with Iran, leaving investors to balance enthusiasm for technology against higher energy costs and geopolitical uncertainty.",
    "One reason the AI trade still has support is demand for the physical infrastructure behind it. Dutch chip-equipment leader A S M L has said demand for advanced chips is outpacing supply as customers accelerate capacity plans. The company raised its twenty twenty-six sales outlook earlier this year to between thirty-six and forty billion euros. The takeaway: even as individual AI products change quickly, spending on the machines needed to manufacture advanced chips remains a powerful business signal.",
    "And a useful reality check on adoption: a new study of S and P five hundred companies found that eleven percent had deeply integrated AI into business processes by twenty twenty-five, with another ten percent using it in production or service delivery. That is more than four times the adoption measured in twenty twenty-two—but deep adoption is still concentrated in technology companies, which account for roughly two-thirds of the total.",
    "So today’s signal is this: markets are rewarding AI momentum again, while the underlying data says the transformation is real—but still far from evenly distributed. That’s your GoJo briefing."
  ],
  sources: [
    { label: "Associated Press — Technology stocks lead markets higher", url: "https://www.local10.com/business/2026/07/15/technology-stocks-lead-markets-higher-while-oil-prices-keep-rising/" },
    { label: "ASML — First-quarter 2026 financial results and outlook", url: "https://www.asml.com/en/news/press-releases/2026/q1-2026-financial-results" },
    { label: "arXiv — AI Adoption in S&P 500 Firms", url: "https://arxiv.org/abs/2607.08920" }
  ]
};

let activeBriefingScript = todayBriefing.sections.join(" ").replace("{{name}}", "there");
let activeBriefingSections = [...todayBriefing.sections];

let step = 0;
let answers = {};
let speaking = false;
let recognition;
let preferredVoice;
let generatedAudio;
let generatedAudioUrl;
let audioLoading = false;
let activeStudioAudio;
const launchParams = new URLSearchParams(window.location.search);
let autoplayRequested = launchParams.get("autoplay") === "1";
// Older test emails predate explicit edition IDs. Preserve those links by
// resolving any email launch to the locked POC briefing.
const requestedBriefingId = launchParams.get("briefing")
  || (launchParams.get("source") === "email" ? "email-poc-001" : null);
const studioVoiceCache = new Map();

const $ = (id) => document.getElementById(id);
const views = [$("welcomeView"), $("setupView"), $("briefingView")];

function activeQuestions() {
  return questions.filter((question) => !question.when || question.when(answers));
}

function currentQuestion() {
  return activeQuestions()[step];
}

function showView(view) {
  views.forEach((item) => item.classList.toggle("hidden", item !== view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function chooseNaturalVoice() {
  const voices = speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
  const preferredNames = [
    "Ava", "Samantha", "Zoe", "Nathan", "Evan", "Tom",
    "Flo", "Daniel", "Google US English", "Microsoft Aria"
  ];
  preferredVoice = preferredNames
    .map((name) => voices.find((voice) => voice.name.includes(name)))
    .find(Boolean) || voices.find((voice) => voice.localService) || voices[0];
}

if ("speechSynthesis" in window) {
  chooseNaturalVoice();
  speechSynthesis.addEventListener("voiceschanged", chooseNaturalVoice);
}

function speakWithDeviceVoice(text, onend, options = {}) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = preferredVoice || null;
  utterance.rate = options.preview ? 0.91 : 0.94;
  utterance.pitch = options.preview ? 1.01 : 0.98;
  utterance.volume = 0.94;
  utterance.onend = () => { speaking = false; onend?.(); };
  speaking = true;
  speechSynthesis.speak(utterance);
}

function stopSpokenVoice() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (activeStudioAudio) {
    activeStudioAudio.pause();
    activeStudioAudio.currentTime = 0;
  }
  speaking = false;
}

async function speak(text, onend, options = {}) {
  stopSpokenVoice();
  speaking = true;
  try {
    let audioUrl = studioVoiceCache.get(text);
    if (!audioUrl) {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error("TTS_UNAVAILABLE");
      audioUrl = URL.createObjectURL(await response.blob());
      studioVoiceCache.set(text, audioUrl);
    }
    activeStudioAudio = new Audio(audioUrl);
    activeStudioAudio.onended = () => { speaking = false; onend?.(); };
    activeStudioAudio.onerror = () => { speaking = false; speakWithDeviceVoice(text, onend, options); };
    await activeStudioAudio.play();
  } catch (error) {
    speaking = false;
    speakWithDeviceVoice(text, onend, options);
  }
}

function renderQuestion() {
  const q = currentQuestion();
  if (q.rank && (!Array.isArray(answers[q.key])
    || answers[q.key].length !== (answers.mainTopics || []).length
    || answers[q.key].some((topic) => !(answers.mainTopics || []).includes(topic)))) {
    answers[q.key] = [...(answers.mainTopics || [])];
  }
  const sequence = activeQuestions();
  $("stepCounter").textContent = `${String(step + 1).padStart(2, "0")} / ${String(sequence.length).padStart(2, "0")}`;
  const questionKicker = typeof q.kicker === "function" ? q.kicker(answers) : q.kicker;
  const questionText = typeof q.question === "function" ? q.question(answers) : q.question;
  const questionHint = typeof q.hint === "function" ? q.hint(answers) : q.hint;
  $("questionKicker").textContent = questionKicker;
  $("questionText").textContent = questionText;
  $("questionHint").textContent = questionHint;
  $("choices").innerHTML = "";
  $("voiceInput").classList.toggle("hidden", !(q.text || q.tags));
  $("customInput").value = q.tags
    ? (Array.isArray(answers[q.key]) ? answers[q.key].join(", ") : (answers[q.key] || ""))
    : q.text ? (answers[q.key] || "") : "";
  $("customInput").placeholder = q.tags
    ? "e.g. AI copyright lawsuits, New York Mets prospects, independent film distribution"
    : q.text ? "Type your name…" : "Tell us what you follow…";
  renderRankedTopics();

  if (q.options) {
    const options = typeof q.options === "function" ? q.options(answers) : q.options;
    options.forEach((option) => {
      const button = document.createElement("button");
      button.className = `choice${option === "Other" ? " other" : ""}`;
      button.textContent = option;
      const saved = Array.isArray(answers[q.key]) ? answers[q.key] : [answers[q.key]];
      if (saved.includes(option)) button.classList.add("selected");
      button.addEventListener("click", () => selectOption(button, option, q));
      $("choices").appendChild(button);
    });
  }
  updateNextState();
  setTimeout(() => speak(`${questionText} ${questionHint}`), 300);
}

function renderRankedTopics() {
  const container = $("rankedTopics");
  const q = currentQuestion();
  container.innerHTML = "";
  container.classList.toggle("hidden", !(q?.tags || q?.rank));
  if (!(q?.tags || q?.rank)) return;
  const topics = Array.isArray(answers[q.key]) ? answers[q.key] : [];
  topics.forEach((topic, index) => {
    const item = document.createElement("div");
    item.className = "ranked-topic";
    item.draggable = true;
    item.dataset.index = index;
    item.innerHTML = `<i aria-hidden="true">⠿</i><b>${String(index + 1).padStart(2, "0")}</b><span></span><button type="button" aria-label="Move ${topic} up">↑</button><button type="button" aria-label="Move ${topic} down">↓</button>`;
    item.querySelector("span").textContent = topic;
    const buttons = item.querySelectorAll("button");
    buttons[0].disabled = index === 0;
    buttons[1].disabled = index === topics.length - 1;
    buttons[0].addEventListener("click", () => moveRankedTopic(index, -1));
    buttons[1].addEventListener("click", () => moveRankedTopic(index, 1));
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      reorderRankedTopic(Number(event.dataTransfer.getData("text/plain")), index);
    });
    container.appendChild(item);
  });
}

function moveRankedTopic(index, direction) {
  const q = currentQuestion();
  const topics = [...(answers[q.key] || [])];
  [topics[index], topics[index + direction]] = [topics[index + direction], topics[index]];
  answers[q.key] = topics;
  if (q.tags) $("customInput").value = topics.join(", ");
  renderRankedTopics();
}

function reorderRankedTopic(fromIndex, toIndex) {
  if (!Number.isInteger(fromIndex) || fromIndex === toIndex) return;
  const q = currentQuestion();
  const topics = [...(answers[q.key] || [])];
  const [moved] = topics.splice(fromIndex, 1);
  topics.splice(toIndex, 0, moved);
  answers[q.key] = topics;
  renderRankedTopics();
  updateNextState();
}

function selectOption(button, option, q) {
  if (q.multi) {
    const selected = [...document.querySelectorAll(".choice.selected")];
    if (!button.classList.contains("selected") && selected.length >= q.max) {
      toast(`Choose up to ${q.max}`);
      return;
    }
    button.classList.toggle("selected");
    answers[q.key] = [...document.querySelectorAll(".choice.selected")].map((el) => el.textContent);
  } else {
    document.querySelectorAll(".choice").forEach((el) => el.classList.remove("selected"));
    button.classList.add("selected");
    answers[q.key] = option;
  }
  if (option === "Other") {
    $("voiceInput").classList.remove("hidden");
    $("customInput").placeholder = "Type your answer…";
    $("customInput").focus();
  }
  updateNextState();
}

function updateNextState() {
  const q = currentQuestion();
  const value = (q.text || q.tags) ? $("customInput").value.trim() : answers[q.key];
  const valueCount = Array.isArray(value) ? value.length : value ? 1 : 0;
  $("nextButton").disabled = valueCount < (q.min || 1);
  $("nextButton").innerHTML = step === activeQuestions().length - 1 ? "Create my briefing <span>→</span>" : "Continue <span>→</span>";
}

function completeSetup() {
  if (!ENABLE_BRIEFING_LENGTH) answers.length = "5 minutes";
  if (!ENABLE_FREEFORM_TOPICS || answers.topicMode === "Explore topic bubbles") {
    answers.topicMode = "Explore topic bubbles";
    const mainTopicOrder = answers.briefingOrder?.length ? answers.briefingOrder : (answers.mainTopics || []);
    const selectedByMainTopic = new Map((answers.mainTopics || []).map((mainTopic, index) => [mainTopic, answers[`subtopics${index + 1}`] || []]));
    answers.topicGroups = mainTopicOrder.map((mainTopic) => ({
      mainTopic,
      subtopics: selectedByMainTopic.get(mainTopic) || []
    }));
    const detailedTopics = answers.topicGroups.flatMap(({ mainTopic, subtopics }) =>
      subtopics.map((subtopic) => `${mainTopic}: ${subtopic}`));
    answers.topics = detailedTopics.length ? detailedTopics : [...(answers.topics || [])];
  }
  localStorage.setItem("newsdj-profile", JSON.stringify(answers));
  $("listenerName").textContent = `${answers.name || "listener"}.`;
  const topicValues = Array.isArray(answers.topics)
    ? answers.topics
    : answers.topics ? [answers.topics] : [];
  answers.topics = topicValues;
  const topics = (answers.topicGroups || []).map((group) => group.mainTopic).join(", ") || topicValues.join(", ");
  const minutes = Number.parseInt(answers.length, 10) || 5;
  $("recordDuration").textContent = `${minutes}:00`;
  $("durationDisplay").textContent = `${minutes}:00`;
  $("profileSummary").textContent = `Your briefing tracks ${topics || "your priorities"} in the order you chose.`;
  $("briefingTitle").textContent = "Curating your news…";
  $("todayDate").textContent = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase();
  $("transcript").innerHTML = "<p>Scanning today’s reporting against your priorities…</p>";
  $("sourceList").innerHTML = "";
  showView($("briefingView"));
  curateBriefing(answers);
}

function renderBriefing(briefing) {
  $("playButton").disabled = false;
  $("briefingTitle").textContent = briefing.title;
  if (briefing.estimated_seconds) {
    const minutes = Math.max(1, Math.round(briefing.estimated_seconds / 60));
    $("recordDuration").textContent = `${minutes}:00`;
    $("durationDisplay").textContent = `${minutes}:00`;
  }
  const spokenSections = briefing.audio_sections || briefing.sections;
  activeBriefingSections = spokenSections.map((section) => section.replace("{{name}}", answers.name || "there"));
  activeBriefingScript = activeBriefingSections.join(" ");
  $("transcript").innerHTML = spokenSections
    .map((section) => `<p>${section.replace("{{name}}", answers.name || "there")}</p>`)
    .join("");
  $("sourceList").innerHTML = briefing.sources
    .map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label} ↗</a>`)
    .join("");
  generatedAudio = null;
  if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
  generatedAudioUrl = null;
}

async function curateBriefing(profile) {
  try {
    const response = requestedBriefingId === "email-poc-001"
      ? await fetch("/email-poc-briefing.json")
      : await fetch("/api/briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile)
        });
    if (!response.ok) throw new Error("BRIEFING_UNAVAILABLE");
    const briefing = await response.json();
    renderBriefing(briefing);
    if (autoplayRequested) {
      autoplayRequested = false;
      await playBriefing();
    } else {
      speak(`You are all tuned, ${profile.name}. I curated your first briefing from today's reporting, and it is ready now.`);
    }
  } catch (error) {
    $("briefingTitle").textContent = "Briefing unavailable";
    $("transcript").innerHTML = "<p>I couldn’t complete the full research pass, so I’ve held this edition rather than give you an under-explained headline list. Please try again in a moment.</p>";
    $("sourceList").innerHTML = "";
    $("playButton").disabled = true;
    toast("The research pass failed. No incomplete briefing was published.");
  }
}

function beginListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { toast("Voice input isn’t supported here—tap or type instead."); return; }
  stopSpokenVoice();
  recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.onstart = () => { $("voiceOrb").classList.add("listening"); $("listenButton").querySelector("b").textContent = "Listening…"; };
  recognition.onend = () => { $("voiceOrb").classList.remove("listening"); $("listenButton").querySelector("b").textContent = "Answer aloud"; };
  recognition.onerror = () => toast("I didn’t catch that. Try again or tap an answer.");
  recognition.onresult = (event) => applyVoiceAnswer(event.results[0][0].transcript);
  recognition.start();
}

function applyVoiceAnswer(text) {
  const q = currentQuestion();
  if (q.rank) {
    toast("Drag the rows or use the arrow buttons to set your rundown.");
    return;
  }
  if (q.text || q.tags || text.toLowerCase().startsWith("other")) {
    $("voiceInput").classList.remove("hidden");
    $("customInput").value = text.replace(/^other\s*/i, "");
    answers[q.key] = q.tags
      ? $("customInput").value.split(",").map((item) => item.trim()).filter(Boolean)
      : $("customInput").value.trim();
  } else {
    const options = typeof q.options === "function" ? q.options(answers) : q.options;
    const matches = options.filter((option) => text.toLowerCase().includes(option.toLowerCase().replace("u.s.", "us")));
    if (!matches.length) { toast(`I heard “${text}”—tap the closest option.`); return; }
    matches.slice(0, q.max || 1).forEach((match) => {
      const button = [...document.querySelectorAll(".choice")].find((el) => el.textContent === match);
      if (button && !button.classList.contains("selected")) selectOption(button, match, q);
    });
  }
  updateNextState();
}

function setPlaybackState(active) {
  document.querySelector(".player-card").classList.toggle("playing", active);
  $("playButton").textContent = active ? "Ⅱ" : "▶";
  $("previewButton").innerHTML = active ? '<span class="play-mini">Ⅱ</span> Pause preview' : '<span class="play-mini">▶</span> Hear a 20-sec preview';
}

async function playBriefing() {
  const card = document.querySelector(".player-card");
  if (generatedAudio && !generatedAudio.paused) {
    generatedAudio.pause();
    setPlaybackState(false);
    return;
  }
  if (speaking) {
    stopSpokenVoice(); setPlaybackState(false); return;
  }
  if (audioLoading) return;
  audioLoading = true;
  // Keep the user's click associated with audio playback while the studio voice
  // is generated. Safari can otherwise block the MP3 after the async request.
  if (!generatedAudio) {
    const unlockAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA");
    unlockAudio.volume = 0;
    void unlockAudio.play().catch(() => {});
  }
  $("previewButton").innerHTML = '<span class="play-mini">●</span> Preparing voice…';
  const voicedScript = activeBriefingScript
    .replace("preview.", "preview. —")
    .replace("priorities,", "priorities…")
    .replace("publication time.", "publication time. —")
    .replace("first.", "first…");
  try {
    if (!generatedAudio) {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          text: voicedScript,
          segments: activeBriefingSections.map((section) => section
            .replace("preview.", "preview. —")
            .replace("priorities,", "priorities…")
            .replace("publication time.", "publication time. —")
            .replace("first.", "first…"))
        })
      });
      if (!response.ok) throw new Error((await response.json()).code || "TTS_FAILED");
      const blob = await response.blob();
      generatedAudioUrl = URL.createObjectURL(blob);
      generatedAudio = new Audio(generatedAudioUrl);
      generatedAudio.addEventListener("ended", () => setPlaybackState(false));
      generatedAudio.addEventListener("pause", () => setPlaybackState(false));
      generatedAudio.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(generatedAudio.duration)) return;
        const minutes = Math.floor(generatedAudio.duration / 60);
        const seconds = Math.floor(generatedAudio.duration % 60).toString().padStart(2, "0");
        $("durationDisplay").textContent = `${minutes}:${seconds}`;
      });
    }
    setPlaybackState(true);
    await generatedAudio.play();
  } catch (error) {
    if (generatedAudio && error?.name === "NotAllowedError") {
      toast("Your natural voice is ready. Tap play once more to begin.");
      setPlaybackState(false);
      return;
    }
    const message = error.message === "TTS_NOT_CONFIGURED"
      ? "Add your ElevenLabs API key to enable the studio voice."
      : "The natural briefing voice is temporarily unavailable. Please try again.";
    toast(message);
    setPlaybackState(false);
  } finally {
    audioLoading = false;
  }
}

function toast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

for (let i = 0; i < 58; i++) {
  const bar = document.createElement("i");
  bar.style.height = `${8 + Math.abs(Math.sin(i * 1.7)) * 28}px`;
  $("waveform").appendChild(bar);
}

$("startButton").addEventListener("click", () => { step = 0; answers = {}; showView($("setupView")); renderQuestion(); });
$("retuneButton").addEventListener("click", () => {
  step = 0;
  answers = JSON.parse(localStorage.getItem("newsdj-profile") || "{}");
  showView($("setupView"));
  renderQuestion();
});
$("previewButton").addEventListener("click", playBriefing);
$("listenButton").addEventListener("click", beginListening);
$("customInput").addEventListener("input", () => {
  const q = currentQuestion();
  answers[q.key] = q.tags
    ? $("customInput").value.split(",").map((item) => item.trim()).filter(Boolean)
    : $("customInput").value.trim();
  renderRankedTopics();
  updateNextState();
});
$("nextButton").addEventListener("click", () => {
  stopSpokenVoice();
  if (step < activeQuestions().length - 1) {
    step++;
    renderQuestion();
    return;
  }
  $("nextButton").disabled = true;
  $("nextButton").innerHTML = 'Creating your briefing <span>→</span>';
  try {
    completeSetup();
  } catch (error) {
    console.error("Could not complete onboarding", error);
    $("nextButton").disabled = false;
    $("nextButton").innerHTML = 'Create my briefing <span>→</span>';
    toast("I couldn’t save that profile. Please try again.");
  }
});
$("playButton").addEventListener("click", playBriefing);
$("editButton").addEventListener("click", () => { step = 0; answers = JSON.parse(localStorage.getItem("newsdj-profile") || "{}"); showView($("setupView")); renderQuestion(); });

const saved = localStorage.getItem("newsdj-profile");
if (saved) {
  answers = JSON.parse(saved);
  $("startButton").firstChild.textContent = "Open my briefing ";
  $("retuneButton").classList.remove("hidden");
  $("startButton").onclick = (event) => { event.stopImmediatePropagation(); completeSetup(); };
}

if (autoplayRequested) {
  answers = saved ? JSON.parse(saved) : {
    topicMode: "Enter and rank my topics",
    topics: ["Artificial intelligence business strategy", "New York Mets", "Media and streaming", "Financial markets"],
    length: "5 minutes",
    depth: "Explain why it matters",
    tone: "Conversational",
    delivery: "7:00 AM",
    name: "Anthony"
  };
  completeSetup();
}
