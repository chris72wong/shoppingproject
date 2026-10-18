// Run with: node --env-file=.env.local --import tsx infra/body/register-garment.ts path/to/manifest.json
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Pool } from "pg";
import { measurementNames } from "../../lib/body/types";
import { objectSize } from "../../lib/body/objects";
const text = z.string().trim().min(1).max(2000);
const range = z.tuple([z.number().positive().max(2.5), z.number().positive().max(2.5)]).refine(([a,b]) => a < b);
const schema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), version: z.number().int().positive(), productId: text,
  name: text, category: z.enum(["top","bottom","outerwear"]),
  evidence: z.object({ source: text, measuredAt: z.iso.datetime(), physicalSample: text, validated: z.boolean() }).strict(),
  sizes: z.array(z.object({ label: z.enum(["S","M","L"]), blendKey: z.string().regex(/^garments\/[\w./-]+\.blend$/).refine(k => !k.includes("..")), ranges: z.partialRecord(z.enum(measurementNames), range) }).strict()).length(3),
}).strict().refine(g => new Set(g.sizes.map(s => s.label)).size === 3 && g.sizes.every(s => Object.keys(s.ranges).length > 0));
async function main() {
  const asset = schema.parse(JSON.parse(await readFile(process.argv[2], "utf8")));
  for (const size of asset.sizes) if (!await objectSize(size.blendKey)) throw new Error("Garment .blend asset is missing from private storage");
  const pool = new Pool({ connectionString: process.env.BODY_DATABASE_URL });
  try {
    const result = await pool.query(`INSERT INTO body_garments(id,version,data,enabled) VALUES($1,$2,$3,true)
      ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data,enabled=true
      WHERE body_garments.version<EXCLUDED.version RETURNING id`, [asset.id, asset.version, asset]);
    if (!result.rowCount) throw new Error("Bump the garment version before replacing evidence/assets");
    console.log("Registered pilot garment", asset.id, "version", asset.version);
  } finally { await pool.end(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Registration failed"); process.exitCode = 1; });
