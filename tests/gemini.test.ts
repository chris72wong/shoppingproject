import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlan, chatWithGemini, ChatError, chatRequestSchema } from "../lib/gemini";
import { generate } from "../lib/agent";
import type { ChatRequest, StylistPlan } from "../lib/chat-schema";
import { POST } from "../app/api/chat/route";

const profile = { styles: ["minimalist"], colors: ["Stone"], avoid: "", fit: "Regular", budget: 250, occasion: "Everyday" };
const request = (): ChatRequest => ({
  message: "Could the second one feel more relaxed?",
  history: [{ role: "user", text: "I need something for an interview." }, { role: "agent", text: "Do you prefer a formal or relaxed setting?" }],
  state: { profile, outfits: generate("everyday", { ...profile, weights: {}, inspiration: [] }), selected: 1, wardrobe: [], custom: [], pending: "" },
});
const plan = (input = request()): StylistPlan => ({
  action: "refine", text: "I changed the second look's top to a relaxed sweatshirt.", selected: 1, profile,
  updates: [{ index: 1, name: "Relaxed interview", description: "A softer silhouette", tags: ["relaxed"], occasion: "Interview",
    rationale: "A sweatshirt keeps the trousers casual.", keepCategories: [],
    productIds: input.state.outfits[1].items.map((i) => i.productId === "air-tee" ? "hoodie" : i.productId),
  }],
});
const apiResponse = (value: StylistPlan) => Response.json({ status: "completed", steps: [
  { type: "thought", content: [{ type: "text", text: "not a final reply" }] },
  { type: "model_output", content: [{ type: "text", text: JSON.stringify(value) }] },
] });

test("Gemini receives transcript, selected look, preferences and catalog with server authentication", async () => {
  const input = request();
  const before = structuredClone(input);
  const reply = await chatWithGemini(input, { apiKey: "test-secret", fetcher: async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "test-secret");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    const context = JSON.parse(body.input);
    assert.deepEqual(context.history, input.history);
    assert.equal(context.state.selected, 1);
    assert.deepEqual(context.state.profile, profile);
    assert.ok(context.catalog.some((p: { id: string }) => p.id === "hoodie"));
    assert.equal(body.response_format.mime_type, "application/json");
    return apiResponse(plan(input));
  } });
  assert.equal(reply.outfits?.[1].items[0].productId, "hoodie");
  assert.deepEqual(reply.outfits?.[0], input.state.outfits[0]);
  assert.deepEqual(reply.outfits?.[2], input.state.outfits[2]);
  assert.deepEqual(input, before);
});

test("refinements reject replaced locked or owned items without mutating the input", () => {
  for (const owned of [false, true]) {
    const input = request();
    input.state.outfits[1].lockedCategories = owned ? [] : ["top"];
    input.state.outfits[1].items[0].owned = owned;
    const before = structuredClone(input);
    assert.throws(() => applyPlan(plan(input), input.state), /kept or owned/);
    assert.deepEqual(input, before);
  }
});

test("rejects fabricated products, duplicate indices and incomplete combinations", () => {
  const input = request();
  const invalid = plan(input); invalid.updates[0].productIds[0] = "invented";
  assert.throws(() => applyPlan(invalid, input.state), /unavailable piece/);
  const duplicate = plan(input); duplicate.updates.push(duplicate.updates[0]);
  assert.throws(() => applyPlan(duplicate, input.state), /duplicate/);
  const incomplete = plan(input); incomplete.updates[0].productIds = ["hoodie", "u-tee", "stan"];
  assert.throws(() => applyPlan(incomplete, input.state), /incomplete/);
});

test("builds three fresh looks with trusted ownership and computed budget disclosure", () => {
  const input = request();
  input.state.wardrobe = [{ id: "owned", productId: "hoodie" }];
  const result = applyPlan({ ...plan(input), action: "generate", selected: -1, profile: { ...profile, budget: 1 },
    updates: [0, 1, 2].map((index) => ({ ...plan(input).updates[0], index })),
  }, input.state);
  assert.equal(result.outfits?.length, 3);
  assert.ok(result.outfits?.every((o) => o.items.find((i) => i.productId === "hoodie")?.owned));
  assert.equal(new Set(result.outfits?.map((o) => o.id)).size, 3);
  assert.match(result.text, /exceed your \$1 budget/);
});

test("clarification and preference replies do not regenerate outfits", () => {
  const input = request();
  const result = applyPlan({ ...plan(input), action: "reply", text: "Which outfit should I change?", updates: [], selected: -1,
    profile: { ...profile, avoid: "red" },
  }, input.state);
  assert.equal(result.outfits, undefined);
  assert.equal(result.profile?.avoid, "red");
});

test("handles missing credentials, rate limits, network errors and invalid model output", async () => {
  await assert.rejects(chatWithGemini(request(), { apiKey: "" }), /GEMINI_API_KEY/);
  await assert.rejects(chatWithGemini(request(), { apiKey: "secret", fetcher: async () => new Response("private details", { status: 429 }) }),
    (e: unknown) => e instanceof ChatError && e.status === 429 && !e.message.includes("private details"));
  await assert.rejects(chatWithGemini(request(), { apiKey: "secret", fetcher: async () => { throw new Error("secret"); } }), /could not be reached/);
  await assert.rejects(chatWithGemini(request(), { apiKey: "secret", fetcher: async () => Response.json({ status: "completed", steps: [] }) }), /invalid reply/);
});

test("validates request size, JSON, origin and message limits before any upstream call", async () => {
  const post = (body: string, origin?: string) => POST(new Request("http://localhost/api/chat", {
    method: "POST", body, headers: origin ? { origin } : {},
  }));
  assert.equal((await post("{")).status, 400);
  assert.equal((await post(" ".repeat(150001))).status, 413);
  assert.equal((await post(JSON.stringify(request()), "https://elsewhere.example")).status, 403);
  assert.equal((await post(JSON.stringify({ ...request(), message: "" }))).status, 400);
  assert.equal(chatRequestSchema.safeParse({ ...request(), message: "a".repeat(2001) }).success, false);
  assert.equal(chatRequestSchema.safeParse(request()).success, true);
});

test("origin check uses the browser host when Next binds to 0.0.0.0", async () => {
  const post = (origin: string) => POST(new Request("http://0.0.0.0:3000/api/chat", {
    method: "POST", body: "{", headers: { host: "localhost:3000", origin },
  }));
  // Malformed JSON reaches validation, proving the legitimate origin passed.
  assert.equal((await post("http://localhost:3000")).status, 400);
  assert.equal((await post("https://elsewhere.example")).status, 403);
  assert.equal((await post("http://localhost:3001")).status, 403);
  assert.equal((await post("https://localhost:3000")).status, 403);
});
