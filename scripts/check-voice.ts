import { stylistToolIssues, stylistToolTimeoutSeconds, type VoiceToolConfig } from "../lib/voice-config";
import { POST } from "../app/api/chat/route";
import type { ChatRequest } from "../lib/chat-schema";
import type { ConversationResponse } from "../lib/conversation";

// No credentials, full prompts, provider response bodies, or tokens are printed.
async function main() {
  for (const name of ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "GEMINI_API_KEY"])
    if (!process.env[name]?.trim()) throw new Error(`Missing ${name} in .env.local.`);
  const provider = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/${path}`, {
      ...init,
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`ElevenLabs configuration request failed (HTTP ${response.status}). Check agent/tool read permissions and tool write permission for --fix.`);
    return response.json();
  };
  const agent = await provider(`agents/${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID!)}`);
  const prompt = agent.conversation_config?.agent?.prompt;
  const tools: VoiceToolConfig[] = prompt?.tools ?? [];
  const tool = tools.find((tool) => tool.name === "consult_stylist");
  if (!tool) throw new Error("The hosted agent is missing consult_stylist. Follow docs/voice-setup.md to add the blocking client tool.");
  if (process.argv.includes("--fix") && stylistToolIssues(tool).length) {
    // Resolve the registered tool by ID; do not overwrite the agent or unrelated tools.
    let found = false;
    for (const id of prompt.tool_ids ?? []) {
      const registered = await provider(`tools/${encodeURIComponent(id)}`);
      if (registered.tool_config?.name !== "consult_stylist") continue;
      if (registered.tool_config.type !== "client") throw new Error("consult_stylist must be a client tool; correct its type in the dashboard.");
      const config = registered.tool_config;
      if (stylistToolIssues({ ...config, expects_response: true, response_timeout_secs: stylistToolTimeoutSeconds }).length)
        throw new Error("Correct the required message string parameter in the dashboard before applying timing settings.");
      await provider(`tools/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ tool_config: { ...config, expects_response: true,
          response_timeout_secs: Math.max(config.response_timeout_secs ?? 0, stylistToolTimeoutSeconds) } }),
      });
      found = true;
      break;
    }
    if (!found) throw new Error("Could not resolve the registered consult_stylist tool. Correct its settings in the dashboard.");
    const updated = await provider(`agents/${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID!)}`);
    const verified = updated.conversation_config?.agent?.prompt?.tools?.find((t: VoiceToolConfig) => t.name === "consult_stylist");
    if (!verified || stylistToolIssues(verified).length) throw new Error("Hosted tool verification failed after updating settings.");
    console.log("Updated and verified consult_stylist: blocking, timeout at least 60 seconds.");
  } else {
    const issues = stylistToolIssues(tool);
    if (issues.length) throw new Error(issues.join("\n") + "\nRun npm run voice:configure to repair timing settings.");
    console.log("Hosted consult_stylist configuration is ready: blocking, timeout at least 60 seconds.");
  }
  if (!prompt?.prompt?.includes("consult_stylist")) throw new Error("The hosted agent prompt must instruct shopping requests to call consult_stylist.");
  if (!process.argv.includes("--generate")) return;

  // Exercise the actual route/schema/catalog validation used by the browser tool.
  const input: ChatRequest = {
    message: "Create three fresh everyday outfits under $250. Choose the pieces now; no clarification needed.",
    history: [],
    state: { profile: { styles: ["minimalist"], colors: [], avoid: "", fit: "Regular", budget: 250, occasion: "Everyday" },
      outfits: [], selected: -1, wardrobe: [], custom: [], pending: "" },
  };
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify(input),
  }));
  const result = await response.json() as ConversationResponse & { error?: string };
  if (!response.ok) throw new Error(`Gemini generation failed (HTTP ${response.status}): ${result.error}`);
  if (result.outfits?.length !== 3) throw new Error("Gemini replied but did not generate three outfits.");
  console.log(`Gemini generated ${result.outfits.length} validated outfits through /api/chat using ${process.env.GEMINI_MODEL || "gemini-flash-latest"}.`);
  console.log("Voice routing: consult_stylist → shared shopping handler → /api/chat → Gemini → displayed outfits and spoken tool result.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Voice check failed.");
  process.exitCode = 1;
});
