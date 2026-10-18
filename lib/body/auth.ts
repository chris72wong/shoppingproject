import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export type Identity = { userId: string; role: "user" | "operator"; scope: "web" | "capture" };
const identitySchema = z.object({ userId: z.string().min(1).max(100), role: z.enum(["user", "operator"]), scope: z.enum(["web", "capture"]), exp: z.number() });
export class BodyError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function required(name: string) { const value = process.env[name]; if (!value) throw new BodyError("The body scan pilot is not configured.", 503); return value; }
export function enabled() { return process.env.BODY_PILOT_ENABLED === "true"; }
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function secret() { const key = required("BODY_SESSION_SECRET"); if (key.length < 32) throw new BodyError("The pilot session key must be at least 32 characters.", 503); return key; }
export function issueSession(identity: Identity, seconds = 8 * 3600) {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url");
  return payload + "." + createHmac("sha256", secret()).update(payload).digest("base64url");
}
export function readSession(token: string): Identity {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new BodyError("Sign in to the body scan pilot.", 401);
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BodyError("Invalid pilot session.", 401);
  let parsed;
  try { parsed = identitySchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString())); } catch { throw new BodyError("Invalid pilot session.", 401); }
  if (parsed.exp <= Date.now() / 1000) throw new BodyError("Pilot session expired.", 401);
  return parsed;
}
export function authenticate(request: Request): Identity {
  const bearer = request.headers.get("authorization");
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("form-body="))?.slice(10);
  return readSession(bearer?.startsWith("Bearer ") ? bearer.slice(7) : cookie || "");
}
export function inviteLogin(code: string): Identity {
  const invites = z.array(z.object({ userId: z.string().min(1).max(100), role: z.enum(["user", "operator"]), codeHash: z.string().regex(/^[a-f0-9]{64}$/) })).parse(JSON.parse(required("BODY_PILOT_INVITES")));
  const hashed = Buffer.from(digest(code));
  const match = invites.find(i => timingSafeEqual(hashed, Buffer.from(i.codeHash)));
  if (!match) throw new BodyError("Invalid invitation code.", 401);
  return { userId: match.userId, role: match.role, scope: "web" };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = required("BODY_PUBLIC_ORIGIN");
  if (origin && origin !== expected) throw new BodyError("Cross-origin requests are not allowed.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new BodyError("Cross-site requests are not allowed.", 403);
}
