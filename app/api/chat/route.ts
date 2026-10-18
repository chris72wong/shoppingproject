import { ChatError, chatRequestSchema, chatWithGemini } from "../../../lib/gemini";
import { fetchWeather } from "../../../lib/weather";
import { fitSummary } from "../../../lib/body/summary";
import { assertCapsuleOutfits } from "../../../lib/preview-capsule";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next may construct request.url using its bind address (0.0.0.0), while
  // the browser connects through localhost. Host retains the requested authority.
  const url = new URL(request.url);
  let expectedOrigin = url.origin;
  const host = request.headers.get("host");
  if (host) {
    try {
      const publicUrl = new URL(`${url.protocol}//${host}`);
      if (publicUrl.host !== host || publicUrl.username || publicUrl.password)
        throw new Error("Invalid host");
      expectedOrigin = publicUrl.origin;
    } catch {
      return Response.json({ error: "Invalid request host." }, { status: 400, headers });
    }
  }
  if (origin && origin !== expectedOrigin)
    return Response.json({ error: "Cross-origin chat requests are not allowed." }, { status: 403, headers });
  try {
    // Bound the streamed body before decoding, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "A chat request is required." }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150000) {
        await reader.cancel();
        return Response.json({ error: "This conversation is too large. Start a new chat." }, { status: 413, headers });
      }
      chunks.push(value);
    }
    const parsed = chatRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return Response.json({ error: "Invalid chat request. Check your message and try again." }, { status: 400, headers });
    let weather;
    let weatherError;
    const location = parsed.data.location ?? parsed.data.weatherCity;
    if (location) {
      try { weather = await fetchWeather(location, fetch, request.signal); }
      catch (error) { weatherError = error instanceof Error ? error.message : "Weather is unavailable."; }
    }
    const result = await chatWithGemini(parsed.data, { capsuleOnly: true, signal: request.signal, weather, weatherError, fitSummary: await fitSummary(request, parsed.data.bodyScanId) });
    if (result.outfits) {
      try { assertCapsuleOutfits(result.outfits); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The clothing capsule is unavailable." }, { status: 409, headers }); }
    }
    return Response.json({ ...result, weather, weatherError }, { headers });
  } catch (error) {
    if (error instanceof ChatError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid chat request." }, { status: 400, headers });
    return Response.json({ error: "The request could not be completed. Please try again." }, { status: 500, headers });
  }
}
