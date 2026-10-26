# StreamPilot AI

**Understand your chat. Engage your community. Focus on your stream.**

StreamPilot AI is a co-pilot for Twitch streamers. It reads a channel's public chat, groups repeated viewer questions, detects the topics viewers keep returning to, summarises what is happening, and suggests optional responses. The streamer decides what to say. Nothing is ever posted to Twitch automatically.

## The problem

During a busy stream, hundreds of messages arrive faster than anyone can read them. Important questions, recurring problems and useful suggestions get buried while the streamer is focused on gameplay. StreamPilot answers five questions for the streamer:

1. What is my audience talking about right now?
2. What questions are viewers repeatedly asking?
3. Which messages or topics deserve my attention?
4. How is the community reacting?
5. What should I respond to or investigate next?

## Features

- **Live Twitch chat** over Twitch IRC (WebSocket). The connection reports "Connected" only after Twitch confirms the join. Reconnects use bounded exponential backoff and stop with an explicit error after five attempts.
- **Demo mode** with a scripted, fictional boss-fight chat. It needs no Twitch account and no AI key, and every message is labelled synthetic.
- **Question queue**: similar questions are grouped, with counts, unique askers, representative messages, a "no response detected" indicator and a mark-handled / reopen control.
- **Topics**: recurring terms drawn from real messages, with exact message counts and sample messages.
- **Summaries and recommended actions**: grounded in the batch analysed. If there is too little chat, the app says so.
- **Community reaction**: a keyword-based tone overview, shown with an explicit caveat.
- **Two analysis engines**
  - *Local rules* (default, deterministic, offline). Labelled "Local rules (not AI)".
  - *AI* (optional, Anthropic Messages API). Its output is validated with Zod against a schema. Message references are checked against the batch, and any failure falls back to local rules with the error shown.
- **Live chat view** with search, filters, a pause/resume display (the connection keeps receiving messages while the display is paused) and a bounded buffer.
- **Settings**: analysis interval, automatic analysis, buffer size, AI on/off, demo controls and a confirmed "clear session data" action.

## Quick start

Requirements: **Node.js 22 or newer** (for the built-in WebSocket client) and npm.

```bash
git clone https://github.com/Daluut/streampilot-ai.git
cd streampilot-ai
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000 and click **Try demo** on the Overview page.

> `--legacy-peer-deps` works around an npm resolver crash (`Cannot read properties of null (reading 'edgesOut')`) that occurs when installing the Vitest/jsdom peer graph. If a plain `npm install` works for you, it is not required.

## Configuration

All configuration is optional. The app runs fully in demo and local-rules mode with no environment file. To configure values, copy the template and edit it:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables AI analysis. Read on the server only and never sent to the browser. |
| `ANTHROPIC_MODEL` | Model for AI analysis. Defaults to `claude-haiku-5-5`. |
| `TWITCH_OAUTH_TOKEN` + `TWITCH_LOGIN` | Optional. Authenticate chat with a user token that has the `chat:read` scope. Set both or neither. |
| `TWITCH_IRC_URL` | Twitch IRC WebSocket endpoint. Defaults to `wss://irc-ws.chat.twitch.tv:443`. |

Restart the server after changing environment variables.

## Connecting to Twitch

1. Open **Overview** or **Live Chat** and enter the channel name (letters, digits and underscores, 4–25 characters; a leading `#` is accepted).
2. Click **Connect**. The status moves through *Connecting* to *Connected* only when Twitch confirms the join.

**Authentication.** Reading public chat over Twitch IRC works anonymously: the app sends the documented anonymous read-only login (`justinfan` nickname) and needs no credentials. If Twitch rejects that login, set `TWITCH_OAUTH_TOKEN` and `TWITCH_LOGIN` with a user token that has `chat:read`. The token is read only on the server, is never returned by the API and is never logged. StreamPilot does not implement a full OAuth authorisation-code flow, because read-only chat does not need one. Posting to chat is not implemented, by design.

Automated tests simulate Twitch with a local mock IRC server (see *Testing*). **The real Twitch endpoint has not been verified** from the environment where this project was built, which had no route to Twitch. See *Verification status* below.

## Running the production build

```bash
npm run build
npm run start      # serves on http://localhost:3000
```

## Testing

```bash
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint (Next.js rules)
npm run test        # Vitest: unit and integration tests, no network or credentials needed
npx playwright test # browser journeys against the production build (run `npm run build` first)
npm run check       # typecheck + lint + unit/integration tests + build
```

- **Unit tests** (`tests/unit`): channel validation, IRC parsing (including escaped tags and malformed lines), the Twitch client state machine (handshake, join confirmation, PING/PONG, RECONNECT, backoff, bounded retries, fatal login errors, no reconnect after a user disconnect), question detection and grouping, response matching, sentiment (negation, ambiguity), topic aggregation, the local engine's empty and no-repeat cases, the bounded store (buffer limit, group limit, duplicate ids, handled status, clearing), AI schema validation and error mapping (with a mocked SDK client), and the analysis fallback path.
- **Integration tests** (`tests/integration`): a real WebSocket connection to a local mock IRC server driving the runtime and snapshot, rejected login, invalid channel, and the complete demo-to-analysis pipeline.
- **Browser journeys** (`tests/e2e`, Playwright): loading with empty states, invalid channel input, the demo journey (messages arrive, pause/resume, analysis, question queue with mark-handled and reopen, search and filters, confirmed data clearing), settings validation, navigation and focus, and phone and tablet layouts without horizontal overflow.

