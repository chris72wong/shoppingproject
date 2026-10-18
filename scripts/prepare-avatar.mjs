// Run after scripts/download-avatar.ps1. Uses the app's existing Three.js and Sharp.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
const raw = await fs.readFile('.avatar-source/converted.glb');
const jsonLength = raw.readUInt32LE(12);
const model = JSON.parse(raw.subarray(20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
let binary = raw.subarray(binStart, binStart + model.buffers[0].byteLength);
function pack(json, bin) {
  const j = Buffer.from(JSON.stringify(json));
  const jp = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 32)]);
  const bp = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jp.length + bp.length, 8); header.writeUInt32LE(jp.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bp.length); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jp, bh, bp]);
}
// Compute bind-pose bounds with Three.js including skinning, without loading image placeholders.
const geometryOnly = structuredClone(model);
delete geometryOnly.images; delete geometryOnly.textures;
geometryOnly.materials = model.materials.map(() => ({}));
const geometryBytes = pack(geometryOnly, binary);
const gltf = await new GLTFLoader().parseAsync(geometryBytes.buffer.slice(geometryBytes.byteOffset, geometryBytes.byteOffset + geometryBytes.byteLength), '');
gltf.scene.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(gltf.scene, true);
const size = bounds.getSize(new Vector3()); const center = bounds.getCenter(new Vector3());
const scale = 1.75 / size.y;
const rootIndex = model.nodes.length;
model.nodes.push({ name: 'Avatar_Meters_YUp_FeetOrigin', scale: [scale, scale, scale], translation: [-center.x * scale, -bounds.min.y * scale, -center.z * scale], children: model.scenes[model.scene ?? 0].nodes });
model.scenes[model.scene ?? 0].nodes = [rootIndex];
model.images = []; model.textures = [];
const hashes = {};
for (const [index, region] of ['body', 'head', 'opacity'].entries()) {
  const filename = `m002_${region}_color.tga`;
  const source = await fs.readFile(`.avatar-source/${filename}`);
  hashes[filename] = crypto.createHash('sha256').update(source).digest('hex');
  const decoded = new TGALoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  let image = sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 } }).resize(1024, 1024);
  const alpha = region === 'opacity';
  const encoded = await (alpha ? image.png() : image.jpeg({ quality: 88 })).toBuffer();
  const padding = Buffer.alloc((4 - binary.length % 4) % 4);
  const offset = binary.length + padding.length;
  const bufferView = model.bufferViews.length;
  model.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: encoded.length });
  binary = Buffer.concat([binary, padding, encoded]);
  model.images.push({ name: filename, bufferView, mimeType: alpha ? 'image/png' : 'image/jpeg' });
  model.textures.push({ sampler: 0, source: index });
  const material = model.materials[index];
  delete material.normalTexture;
  material.pbrMetallicRoughness = { baseColorTexture: { index }, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 };
  if (alpha) { material.alphaMode = 'MASK'; material.alphaCutoff = 0.5; material.doubleSided = true; }
}
model.buffers[0].byteLength = binary.length;
model.asset.copyright = 'Copyright (c) 2020 Microsoft. MIT License; see LICENSE-Rocketbox.txt';
model.asset.extras = { source: 'microsoft/Microsoft-Rocketbox, Male_Adult_01', changes: 'FBX to GLB; 1024px diffuse textures; meters, Y up, feet at origin; nonmetallic materials; alpha mask; source skeleton preserved.' };
const output = pack(model, binary);
await fs.writeFile('public/models/avatar.glb', output);
const manifest = { source: 'https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9/Assets/Avatars/Adults/Male_Adult_01', license: 'MIT', sourceFbxSha256: crypto.createHash('sha256').update(await fs.readFile('.avatar-source/avatar.fbx')).digest('hex'), textureSha256: hashes, outputSha256: crypto.createHash('sha256').update(output).digest('hex'), bytes: output.length, triangles: model.meshes.reduce((n,m) => n + m.primitives.reduce((s,p)=>s+model.accessors[p.indices].count/3,0),0), skins: model.skins.map(s=>({joints:s.joints.length})), textures: 3, heightMeters: 1.75, sourceBounds: {min:bounds.min.toArray(),max:bounds.max.toArray()} };
await fs.writeFile('public/models/avatar.provenance.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest);
