import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inspectGlb } from "../lib/body/glb";
import { previewManifest, previewManifestSchema, sampleCombination, assertCapsuleOutfits } from "../lib/preview-capsule";
import { capsuleLooks, capsuleProducts } from "../lib/capsule-products";
import { assertGarmentGroups } from "../lib/body/outfit-tryon";
import { similarItems } from "../lib/swaps";

function ready() {
  const products = ["top", "top", "bottom", "bottom", "outerwear"].map((category, i) => ({
    productId: `product-${i}`, sku: `SKU-${i}`, variant: "00", region: "US", category,
    size: category === "bottom" ? "32 / 79 cm" : "M", garmentVersion: 1,
    dimensionsVerified: true, sourceUrls: ["https://example.com/product"],
  }));
  const sets = products.map(p => [p.productId]);
  for (const t of [0, 1]) for (const b of [2, 3]) for (const layer of [false, true]) sets.push([`product-${t}`, `product-${b}`, ...(layer ? ["product-4"] : [])]);
  return { ...previewManifest, avatarVersion: 1, status: "ready", products, combinations: sets.map((productIds, i) => ({
    url: `/models/look-${i}.glb`, sha256: "a".repeat(64), productIds, avatarVersion: 1, rigVersion: 1,
    idleCollisionChecked: true, visualReviewPassed: true,
  })) };
}
test("capsule remains unavailable until every product, single preview and layered combination is reviewed", () => {
  assert.equal(sampleCombination(["u-tee"]), undefined);
  assert.throws(() => assertCapsuleOutfits([{ items: [{ productId: "u-tee" }] }], { ...previewManifest, status: "blocked" }), /not released/);
  const manifest = previewManifestSchema.parse(ready());
  assert.ok(sampleCombination(["product-2", "product-0"], manifest));
  assert.equal(sampleCombination(["product-0", "product-0"], manifest), undefined);
  assert.throws(() => assertCapsuleOutfits([{ items: [{ productId: "product-0" }] }], manifest), /no approved/);
  assert.throws(() => assertCapsuleOutfits([{ items: [{ productId: "historical" }] }], manifest), /no approved/);
  const incomplete = ready(); incomplete.combinations.pop();
  assert.equal(previewManifestSchema.safeParse(incomplete).success, false);
  const missingProduct = ready(); missingProduct.products.pop();
  assert.equal(previewManifestSchema.safeParse(missingProduct).success, false);
  const wrongRig = ready(); wrongRig.combinations[0].rigVersion++;
  assert.equal(previewManifestSchema.safeParse(wrongRig).success, false);
});

test("draft capsule includes every exact garment and outfit mapping without asserting verified fit", async () => {
  assert.equal(previewManifest.status, "draft");
  assert.equal(previewManifest.products.length, 5); assert.equal(previewManifest.combinations.length, 13);
  assert.equal(previewManifestSchema.safeParse({ ...previewManifest, status: "ready" }).success, false);
  assertCapsuleOutfits(capsuleLooks());
  for (const combo of previewManifest.combinations) {
    const bytes = await readFile(`public${combo.url}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), combo.sha256);
    const glb = inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assertGarmentGroups(glb, combo.productIds);
    assert.equal(glb.skins.length, 1);
    assert.ok(glb.animations.some((clip: any) => clip.name === previewManifest.idleClip));
    const garmentNodes = glb.nodes.filter((node: any) => node.name?.startsWith('garment:'));
    for (const node of garmentNodes) {
      assert.equal(node.skin, 0);
      assert.ok(glb.meshes[node.mesh].primitives.every((p: any) => p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined));
    }
    assert.equal(combo.idleCollisionChecked, false);
  }
  const swaps = similarItems(capsuleLooks()[0], capsuleProducts[0], [], 250, []);
  assert.deepEqual(swaps.map(p => p.id), [capsuleProducts[1].id]);
});

test("sample human has embedded CC0 textures, separate underlayer, one shared rig and seamless idle with stationary feet", async () => {
  const bytes = await readFile("public/models/sample-human.glb");
  const provenance = JSON.parse(await readFile("public/models/sample-human.provenance.json", "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sha256);
  assert.ok(bytes.length < 10 * 1024 * 1024);
  const glb = inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.match(glb.asset.copyright, /CC0/);
  assert.equal(glb.skins.length, 1); assert.equal(glb.skins[0].joints.length, 53);
  assert.ok(glb.nodes.some((n: any) => n.name === "body:sample"));
  assert.ok(glb.nodes.some((n: any) => n.name === "underlayer:neutral"));
  assert.ok(glb.nodes.filter((n: any) => n.mesh !== undefined).every((n: any) => n.skin === 0));
  assert.ok(glb.images.length >= 3); assert.ok(glb.images.every((i: any) => i.bufferView !== undefined));
  assert.ok(glb.materials.filter((m: any) => m.name.includes('body:sample.') && !/eyebrow|short02/.test(m.name)).every((m: any) => m.alphaMode !== 'BLEND'), 'skin and eyes must not alpha-sort against themselves');
  const start = 28 + bytes.readUInt32LE(12);
  function values(index: number): number[][] {
    const a = glb.accessors[index], v = glb.bufferViews[a.bufferView];
    assert.equal(a.componentType, 5126);
    const width = ({ SCALAR: 1, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, j) => bytes.readFloatLE(start + (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || width * 4) + j * 4)));
  }
  const clip = glb.animations.find((a: any) => a.name === "FORM_Idle"); assert.ok(clip);
  let moving = 0;
  for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler], samples = values(sampler.output), times = values(sampler.input);
    assert.equal(times.at(-1)?.[0], 8);
    const first = samples[0], last = samples.at(-1)!;
    assert.ok(first.every((n, i) => Math.abs(n - last[i]) < 1e-5), "loop closes without a jump");
    const changes = samples.some(row => row.some((n, i) => Math.abs(n - first[i]) > 1e-5));
    if (changes) { moving++; assert.match(glb.nodes[channel.target.node].name, /spine_|neck_|head/); }
  }
  assert.ok(moving >= 4, "actual posture animation is embedded");
});
