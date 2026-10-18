import { test } from "node:test";
import assert from "node:assert/strict";
import { assertGarmentGroups, garmentForProduct, outfitPreviewKey, selectionMatchesJob } from "../lib/body/outfit-tryon";
import type { Product } from "../lib/types";
import type { GarmentAsset, TryOnJob } from "../lib/body/types";

const product: Product = { id: "exact-tee", name: "Tee", brand: "Test brand", category: "top", tags: [], color: "White", hex: "#ffffff", price: 20, retailer: "Test brand", url: "https://example.com/product?color=white&region=US", image: "/garments/u-tee.svg", linkType: "product", garmentIdentity: { sku: "tee-1", region: "US", variant: "white" } };
const asset: GarmentAsset = { schemaVersion: 2, id: "asset", version: 1, productId: product.id, name: product.name, category: "top", evidence: { source: "fixture", measuredAt: "2026-10-18T00:00:00Z", physicalSample: "fixture", validated: false }, sizes: [], identity: { brand: product.brand, sku: "tee-1", region: "US", variant: "white", productUrl: product.url } };
test("shopping overlays require exact product identity rather than similar garment names", () => {
  assert.equal(garmentForProduct(product, [asset]), asset);
  assert.equal(garmentForProduct({ ...product, url: "https://example.com/product?region=US&color=white" }, [asset]), asset);
  for (const change of [{ id: "other-tee" }, { linkType: "collection" as const }, { brand: "Other brand" }, { category: "outerwear" as const }, { url: "https://example.com/product?color=black&region=US" }, { garmentIdentity: undefined }, { garmentIdentity: { ...product.garmentIdentity!, variant: "black" } }, { garmentIdentity: { ...product.garmentIdentity!, sku: "another-revision" } }]) {
    assert.equal(garmentForProduct({ ...product, ...change }, [asset]), undefined);
  }
  assert.equal(garmentForProduct(product, [asset, { ...asset, id: "ambiguous" }]), undefined);
  assert.equal(garmentForProduct(product, [{ ...asset, schemaVersion: 1 }]), undefined);
});
test("swaps, body versions, variants and size changes invalidate preview identity", () => {
  const initial = outfitPreviewKey("scan", 1, [product], { asset: "M" });
  for (const next of [outfitPreviewKey("scan", 2, [product], { asset: "M" }), outfitPreviewKey("other-scan", 1, [product], { asset: "M" }), outfitPreviewKey("scan", 1, [{ ...product, id: "swap" }], { asset: "M" }), outfitPreviewKey("scan", 1, [product], { asset: "L" })]) assert.notEqual(next, initial);
});
test("late simulation results must match the requested body, garment versions and sizes", () => {
  const selections = [{ garmentId: "tee", version: 2, size: "M" }, { garmentId: "pants", version: 1, size: "32/30" }];
  const job: TryOnJob = { schemaVersion: 1, id: "job", scanId: "scan", bodyVersion: 3, state: "ready", progress: 100, garments: selections };
  assert.ok(selectionMatchesJob(job, "scan", 3, selections.slice().reverse()));
  assert.equal(selectionMatchesJob(job, "scan", 2, selections), false);
  assert.equal(selectionMatchesJob(job, "other-scan", 3, selections), false);
  assert.equal(selectionMatchesJob(job, "scan", 3, [{ ...selections[0], size: "L" }, selections[1]]), false);
  assert.equal(selectionMatchesJob(job, "scan", 3, [{ ...selections[0], version: 3 }, selections[1]]), false);
  assert.equal(selectionMatchesJob(job, "scan", 3, [selections[0], selections[0]]), false);
});
test("GLB garment groups must contain exactly the requested products", () => {
  const doc = { nodes: [{ name: "body:surface" }, { name: "garment:tee" }, { name: "garment:pants" }] };
  assert.doesNotThrow(() => assertGarmentGroups(doc, ["tee", "pants"]));
  assert.throws(() => assertGarmentGroups(doc, ["other-tee", "pants"]));
  assert.throws(() => assertGarmentGroups(doc, ["tee"]));
  assert.throws(() => assertGarmentGroups({ nodes: [...doc.nodes, { name: "garment:tee" }] }, ["tee", "pants"]));
});
