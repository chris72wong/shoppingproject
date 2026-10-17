export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let originHost: string | undefined;
  try { originHost = origin ? new URL(origin).host : undefined; } catch {}
  if (!originHost || originHost !== host || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "Cross-origin voice requests are not allowed." }, { status: 403, headers });
  const key = process.env.ELEVENLABS_API_KEY;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agent) return Response.json({ error: "Voice is not configured yet. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID on the server." }, { status: 503, headers });
  try {
    const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
    url.searchParams.set("agent_id", agent);
    const response = await fetch(url, { headers: { "xi-api-key": key }, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error("Provider unavailable");
    const body = await response.json();
    if (typeof body.token !== "string" || !body.token) throw new Error("Invalid token");
    return Response.json({ token: body.token }, { headers });
  } catch {
    return Response.json({ error: "Could not connect to the voice service. Please try again." }, { status: 502, headers });
  }
}
