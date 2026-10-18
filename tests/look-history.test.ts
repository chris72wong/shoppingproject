import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../lib/agent";
import { product } from "../lib/catalog";
import { rememberOutfits, swapLook } from "../lib/look-history";
import { swapItem, similarItems } from "../lib/swaps";
import { restore, serializeStore, type Store } from "../lib/storage";
const profile = { styles: ["minimalist"], colors: ["Stone"], avoid: "", fit: "Regular", budget: 250, occasion: "Everyday", weights: {}, inspiration: [] };
function base(): Store { return { profile, outfits: generate("everyday", profile), saved: [], wardrobe: [], custom: [], messages: [], selected: 0, scan: { complete: false, height: 175, chest: 96, waist: 80, hip: 98, shoulder: 44, fit: "Regular" } }; }

test("item swap changes only the selected outfit slot, even with duplicate outfit IDs", () => {
 const store = base(); const current = store.outfits[0];
 const looks = [current, structuredClone(current), store.outfits[2]];
 const before = structuredClone(looks);
 const piece = product(current.items[0].productId);
 const replacement = similarItems(current, piece, [], 250, [])[0];
 const updated = swapItem(current, piece.id, replacement, []);
 const result = swapLook(looks, 0, updated);
 assert.deepEqual(looks, before);
 assert.deepEqual(result[1], before[1]); assert.deepEqual(result[2], before[2]);
 assert.deepEqual(result[0].items.filter((item) => item.productId !== replacement.id), before[0].items.filter((item) => item.productId !== piece.id));
 assert.equal(result[0].items.find((item) => item.productId === replacement.id)?.productId, replacement.id);
});

test("history preserves original and swapped versions independently and deduplicates repeats", () => {
 const store = base(); const original = structuredClone(store.outfits[0]);
 const history = rememberOutfits([], store.outfits);
 const modified = structuredClone(original); modified.items[0].productId = "another-piece";
 const versions = rememberOutfits(history, [modified, original]);
 assert.equal(versions.length, 4); assert.deepEqual(history[0], original);
 modified.tags.push("new"); modified.items[0].owned = true;
 assert.notDeepEqual(versions[3], modified);
 assert.deepEqual(versions[0], original);
});

test("legacy chat looks and saved looks migrate into history and survive new chats and reloads", () => {
 const store = base(); const past = structuredClone(store.outfits); past[0].name = "Earlier look";
 const saved = structuredClone(store.outfits[1]); saved.name = "Saved look";
 const loaded = restore(JSON.stringify({ ...store, saved: [saved], messages: [{ id: "past", role: "agent", text: "Earlier", outfits: past }] }), store);
 assert.ok(loaded.lookHistory?.some((look) => look.name === "Earlier look"));
 assert.ok(loaded.lookHistory?.some((look) => look.name === "Saved look"));
 const reloaded = restore(serializeStore({ ...loaded, messages: [], scenery: "beach" }), store);
 assert.deepEqual(reloaded.lookHistory, loaded.lookHistory); assert.equal(reloaded.scenery, "beach");
});

test("invalid historical entries and scenery do not discard valid stored looks", () => {
 const store = base();
 const loaded = restore(JSON.stringify({ ...store, lookHistory: [null, {}, store.outfits[0]], scenery: "invalid" }), store);
 assert.equal(loaded.scenery, "studio"); assert.deepEqual(loaded.lookHistory, store.outfits);
});
