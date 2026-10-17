import { test } from "node:test";
import assert from "node:assert/strict";
import { respond, snapshotOutfits, ConversationState } from "../lib/conversation";
import { generate, total } from "../lib/agent";
import { product } from "../lib/catalog";
import { restore, Store } from "../lib/storage";
const profile = { styles: ["minimalist"], colors: ["Stone", "Olive"], avoid: "", fit: "Regular", budget: 250, occasion: "Campus", weights: {}, inspiration: [] };
const state = (): ConversationState => ({ profile, outfits: generate("everyday", profile), selected: -1, custom: [], wardrobe: [] });
test("starts with three outfits and discloses infeasible budgets", () => {
 const result = respond("outfits for dinner under $1", { ...state(), outfits: [] });
 assert.equal(result.outfits?.length, 3); assert.match(result.text, /cannot meet/); assert.equal(result.profile?.occasion, "Dinner");
});
test("keeps pants while replacing jacket in explicit word-number outfit", () => {
 const before = state(); const result = respond("Keep the pants in outfit two but replace the jacket", before);
 assert.ok(result.outfits); assert.deepEqual(result.outfits[0], before.outfits[0]); assert.deepEqual(result.outfits[2], before.outfits[2]);
 assert.notDeepEqual(result.outfits[1].items, before.outfits[1].items);
 assert.deepEqual(result.outfits[1].items.filter((i) => product(i.productId).category !== "outerwear"), before.outfits[1].items.filter((i) => product(i.productId).category !== "outerwear"));
 assert.deepEqual(result.outfits[1].lockedCategories, ["bottom"]);
});
test("ambiguous edit is deferred and resolved with outfit two", () => {
 const before = state(); const ask = respond("replace the jacket", before);
 assert.equal(ask.outfits, undefined); assert.equal(ask.pending, "replace the jacket");
 const resolved = respond("outfit two", { ...before, pending: ask.pending });
 assert.equal(resolved.selected, 1); assert.equal(resolved.pending, ""); assert.notDeepEqual(resolved.outfits?.[1].items, before.outfits[1].items);
});
test("selected outfit is a target and all cheaper preserves locked pants", () => {
 const before = state(); const keep = respond("keep the pants in outfit one", before);
 const locked = { ...before, outfits: keep.outfits! };
 const result = respond("make all three more affordable", locked);
 assert.ok(result.outfits);
 for (let i = 0; i < 3; i++) assert.ok(total(result.outfits[i]) <= total(before.outfits[i]));
 assert.deepEqual(result.outfits[0].items.find((i) => product(i.productId).category === "bottom"), before.outfits[0].items.find((i) => product(i.productId).category === "bottom"));
 const selected = respond("replace the shoes", { ...before, selected: 2 });
 assert.equal(selected.selected, 2); assert.deepEqual(selected.outfits?.[0], before.outfits[0]);
});
test("unsupported requests do not silently regenerate", () => {
 assert.equal(respond("buy it for me", state()).outfits, undefined);
 assert.equal(respond("replace the sunglasses in outfit one", state()).outfits, undefined);
});
test("snapshots remain independent through refinements and restoration", () => {
 const before = state(); const snapshots = snapshotOutfits(before.outfits);
 const result = respond("replace the jacket in outfit one", before);
 assert.deepEqual(snapshots, before.outfits); assert.notDeepEqual(snapshots[0].items, result.outfits?.[0].items);
 const base: Store = { ...before, selected: 0, saved: [], scan: { complete: false, height: 175, chest: 96, waist: 80, hip: 98, shoulder: 44, fit: "Regular" }, messages: [] };
 const restored = restore(JSON.stringify({ ...base, messages: [{ id: "a", role: "agent", text: "Three outfits", outfits: snapshots }, { id: "b", role: "agent", text: "Invalid snapshot", outfits: [{ id: "bad" }] }] }), base);
 assert.deepEqual(restored.messages[0].outfits, snapshots); assert.equal(restored.messages[1].outfits, undefined);
 restored.outfits[0].items[0].productId = "changed";
 assert.notEqual(restored.messages[0].outfits?.[0].items[0].productId, "changed");
});

test("legacy sessions attach only the latest outfit set to the last stylist reply", () => {
 const before = state();
 const base: Store = { ...before, selected: 0, saved: [], scan: { complete: false, height: 175, chest: 96, waist: 80, hip: 98, shoulder: 44, fit: "Regular" }, messages: [] };
 const messages = [{ id: "old", role: "agent", text: "Earlier suggestions" }, { id: "new", role: "agent", text: "Latest suggestions" }];
 const restored = restore(JSON.stringify({ ...base, messages }), base);
 assert.equal(restored.messages[0].outfits, undefined);
 assert.deepEqual(restored.messages[1].outfits, base.outfits);
 assert.equal(restored.profile.budget, base.profile.budget);
});

test("new occasion requests with budgets generate fresh looks after existing suggestions", () => {
 for (const [request, occasion, budget] of [
  ["outfits for office under $200", "Work", 200],
  ["something for dinner under $150", "Dinner", 150],
 ] as const) {
  const before = state();
  const result = respond(request, { ...before, selected: 1 });
  assert.equal(result.outfits?.length, 3);
  assert.equal(result.profile?.occasion, occasion);
  assert.equal(result.profile?.budget, budget);
  assert.equal(result.selected, -1);
  assert.ok(result.outfits?.every((outfit) => outfit.occasion === occasion));
  assert.match(result.text, /Here are three outfits/);
 }
});

test("budget-only requests still refine existing looks", () => {
 const before = state();
 const all = respond("keep all under $100", before);
 assert.ok(all.outfits);
 assert.ok(all.outfits.every((outfit, index) => outfit.id === before.outfits[index].id));
 assert.equal(all.profile?.budget, 100);
 const selected = respond("keep this outfit under $100", { ...before, selected: 1 });
 assert.deepEqual(selected.outfits?.[0], before.outfits[0]);
 assert.deepEqual(selected.outfits?.[2], before.outfits[2]);
 assert.equal(selected.selected, 1);
});

test("replacement constraints are acknowledged without silently substituting an unrelated color", () => {
 const before = state();
 const original = snapshotOutfits(before.outfits);
 const result = respond("replace the top in outfit one with a red one", before);
 assert.equal(result.outfits, undefined);
 assert.match(result.text, /can’t apply.*red one/);
 assert.deepEqual(before.outfits, original);
});

test("outerwear replacement uses grammatical confirmation", () => {
 const result = respond("replace the jacket in outfit one", state());
 assert.match(result.text, /with different outerwear/);
 assert.doesNotMatch(result.text, /a different outerwear/);
});

test("replacement with a wardrobe piece remains marked owned", () => {
 const before = state();
 const owned = { ...product("u-tee"), id: "custom-test", retailer: "Owned", price: 0 };
 const result = respond("replace the top in outfit one", { ...before, custom: [owned], wardrobe: [{ id: "wardrobe-test", productId: owned.id }] });
 assert.deepEqual(result.outfits?.[0].items.find(item => item.productId === owned.id), { productId: owned.id, owned: true });
});
