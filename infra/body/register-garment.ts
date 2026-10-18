// Run with: node --env-file=.env.local --import tsx infra/body/register-garment.ts path/to/manifest.json
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { z } from "zod";
import { garmentSchema as schema } from "../../lib/body/garment";
import { objectSize, privateJson } from "../../lib/body/objects";
async function main() {
  const asset = schema.parse(JSON.parse(await readFile(process.argv[2], "utf8")));
  for (const size of asset.sizes) if (!await objectSize(size.blendKey)) throw new Error("Garment .blend asset is missing from private storage");
  for (const key of [asset.pattern.sourceKey, asset.fabric.recordKey, asset.validation.reportKey].filter((k): k is string => !!k)) {
    if (!await objectSize(key)) throw new Error("Pattern, calibration or validation record is missing from private storage");
  }
  const pattern = z.object({ version: z.number().int(), sku: z.string(), sizes: z.record(z.string(), z.unknown()) }).parse(await privateJson(asset.pattern.sourceKey, 16 * 1024 * 1024));
  if (pattern.version !== asset.pattern.version || pattern.sku !== asset.identity.sku || asset.sizes.some(s => !pattern.sizes[s.label])) throw new Error("Editable pattern source does not cover this product, version and sizes");
  const calibration = z.object({ calibrationId: z.string(), version: z.number().int(), blenderCloth: z.record(z.string(), z.number().finite().positive()) }).parse(await privateJson(asset.fabric.recordKey));
  if (calibration.calibrationId !== asset.fabric.calibrationId || calibration.version !== asset.fabric.version) throw new Error("Fabric record version mismatch");
  if (asset.validation.status === "validated") {
    const report = z.object({ participants: z.number().int().min(12), measurementGate: z.literal(true), coverageGate: z.literal(true),
      garments: z.record(z.string(), z.object({ passed: z.literal(true), sizeAgreement: z.number().min(.9), appearanceGate: z.literal(true), sizes: z.record(z.string(), z.number().int().min(3)), configurations: z.object({ individual: z.number().int().min(12), layered: z.number().int().min(12) }) })),
    }).parse(await privateJson(asset.validation.reportKey!));
    const coverage = report.garments[asset.identity.sku];
    if (!coverage || asset.sizes.some(s => !coverage.sizes[s.label])) throw new Error("Physical trial does not cover all registered sizes");
    if (asset.validation.participants > report.participants || asset.validation.sizeAgreement > coverage.sizeAgreement) throw new Error("Manifest overstates trial evidence");
  }
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