No test requires real credentials, and the suite makes no external network calls.

## Architecture

A modular monolith built on Next.js (App Router).

```
src/
  app/                      Pages (Overview, Live Chat, Insights, Question Queue, Settings) and API routes
    api/session             GET snapshot (poll with ?after=<seq>)
    api/connection          POST connect / disconnect
    api/demo                POST start | pause | resume | reset
    api/analysis            POST run analysis now (cooldown and overlap protected)
    api/questions/[id]      PATCH open | handled
    api/settings            PATCH validated settings
    api/data/clear          POST clear session (requires confirm: true)
  components/               React UI (client components, Tailwind styling, lucide icons)
  lib/
    twitch/                 Channel validation, IRC parser, TwitchChatClient (state machine)
    analysis/               Text normalisation, question detection and grouping, sentiment,
                            topics, message kinds, local engine, AI provider (Zod-validated),
                            analyzer (AI with local fallback)
    demo/                   Scripted synthetic chat and deterministic simulator
    state/session-store.ts  Bounded in-memory session state
    runtime.ts              Single active source (live or demo), scheduler, snapshot
    config/                 Server-only environment parsing
    settings/               Setting limits and validation
    runtime-types.ts        Snapshot types shared with the browser (no server imports)
tests/
  unit/ integration/ e2e/
```

**Data flow.** The Twitch client or demo simulator produces raw messages. The store sanitises them, drops duplicate ids, detects questions, assigns a kind, updates question groups and marks responses from the broadcaster. Analysis runs over the most recent 60 messages, either locally or through the AI provider. The browser polls `/api/session` once per second with a sequence cursor and receives only new messages. Settings, actions and handled states go through small JSON endpoints.

**Single source of truth.** The runtime lives on `globalThis`, so route handlers share one instance per server process. A session can be live or demo, never both. Switching sources clears the buffer so live and demo data never mix.

**Security and privacy.**
- Secrets live in environment variables and are read only on the server. The settings API reports only whether they are configured.
- AI requests send the last 60 messages as pseudonymous references (`m1`, `m2`, …) with no usernames. Settings explains this, and it can be turned off.
- Chat text is rendered as plain text by React and length-capped. Model output is validated before rendering.
- Logs record event names and error codes only, never chat text, tokens or keys.
- Nothing is written to disk and nothing is stored in `localStorage`.

## Verification status

| Area | Status |
| --- | --- |
| Typecheck, lint, production build | Passing |
| Unit and integration tests (61) | Passing |
| Browser journeys (11) | Passing against the production build, Chromium |
| Local-rules analysis, question queue, demo | Verified by tests and by browser runs |
| Live Twitch connection to a real channel | **Not verified.** The build environment could not reach Twitch. Connection logic is tested against a local mock IRC server only. |
| AI analysis with a real Anthropic key | **Not verified.** Tested with a mocked SDK client. No key was available. |

## Known limitations

- **Single-tenant, in-memory state.** One server process holds one session that every browser tab sees. Restarting the server clears it. It is not a multi-user SaaS backend.
- **Anonymous Twitch login.** The anonymous read-only login is widely used by third-party Twitch chat clients, but it is not a documented guarantee in the official docs. If Twitch changes it, set a token (see *Connecting to Twitch*).
- **Heuristic analysis.** Question detection, response matching, sentiment and kind classification use transparent keyword rules. They miss sarcasm and unusual phrasing. Sentiment describes chat wording, not viewers' emotions.
- **Response detection is approximate.** "Reply visible" means a broadcaster message with overlapping words appeared in the chat window. It does not prove the question was answered.
- **Topic counts are keyword counts.** They are exact for the local engine. AI topic counts are the number of messages the model referenced.
- **Question groups are capped** at 100, and handled status lives only in memory.
- **Dark theme only.**
- **Demo timing.** The demo script is fixed: one message every 1.1 seconds, about one minute in total.
- **No posting to Twitch.** The app is read-only by design.
- **Dependency install.** Use `--legacy-peer-deps` if npm crashes on install (see *Quick start*).

## Privacy and data handling

- **What is kept:** chat text and display names of messages in the buffer (up to the configured buffer size, default 500), question groups, analysis results and handled states. All in memory.
- **Where it goes:** only to the browser session you are viewing, and to Anthropic when AI analysis is enabled and a key is configured.
- **How to remove it:** click **Clear session data** in Settings, or restart the server. The app cannot verify deletion by any external AI provider. Check that provider's retention policy.
- **Local analysis** never sends chat anywhere.

## Licence and attribution

Dependencies keep their own licences. StreamPilot itself contains no third-party chat content. The demo channel and usernames are invented for this project.
