import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  total,
  budgetFrom,
  alternatives,
  readStored,
  replacementCategory,
} from "../lib/agent";
import { catalog, product } from "../lib/catalog";
import { UserStyleProfile } from "../lib/types";
import { restore, Store } from "../lib/storage";
const profile: UserStyleProfile = {
  styles: ["minimalist"],
  colors: ["Stone", "Olive"],
  avoid: "",
  fit: "Regular",
  budget: 250,
  occasion: "Campus",
  weights: {},
  inspiration: [],
};
test("catalog has thirty unique items and valid prices", () => {
  assert.equal(catalog.length, 30);
  assert.equal(new Set(catalog.map((p) => p.id)).size, 30);
  assert.ok(catalog.every((p) => p.price > 0 && p.url.startsWith("https://")));
});
test("parses budget refinements including zero", () => {
  assert.equal(budgetFrom("Keep it under $100", 250), 100);
  assert.equal(budgetFrom("budget of 150", 250), 150);
  assert.equal(budgetFrom("under $0", 250), 0);
});
test("three distinct complete outfits respect feasible budget", () => {
  const looks = generate("Back to school under $100", profile);
  assert.equal(looks.length, 3);
  assert.equal(
    new Set(looks.map((o) => o.items.map((i) => i.productId).join(","))).size,
    3,
  );
  for (const o of looks) {
    assert.ok(total(o) <= 100);
    for (const cat of ["top", "bottom", "shoes"])
      assert.ok(o.items.some((i) => product(i.productId).category === cat));
  }
});
test("impossible budgets retain complete looks and expose real totals", () => {
  const looks = generate("under $1", profile);
  assert.ok(looks.every((o) => total(o) > 1));
  assert.ok(looks.every((o) => o.items.length >= 3));
});
test("owned pieces cost zero and are actually used", () => {
  const looks = generate("Style my wardrobe under $100", profile, [
    "u-tee",
    "jeans",
    "stan",
  ]);
  assert.ok(looks.every((o) => o.items.filter((i) => i.owned).length === 3));
  assert.ok(looks.every((o) => total(o) <= 100));
});
test("streetwear and dinner produce different catalog selections", () => {
  assert.notDeepEqual(
    generate("streetwear", profile)[0].items,
    generate("birthday dinner", profile)[0].items,
  );
});
test("replacement keeps other items and gives genuine savings", () => {
  const look = generate("everyday", profile)[0];
  const before = total(look);
  const p = alternatives(look, "shoes", [], true)[0];
  const revised = {
    ...look,
    items: look.items.map((i) =>
      product(i.productId).category === "shoes" ? { ...i, productId: p.id } : i,
    ),
  };
  assert.ok(total(revised) < before);
  assert.deepEqual(
    revised.items.filter((i) => product(i.productId).category !== "shoes"),
    look.items.filter((i) => product(i.productId).category !== "shoes"),
  );
});
test("storage parser recovers malformed and scalar data", () => {
  assert.deepEqual(readStored("{bad", profile), profile);
  assert.deepEqual(readStored("null", profile), profile);
  assert.deepEqual(readStored("42", profile), profile);
});
test("recognizes item-level refinements", () => {
  assert.equal(replacementCategory("hate the jacket"), "outerwear");
  assert.equal(replacementCategory("replace my pants"), "bottom");
});
test("avoided colors are removed when alternatives exist", () => {
  for (const o of generate("everyday", { ...profile, avoid: "black" }))
    assert.ok(o.items.every((i) => product(i.productId).color !== "Black"));
});
test("weather requests include a shell when budget permits", () => {
  assert.ok(
    generate("Seattle weather under $250", profile).every((o) =>
      o.items.some((i) => i.productId === "rain-shell"),
    ),
  );
});
test("nested malformed storage is normalized without losing valid saved looks", () => {
  const base: Store = {
    profile,
    scan: {
      complete: true,
      height: 175,
      chest: 96,
      waist: 80,
      hip: 98,
      shoulder: 44,
      fit: "Regular",
    },
    outfits: generate("everyday", profile),
    saved: [],
    wardrobe: [],
    custom: [],
    messages: [],
    selected: 0,
  };
  const restored = restore(
    JSON.stringify({
      ...base,
      profile: { avoid: 42, colors: [null], budget: -10 },
      scan: { height: 999, waist: "bad" },
      selected: 999,
      saved: [base.outfits[0], { id: "broken" }],
    }),
    base,
  );
  assert.equal(restored.profile.avoid, "");
  assert.deepEqual(restored.profile.colors, profile.colors);
  assert.equal(restored.profile.budget, 250);
  assert.equal(restored.scan.height, 205);
  assert.equal(restored.scan.waist, 80);
  assert.equal(restored.selected, 2);
  assert.equal(restored.saved.length, 1);
});
test("budget follow-ups retain the dinner occasion", () => {
  const looks = generate("under $150", { ...profile, occasion: "Dinner" });
  assert.equal(looks[0].name, "After hours");
  assert.ok(looks.every((look) => look.occasion === "Dinner" && total(look) <= 150));
});
