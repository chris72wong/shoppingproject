import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWeather } from "../lib/weather";
import { similarItems, swapItem } from "../lib/swaps";
import { generate, total } from "../lib/agent";
import { product } from "../lib/catalog";

test("weather resolves city and fetches local daily conditions with explicit units", async () => {
  let calls = 0;
  const result = await fetchWeather("Vancouver", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.cache, "no-store");
    calls++;
    if (calls === 1) {
      assert.equal(url.hostname, "geocoding-api.open-meteo.com");
      assert.equal(url.searchParams.get("name"), "Vancouver");
      return Response.json({ results: [{ name: "Vancouver", country: "Canada", latitude: 49.28, longitude: -123.12 }] });
    }
    assert.equal(url.hostname, "api.open-meteo.com");
    assert.equal(url.searchParams.get("latitude"), "49.28");
    assert.equal(url.searchParams.get("timezone"), "auto");
    assert.equal(url.searchParams.get("forecast_days"), "1");
    return Response.json({ current: { time: "2026-10-17T12:00", temperature_2m: 12, apparent_temperature: 9, precipitation: 2, wind_speed_10m: 20 }, daily: { temperature_2m_min: [8], temperature_2m_max: [14], precipitation_probability_max: [90] } });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { location: "Vancouver, Canada", observedAt: "2026-10-17T12:00", temperature: 12, feelsLike: 9, precipitation: 2, wind: 20, low: 8, high: 14, rainChance: 90 });
});

test("weather rejects unknown cities, failed upstreams and incomplete conditions", async () => {
  await assert.rejects(fetchWeather("missing", async () => Response.json({})), /City not found/);
  await assert.rejects(fetchWeather("city", async () => new Response(null, { status: 503 })), /unavailable/);
  let calls = 0;
  await assert.rejects(fetchWeather("city", async () => ++calls === 1 ? Response.json({ results: [{ name: "city", latitude: 0, longitude: 0 }] }) : Response.json({ current: null })));
});

const profile = { styles: ["minimalist"], colors: ["Stone"], avoid: "", fit: "Regular", budget: 250, occasion: "Everyday", weights: {}, inspiration: [] };
test("swaps preserve all other garments, mark wardrobe ownership and recompute totals", () => {
  const outfit = generate("everyday", profile)[0];
  const before = structuredClone(outfit);
  const old = outfit.items.find((i) => product(i.productId).category === "bottom")!;
  const replacement = product("jeans");
  const updated = swapItem(outfit, old.productId, replacement, ["jeans"]);
  assert.deepEqual(outfit, before);
  assert.deepEqual(updated.items.filter((i) => i.productId !== "jeans"), before.items.filter((i) => i.productId !== old.productId));
  assert.equal(updated.items.find((i) => i.productId === "jeans")?.owned, true);
  assert.equal(total(updated), total(before) - product(old.productId).price);
  assert.equal(swapItem(outfit, old.productId, product("stan"), []), outfit);
});

test("similar choices respect category locks and rank affordable items first", () => {
  const outfit = generate("everyday", profile)[0];
  const piece = product(outfit.items.find((i) => product(i.productId).category === "bottom")!.productId);
  const options = similarItems(outfit, piece, [], total(outfit) - piece.price, ["jeans"]);
  assert.ok(options.length > 0);
  assert.ok(options.every((p) => p.category === "bottom" && p.id !== piece.id));
  assert.equal(options[0].id, "jeans");
  outfit.lockedCategories = ["bottom"];
  assert.deepEqual(similarItems(outfit, piece, [], 250, []), []);
  assert.equal(swapItem(outfit, piece.id, product("jeans"), []), outfit);
});

test("device coordinates fetch weather directly without a city search", async () => {
  let calls = 0;
  const result = await fetchWeather({ latitude: 49.28, longitude: -123.12 }, async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.open-meteo.com");
    assert.equal(url.searchParams.get("latitude"), "49.28");
    assert.equal(url.searchParams.get("longitude"), "-123.12");
    return Response.json({ current: { time: "2026-10-17T12:00", temperature_2m: 12, apparent_temperature: 9, precipitation: 2, wind_speed_10m: 20 }, daily: { temperature_2m_min: [8], temperature_2m_max: [14], precipitation_probability_max: [90] } });
  });
  assert.equal(calls, 1);
  assert.equal(result.location, "Your current location");
  assert.equal(result.feelsLike, 9);
  await assert.rejects(fetchWeather({ latitude: 91, longitude: 0 }, async () => { throw new Error("should not fetch"); }), (error: unknown) => error instanceof Error && error.name === "ZodError");
});
