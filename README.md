# GoJo

GoJo turns a listener’s interests into a fast, sourced audio alert wire. During onboarding, the listener selects three main topics, chooses up to five subtopics within each, and ranks the main topics in the order they want to hear them. GoJo researches current reporting, writes compact factual alerts, and narrates each item with a rotating cast of ElevenLabs voices.

The current product is a web prototype built around short, useful updates rather than a fixed runtime. It also includes an email proof of concept containing the written alerts and a link to play the same rundown online.

## What it does

- Voice-assisted onboarding with preset topic and subtopic bubbles
- Drag-and-drop control over the audio rundown order
- Current-news research and briefing generation with OpenAI web search
- Story-specific alerts covering developments, decisions, schedules, deadlines, countdowns, and verified status updates
- Natural spoken attribution in every alert, such as “According to Reuters” or “The Mets announced”
- Source provenance taken from the search tool, with URLs checked before an alert is published
- Event-level deduplication across overlapping main topics, subtopics, headlines, and publishers
- Hard limits that prevent commentary and filler from expanding each alert
- Multi-voice ElevenLabs narration with a primary host and alternating correspondents
- Source links for the reporting used in each briefing
- Responsive web player with transcript and source display
- Email briefing proof of concept at `/email-preview`

## How the briefing is built

1. The listener chooses exactly three main topics.
2. The listener chooses between one and five subtopics for each main topic.
3. The listener ranks the three main topics.
4. The browser sends the ordered profile to `POST /api/briefing`.
5. The server asks OpenAI to research recent reporting and return a sourced, structured script.
6. The browser sends the script’s sections to `POST /api/tts`.
7. ElevenLabs generates one continuous audio rundown using different voices for the date stamp and alert items.

If a selected topic does not have a consequential, reliably sourced development, the editorial prompt instructs the model to skip it instead of forcing a weak story.

## Technology

- Vanilla HTML, CSS, and JavaScript
- Node.js HTTP server
- OpenAI Responses API with web search
- ElevenLabs Text to Dialogue and Text to Speech APIs
- Vercel Functions and static hosting

No frontend framework or build step is required.

## How Codex and GPT-5.6 were used

Codex was the development partner used to take GoJo from an early product idea to a working, deployed prototype. It helped:

- Plan and repeatedly revise the onboarding, topic-ranking, player, and email experiences
- Write and refactor the HTML, CSS, browser JavaScript, Node.js server, and Vercel function
- Connect the OpenAI and ElevenLabs APIs
- Test the application locally and diagnose failures in the briefing and audio flows
- Improve the editorial system after reviewing real output, including source-page verification, unsupported-alert filtering, and event-level deduplication
- Prepare documentation, manage the private GitHub repository, and deploy the application to Vercel

GPT-5.6 Terra is the default runtime editorial model in `server.js`. For each briefing, the server sends the listener's ordered interests to the OpenAI Responses API. GPT-5.6 uses the web-search tool to research current reporting, then returns a structured JSON rundown containing short, attributed alerts and direct source links. The server subsequently validates the sources, filters unsupported items, and removes overlapping stories before sending the script to ElevenLabs for narration.

These are separate roles: Codex was used to build and iterate on the product; GPT-5.6 powers the live news-research and script-generation workflow inside the product. ElevenLabs, rather than GPT-5.6, generates the spoken audio.

## Local setup

Requirements:

- Node.js 18 or newer
- An OpenAI API key
- An ElevenLabs API key
- Git access to the private repository

Clone the repository and enter the project directory:

```bash
git clone https://github.com/soupsoup/gojo.git
cd gojo
```

The project currently has no third-party npm packages, so there is no required dependency-install step. If dependencies are added later, run `npm install` before starting the server.

Create a local environment file:

```bash
cp .env.example .env
```

Open `.env` and configure at least:

```dotenv
OPENAI_API_KEY=your_openai_api_key
OPENAI_SUMMARY_MODEL=gpt-5.6-terra
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

The application code defaults to `gpt-5.6-terra` when `OPENAI_SUMMARY_MODEL` is absent. The example environment file may specify another model for lower-cost development, so set the variable explicitly when you want to test the production GPT-5.6 workflow.

Start the local server:

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173).

Complete onboarding by choosing three main topics, selecting up to five subtopics for each, and ranking the main topics. Creating a rundown makes live OpenAI web-search and ElevenLabs API requests, which may incur usage charges.

Run the syntax checks with:

```bash
npm run check
```

If the server reports that a voice or briefing is unavailable, confirm that the relevant key is present in `.env`, restart `npm start`, and inspect the terminal response for the upstream API error.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Researches current news and generates the structured briefing. |
| `OPENAI_SUMMARY_MODEL` | No | Overrides the editorial model; defaults to `gpt-5.6-terra` in `server.js`. |
| `ELEVENLABS_API_KEY` | Yes | Generates onboarding and briefing audio. |
| `ELEVENLABS_VOICE_ID` | No | Primary GoJo host voice. |
| `ELEVENLABS_VOICE_ID_2` | No | First correspondent voice. |
| `ELEVENLABS_VOICE_ID_3` | No | Second correspondent voice. |
| `ELEVENLABS_VOICE_ID_4` | No | Third correspondent voice. |
| `ELEVENLABS_MODEL_ID` | No | Model used for standard single-voice prompts. |
| `PORT` | No | Local server port; defaults to `4173`. |

The app includes default ElevenLabs voice IDs, but explicitly configuring the four voice IDs is recommended so the lineup remains under your control.

Never commit `.env`. It is excluded by `.gitignore`.

## Routes

| Route | Description |
| --- | --- |
| `/` | Onboarding and audio briefing player |
| `/email-preview` | Browser-rendered email proof of concept |
| `POST /api/briefing` | Researches and creates a personalized briefing |
| `POST /api/tts` | Generates single-voice or multi-voice audio |

The email proof-of-concept audio link can launch the locked demo edition with:

```text
/?autoplay=1&source=email
```

## Deploying to Vercel

The repository includes `vercel.json`; no separate build command is required.

1. Import the private GitHub repository into Vercel and grant Vercel access to it.
2. Add `OPENAI_API_KEY`, `OPENAI_SUMMARY_MODEL=gpt-5.6-terra`, and `ELEVENLABS_API_KEY` in **Project Settings → Environment Variables**.
3. Add any custom ElevenLabs voice IDs you want to keep consistent across environments.
4. Apply the variables to Production, Preview, and Development as appropriate.
5. Deploy the project.

From the Vercel CLI, an already linked project can be deployed with:

```bash
vercel deploy --prod
```

After changing an environment variable, redeploy so the serverless function receives the new value.

Because API credentials are read only on the server, they should be configured as Vercel environment variables and must never be exposed in browser code.

## Project structure

```text
.
├── api/[...path].js          # Vercel function entry point
├── app.js                    # Onboarding, profile, player, and browser logic
├── server.js                 # API routes, news curation, and voice generation
├── index.html                # Main application
├── styles.css                # Application design system and responsive styles
├── email-preview.html        # Email briefing proof of concept
├── email-poc-briefing.json   # Locked demo script used by email playback
├── vercel.json               # Hosting and route configuration
└── outputs/                  # Supporting project artifacts
```

## Current prototype constraints

- Listener profiles are stored in browser `localStorage`; there is no account system or database yet.
- Scheduled email delivery is represented by a proof of concept and is not yet an automated production workflow.
- Alert volume depends on the number of useful, verified developments available.
- Freeform topics, tone selection, depth selection, and delivery-time controls remain in the code behind disabled feature flags for possible future use.
