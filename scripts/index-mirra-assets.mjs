import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const models = {};
for (const [model, height] of [['model-1', 1.75], ['model-2', 1.68]]) {
  const dir = `public/models/mirra/${model}`;
  if (!existsSync(dir)) continue;
  const assets = [];
  for (const name of readdirSync(dir).filter(n => /^look-\d+\.glb$/.test(n)).sort((a,b) => Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]))) {
    const bytes = readFileSync(`${dir}/${name}`);
    if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Incomplete asset: ${dir}/${name}`);
    const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const productIds = [...new Set(doc.nodes.filter(n => n.name?.startsWith('garment:')).map(n => n.name.slice(8)))];
    if (!productIds.length) throw new Error(`No shopping garments: ${name}`);
    assets.push({ url: `/models/mirra/${model}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), productIds });
  }
  models[model] = { label: model === 'model-1' ? 'Model 1' : 'Model 2', height, duration: 12, assets };
}
writeFileSync('public/models/mirra-manifest.json', JSON.stringify({ models }, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(models).map(([id, model]) => [id, model.assets.length])));
