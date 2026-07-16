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

## Local development

Requirements:

- Node.js 18 or newer
- An OpenAI API key
- An ElevenLabs API key

Clone the repository and enter the project directory:

```bash
git clone https://github.com/soupsoup/gojo.git
cd gojo
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your API credentials to `.env`, then start the app:

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173).

Run the syntax checks with:

```bash
npm run check
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Researches current news and generates the structured briefing. |
| `OPENAI_SUMMARY_MODEL` | No | Overrides the briefing model. The server provides a default. |
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

1. Import the repository into Vercel.
2. Add the required environment variables to the Vercel project.
3. Deploy the project.

From the Vercel CLI, an already linked project can be deployed with:

```bash
vercel deploy --prod
```

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
