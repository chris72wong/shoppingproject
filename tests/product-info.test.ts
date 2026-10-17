import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, product } from "../lib/catalog";
import { getProductInfo } from "../lib/product-info";

test("demo catalog discloses estimated USD prices and missing fit evidence", () => {
  for (const p of catalog) {
    const info = getProductInfo(p);
    assert.match(info.sourceLabel, /Demo catalog.*estimated USD/);
    assert.match(info.fitSummary, /Fit unverified/);
    assert.equal(info.materials, null);
    assert.equal(info.sizeGuideUrl, null);
    assert.equal(info.reviewsSummary, null);
    assert.ok(!info.href || info.linkLabel.includes("collection"));
  }
});

test("retailer collections match garment category rather than sending shoes to tops", () => {
  assert.match(getProductInfo(product("trousers")).href!, /bottoms$/);
  assert.match(getProductInfo(product("oxford")).href!, /shirts-and-polos$/);
  assert.match(getProductInfo(product("knit")).href!, /sweaters$/);
  assert.match(getProductInfo(product("blazer")).href!, /outerwear-and-blazers$/);
  assert.match(getProductInfo(product("tote")).href!, /accessories-and-shoes$/);
  assert.match(getProductInfo(product("loafers")).href!, /\/shoes$/);
  assert.match(getProductInfo(product("stan")).href!, /adidas.com\/us\/stan_smith$/);
  assert.match(getProductInfo(product("jeans")).href!, /levi.com/);
  assert.equal(getProductInfo(product("canvas")).href, null);
  assert.equal(getProductInfo(product("white-canvas")).href, null);
});

test("owned products never receive retailer links or inferred product facts", () => {
  const info = getProductInfo({ ...catalog[0], id: "custom-shirt", retailer: "Owned", url: "https://example.com" });
  assert.equal(info.href, null);
  assert.match(info.sourceLabel, /Your wardrobe/);
  assert.equal(info.materials, null);
});

test("supplied links reject dangerous schemes, relative URLs and embedded credentials", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com/item", "/item", "//example.com", "https://user:pass@example.com/item", "https://user@example.com"]) {
    assert.equal(getProductInfo({ ...catalog[0], id: "external", url }).href, null);
  }
  const info = getProductInfo({ ...catalog[0], id: "external", url: "https://example.com/item", linkType: "product" });
  assert.equal(info.href, "https://example.com/item");
  assert.match(info.linkLabel, /unverified/);
  assert.match(info.sourceLabel, /unverified/);
});
