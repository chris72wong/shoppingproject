import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { inspectGlb } from "../lib/body/glb";

test("distributed avatar is the documented, embedded, textured and skinned asset within the browser budget", async () => {
  const bytes = await readFile("public/models/avatar.glb");
  const provenance = JSON.parse(await readFile("public/models/avatar.provenance.json", "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.outputSha256);
  assert.ok(bytes.length < 3 * 1024 * 1024, "keep the single avatar under 3 MiB");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const model = inspectGlb(buffer);
  assert.match(model.asset.copyright, /Microsoft.*MIT/);
  assert.equal(model.skins.length, 1);
  assert.equal(model.skins[0].joints.length, 80);
  assert.equal(model.images.length, 3);
  const binStart = 28 + bytes.readUInt32LE(12);
  for (const image of model.images) {
    const view = model.bufferViews[image.bufferView];
    const metadata = await sharp(bytes.subarray(binStart + view.byteOffset, binStart + view.byteOffset + view.byteLength)).metadata();
    assert.equal(metadata.width, 1024, "reject converter placeholder textures");
    assert.equal(metadata.height, 1024);
  }
  for (const material of model.materials) {
    assert.ok(model.textures[material.pbrMetallicRoughness.baseColorTexture.index]);
  }
  const triangles = model.meshes.reduce((n: number, mesh: any) => n + mesh.primitives.reduce((sum: number, primitive: any) => sum + model.accessors[primitive.indices].count / 3, 0), 0);
  assert.equal(triangles, 7440);
});
