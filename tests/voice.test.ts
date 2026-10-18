import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/voice/token/route";
import { stylistToolIssues } from "../lib/voice-config";

test("hosted voice tool must wait long enough for Gemini's shopping result", () => {
  const tool = { type: "client", name: "consult_stylist", expects_response: false, response_timeout_secs: 20,
    parameters: { required: ["message"], properties: { message: { type: "string" } } } };
  assert.equal(stylistToolIssues(tool).length, 2);
  assert.deepEqual(stylistToolIssues({ ...tool, expects_response: true, response_timeout_secs: 60 }), []);
  assert.ok(stylistToolIssues({ ...tool, type: "webhook" }).some(issue => issue.includes("client tool")));
  assert.ok(stylistToolIssues({ ...tool, parameters: {} }).some(issue => issue.includes("required string")));
});
const request = (origin = "http://localhost:3001") => new Request("http://localhost:3001/api/voice/token", { method: "POST", headers: { origin, host: "localhost:3001" } });
test("voice token boundary and provider errors", async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.ELEVENLABS_API_KEY;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  try {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_AGENT_ID;
    assert.equal((await POST(request("https://other.example"))).status, 403);
    assert.equal((await POST(request("invalid"))).status, 403);
    assert.equal((await POST(request())).status, 503);
    process.env.ELEVENLABS_API_KEY = "private-test-key";
    process.env.ELEVENLABS_AGENT_ID = "agent_test";
    globalThis.fetch = async (input, init) => {
      assert.equal(new URL(String(input)).searchParams.get("agent_id"), "agent_test");
      assert.equal((init?.headers as Record<string,string>)["xi-api-key"], "private-test-key");
      return Response.json({ token: "short-lived-token", secret: "not-for-browser" });
    };
    const response = await POST(request());
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { token: "short-lived-token" });
    globalThis.fetch = async () => Response.json({ detail: "private diagnostic" }, { status: 401 });
    const failed = await POST(request());
    assert.equal(failed.status, 502);
    assert.doesNotMatch(await failed.text(), /private|diagnostic/);
    globalThis.fetch = async () => Response.json({ token: null });
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => { throw new Error("network failure"); };
    assert.equal((await POST(request())).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = key;
    if (agent === undefined) delete process.env.ELEVENLABS_AGENT_ID; else process.env.ELEVENLABS_AGENT_ID = agent;
  }
});
