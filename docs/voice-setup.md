# Voice stylist setup

1. In ElevenLabs Subscription, verify your promotion includes ElevenAgents minutes. Review usage and overage settings before testing.
2. Create an ElevenAgents agent in the dashboard. Choose English, preview and select a stock voice, and choose a supported low-latency LLM. Enable authentication, allow your development and deployment domains, and set a five-minute maximum conversation duration for initial testing.
3. Set the first message to empty so the user speaks first. If an opening message is required, use only “I’m listening.”
4. Use this system prompt:

> You are Mirra’s concise voice shopping assistant. Let the user do most of the talking. Wait until they finish their request. Default to one short sentence, ideally under 20 words; expand only when asked. Skip small talk, praise, repeated summaries, thinking-aloud, and routine follow-up questions. Ask at most one brief clarification only when necessary to act. After answering, wait quietly; do not fill pauses or prompt the user to keep talking. For every shopping or styling request, call consult_stylist with the user’s complete request including outfit numbers and constraints. Wait for its result before answering. The tool has the current outfits, wardrobe, preferences, and shopping conversation. State only the key outcome; do not read the full tool response or outfit list aloud. Never invent product details, prices, availability, outfit changes, or successful actions. Report failures and essential limitations briefly and accurately. You cannot place orders or make purchases. Answer greetings and questions about voice controls directly and briefly. Consult the tool again for current shopping information after typed chat changes.

The app sends listening and brevity guidance with each connected session using the SDK’s contextual update. Apply the prompt and first-message settings above in the hosted agent too, since the greeting is controlled by ElevenLabs. Disable automatic silence nudges and choose a patient turn-taking setting in the dashboard so pauses leave room for the user.

5. Add a **client tool** named exactly `consult_stylist`. Description: “Consult the shopping assistant and update displayed outfits using current app state.” Add one required string parameter `message`, described as “The user’s complete shopping request, including outfit number and constraints; at most 2000 characters.” Enable **Wait for response / blocking**. Do not configure a webhook for this tool.
6. Put these server variables in this worktree’s ignored `.env.local` and deployment environment:

```dotenv
GEMINI_API_KEY=your-existing-gemini-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_AGENT_ID=your-agent-id
```

Use a restricted API key with permission to obtain agent conversation tokens. Never use NEXT_PUBLIC_ for ElevenLabs variables. Restart the server after changing environment variables. Worktrees do not copy the original checkout’s .env.local.

Run on a separate port while other features are open:

```sh
npm run dev -- --port 3001
```

Use localhost or HTTPS. Click “Talk to your stylist”, allow the microphone, then try “Create three casual outfits under $60” followed by “Keep the pants in outfit two and switch to the white tee”. Confirm displayed outfits and spoken results agree. Test microphone denial, connection failure, mute/unmute, End while connecting, reconnect, and a failed Gemini request. Typed chat remains available; overlapping shopping requests get a retry response rather than overwriting outfits.

Voice transcripts remain in the session-only voice panel. Shopping tool turns use the existing locally persisted shopping history. Audio goes to ElevenLabs and shopping context to Gemini. Review provider conversation retention settings in your dashboard.

The token endpoint uses same-origin checks and no-store responses for this accountless prototype. Before unrestricted public launch, add authentication, per-user session limits, and shared rate limiting to protect paid usage. No credentials or account access are bundled: hosted agent creation and trial verification require your ElevenLabs account.
