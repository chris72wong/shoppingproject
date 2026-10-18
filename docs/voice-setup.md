# Voice stylist setup

1. In ElevenLabs Subscription, verify your promotion includes ElevenAgents minutes. Review usage and overage settings before testing.
2. Create an ElevenAgents agent in the dashboard. Choose English, preview and select a stock voice, and choose a supported low-latency LLM. Enable authentication, allow your development and deployment domains, and set a five-minute maximum conversation duration for initial testing.
3. Set the first message to empty so the user speaks first. If an opening message is required, use only “I’m listening.”
4. Use this system prompt:

> You are FORM’s concise voice shopping assistant. Let the user do most of the talking. Wait until they finish their request. Default to one short sentence, ideally under 20 words; expand only when asked. Skip small talk, praise, repeated summaries, thinking-aloud, and routine follow-up questions. Ask at most one brief clarification only when necessary to act. After answering, wait quietly; do not fill pauses or prompt the user to keep talking. For every shopping or styling request, call consult_stylist with the user’s complete request including outfit numbers and constraints. Wait for its result before answering. The tool has the current outfits, wardrobe, preferences, and shopping conversation. State only the key outcome; do not read the full tool response or outfit list aloud. Never invent product details, prices, availability, outfit changes, or successful actions. Report failures and essential limitations briefly and accurately. You cannot place orders or make purchases. Answer greetings and questions about voice controls directly and briefly. Consult the tool again for current shopping information after typed chat changes.

The app sends listening and brevity guidance with each connected session using the SDK’s contextual update. Apply the prompt and first-message settings above in the hosted agent too, since the greeting is controlled by ElevenLabs. Disable automatic silence nudges and choose a patient turn-taking setting in the dashboard so pauses leave room for the user.

5. Add a **client tool** named exactly `consult_stylist`. Description: “Consult the shopping assistant and update displayed outfits using current app state.” Add one required string parameter `message`, described as “The user’s complete shopping request, including outfit number and constraints; at most 2000 characters.” Enable **Wait for response / blocking** (`expects_response: true`) and set **Response timeout** to **60 seconds** or more. The browser shopping request can take 55 seconds, including up to 45 seconds for Gemini, so the default 20-second tool timeout is too short. Do not configure a webhook for this tool.
6. Put these server variables in this worktree’s ignored `.env.local` and deployment environment:

```dotenv
GEMINI_API_KEY=your-existing-gemini-key
GEMINI_MODEL=gemini-flash-latest
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_AGENT_ID=your-agent-id
```

Use a restricted API key with permission to obtain agent conversation tokens. Never use NEXT_PUBLIC_ for ElevenLabs variables. Restart the server after changing environment variables. Worktrees do not copy the original checkout’s .env.local.

The connection is: ElevenLabs recognizes speech and calls `consult_stylist` in the browser; that tool uses the same shopping handler as typed chat to call `/api/chat`; Gemini returns a validated outfit plan; the app updates the cards and returns the result to ElevenLabs to speak. Merely selecting Gemini as the hosted voice agent's LLM does not connect it to the app's outfits or state.

Check the hosted configuration before a call:

```sh
npm run voice:check
```

This reads the agent settings and checks the exact client tool name, required message parameter, blocking response, timeout, and prompt reference. It requires agent read permission. To repair an existing registered client tool's blocking and timeout settings, run `npm run voice:configure` with agent/tool read and tool write permission. This preserves the rest of the tool configuration and verifies the saved agent settings afterward. Existing calls must be ended and restarted to use hosted setting changes.

To make a real Gemini request through the same `/api/chat` route and confirm three validated new outfits are returned:

```sh
npm run voice:smoke
```

This uses provider quota, prints no credentials, and does not open a microphone session. A full live call still needs browser microphone access. If the selected Gemini model returns HTTP 503, check provider capacity and `GEMINI_MODEL`; `gemini-flash-latest` is the default alias. The server retries HTTP 503 once within the same 45-second Gemini deadline. HTTP 429 is surfaced without automatic retries; check the Google project's rate limits and quota before retrying. The app does not silently substitute demo outfits for a failed generation. `voice:check` checks configuration only; `voice:smoke` also verifies actual generation.

Provider references: [ElevenLabs client tools and blocking responses](https://elevenlabs.io/docs/eleven-agents/libraries/react#client-tools), [tool configuration API](https://elevenlabs.io/docs/eleven-agents/api-reference/tools/update), and [Gemini Interactions API](https://ai.google.dev/api/interactions-api).

Run on a separate port while other features are open:

```sh
npm run dev -- --port 3001
```

Use localhost or HTTPS. Click “Talk to your stylist”, allow the microphone, then try “Create three dinner outfits under $200” followed by “Swap the shoes in outfit two”. Confirm displayed outfits and spoken results agree. Test microphone denial, connection failure, mute/unmute, End while connecting, reconnect, and a failed Gemini request. Typed chat remains available; overlapping shopping requests get a retry response rather than overwriting outfits.

Voice transcripts remain in the session-only voice panel. Shopping tool turns use the existing locally persisted shopping history. Audio goes to ElevenLabs and shopping context to Gemini. Review provider conversation retention settings in your dashboard.

The token endpoint uses same-origin checks and no-store responses for this accountless prototype. Before unrestricted public launch, add authentication, per-user session limits, and shared rate limiting to protect paid usage. No credentials or account access are bundled: hosted agent creation and trial verification require your ElevenLabs account.
