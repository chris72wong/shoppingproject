import test from "node:test";
import assert from "node:assert/strict";
import { sampleStylist } from "../lib/sample-stylist";
import { capsuleLooks } from "../lib/capsule-products";
import { readQuota } from "../lib/gemini-quota";
import type { ChatRequest } from "../lib/chat-schema";

function state(): ChatRequest["state"] {
  return { profile: { styles: ["minimal"], colors: [], avoid: "", fit: "Regular", budget: 60, occasion: "Everyday" }, outfits: capsuleLooks(), selected: 1, custom: [], wardrobe: [], pending: "" };
}
test("sample refinement preserves selected pants, other looks, and original state", () => {
  const input = state(), before = structuredClone(input);
  const response = sampleStylist("Keep the pants, switch to the white tee", input);
  assert.deepEqual(input, before);
  assert.equal(response.outfits![1].items.find(i => i.productId.includes("482880"))!.productId, "uq-482880-olive");
  assert.equal(response.outfits![1].items.find(i => i.productId.includes("489929"))!.productId, "uq-489929-white");
  assert.deepEqual(response.outfits![0], input.outfits[0]);
  assert.deepEqual(response.outfits![2], input.outfits[2]);
  assert.ok(response.outfits![1].lockedCategories!.includes("bottom"));
});
test("sample mode can generate, select, layer and reject unavailable clothes honestly", () => {
  const input=state();
  assert.equal(sampleStylist("Style a casual outfit under $20",input).outfits!.length,3);
  assert.match(sampleStylist("Style a casual outfit under $20",input).text,/exceed/);
  assert.equal(sampleStylist("Show look three",input).selected,2);
  assert.ok(sampleStylist("Add the blue overshirt",input).outfits![1].items.some(i=>i.productId==="uq-482452-blue"));
  assert.equal(sampleStylist("Find a red dress",input).outfits,undefined);
});
test("sample refinements preserve owned pieces", () => {
  const input=state();input.outfits[1].items[0].owned=true;
  assert.equal(sampleStylist("Switch to the white tee",input).outfits![1].items[0].productId,input.outfits[1].items[0].productId);
});
test("quota diagnostics distinguish daily exhaustion from a short temporary retry", async () => {
  const temporary=await readQuota(new Response(JSON.stringify({error:{details:[{retryDelay:"0.1s"},{violations:[{quotaMetric:"GenerateRequestsPerMinute"}]}]}}),{status:429}));
  assert.equal(temporary.retry,true);assert.equal(temporary.waitMs,100);
  const daily=await readQuota(new Response(JSON.stringify({error:{details:[{retryDelay:"1s"},{violations:[{quotaId:"RequestsPerDay"}]}]}}),{status:429}));
  assert.equal(daily.retry,false);assert.match(daily.message,/daily quota/);
  const unknown=await readQuota(new Response("private provider details",{status:429}));
  assert.equal(unknown.retry,false);assert.doesNotMatch(unknown.message,/private/);
});

test("local swaps protect an owned garment as well as conversational refinements", async () => {
  const {swapItem,similarItems}=await import('../lib/swaps');
  const {capsuleProducts}=await import('../lib/capsule-products');
  const look=capsuleLooks()[0];look.items[0].owned=true;
  const old=capsuleProducts.find(p=>p.id===look.items[0].productId)!;
  const replacement=capsuleProducts.find(p=>p.category===old.category && p.id!==old.id)!;
  assert.equal(swapItem(look,old.id,replacement,[]),look);
  assert.deepEqual(similarItems(look,old,[],100,[]),[]);
});
