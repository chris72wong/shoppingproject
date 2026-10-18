import { z } from "zod";
import { authenticate, BodyError, checkOrigin, enabled, inviteLogin, issueSession } from "@/lib/body/auth";
import { db } from "@/lib/body/db";
import { assetResponse } from "@/lib/body/objects";
import { consumePairing, correctScan, createScan, createTryon, deleteScan, finalizeScan, garments, ownedScan, ownedTryon, pairing, publicScan, rateLimit, reviewScan } from "@/lib/body/service";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200, extra: Record<string,string> = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
async function body(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new BodyError("A JSON body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 32768) { await reader.cancel(); throw new BodyError("Request too large.", 413); } chunks.push(next.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new BodyError("Invalid JSON."); }
}
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    if (path.join("/") === "config" && request.method === "GET") return json({ enabled: enabled() });
    if (!enabled()) throw new BodyError("Body scan pilot is disabled.", 404);
    checkOrigin(request);
    const route = path.join("/"), method = request.method;
    if (route === "session" && method === "POST") {
      await rateLimit("login-global", 60, 60);
      const { code } = z.object({ code: z.string().min(16).max(256) }).strict().parse(await body(request));
      const identity = inviteLogin(code), token = issueSession(identity);
      return json(identity, 200, { "Set-Cookie": `form-body=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}` });
    }
    if (route === "pairings/consume" && method === "POST") {
      await rateLimit("pair-global", 60, 60);
      const { token } = z.object({ token: z.string().regex(/^[\w-]{43}$/) }).strict().parse(await body(request));
      return json({ token: issueSession(await consumePairing(token), 3600) });
    }
    const identity = authenticate(request);
    if (identity.scope === "capture" && !((route === "scans" && method === "POST") || (/^scans\/[\w-]+\/finalize$/.test(route) && method === "POST"))) throw new BodyError("Capture session cannot access this resource.", 403);
    if (route === "session" && method === "GET") return json(identity);
    if (route === "session" && method === "DELETE") return json({ ok: true }, 200, { "Set-Cookie": "form-body=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0" });
    if (route === "pairings" && method === "POST") { await rateLimit("pair:" + identity.userId, 10, 3600); return json(await pairing(identity)); }
    if (route === "garments" && method === "GET") return json({ garments: await garments() });
    if (route === "scans" && method === "POST") return json(await createScan(identity, await body(request)), 201);
    if (route === "scans" && method === "GET") return json({ scans: (await db().query("SELECT * FROM body_scans WHERE owner_id=$1 AND state<>'deleted' AND accessed_at>now()-interval '30 days' ORDER BY created_at DESC LIMIT 50", [identity.userId])).rows.map(r => publicScan(r)) });
    if (route === "review" && method === "GET") {
      if (identity.role !== "operator") throw new BodyError("Operator access required.", 403);
      return json({ scans: (await db().query("SELECT * FROM body_scans WHERE state='review' AND accessed_at>now()-interval '30 days' ORDER BY created_at LIMIT 50")).rows.map(r => publicScan(r, true)) });
    }
    if (["scans", "review", "tryons"].includes(path[0]) && path.length >= 2) z.string().uuid().parse(path[1]);
    const id = path[1];
    if (path[0] === "scans") {
      if (path.length === 2 && method === "GET") {
        const row = await ownedScan(identity, id); await db().query("UPDATE body_scans SET accessed_at=now() WHERE id=$1 AND state<>'deleted'", [id]); return json(publicScan(row));
      }
      if (path.length === 2 && method === "DELETE") { await deleteScan(identity, id); return json({ ok: true }); }
      if (path.length === 3 && path[2] === "finalize" && method === "POST") return json(await finalizeScan(identity, id));
      if (path.length === 3 && path[2] === "corrections" && method === "PATCH") { await correctScan(identity, id, await body(request)); return json({ ok: true }); }
      if (path.length === 3 && path[2] === "consent" && method === "PATCH") {
        const { shareFit } = z.object({ shareFit: z.boolean() }).strict().parse(await body(request));
        await ownedScan(identity, id); await db().query("UPDATE body_scans SET share_fit=$2 WHERE id=$1 AND state<>'deleted'", [id, shareFit]); return json({ ok: true });
      }
      if (path.length === 4 && path[2] === "assets" && path[3] === "display" && method === "GET") {
        const row = await ownedScan(identity, id);
        if (row.state !== "ready" || !row.display_key) throw new BodyError("Mesh is not ready.", 409);
        return assetResponse(row.display_key, request);
      }
    }
    if (path[0] === "review" && identity.role === "operator") {
      if (path.length === 2 && method === "POST") { await reviewScan(identity, id, await body(request)); return json({ ok: true }); }
      if (path.length === 4 && path[2] === "assets" && path[3] === "display" && method === "GET") {
        const row = (await db().query("SELECT display_key FROM body_scans WHERE id=$1 AND state='review' AND accessed_at>now()-interval '30 days'", [id])).rows[0];
        if (!row?.display_key) throw new BodyError("Review mesh unavailable.", 404);
        await db().query("INSERT INTO body_audit(actor,scan_id,action) VALUES($1,$2,'view-review')", [identity.userId, id]);
        return assetResponse(row.display_key, request);
      }
    }
    if (route === "tryons" && method === "POST") return json(await createTryon(identity, await body(request)), 202);
    if (path[0] === "tryons" && method === "GET") {
      const { row, job } = await ownedTryon(identity, id);
      if (path.length === 2) return json(job);
      if (path.length === 3 && path[2] === "asset" && row.state === "ready" && row.result_key) return assetResponse(row.result_key, request);
    }
    throw new BodyError("Pilot resource not found.", 404);
  } catch (error) {
    if (error instanceof BodyError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: "Invalid pilot request.", details: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, 400);
    // Never log request bodies, object URLs, or body measurements.
    console.error("Body pilot request failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "The body scan service is unavailable. Please retry later." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
