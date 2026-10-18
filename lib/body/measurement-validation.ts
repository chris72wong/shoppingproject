import { z } from "zod";
import type { PoolClient } from "pg";
import { measurementNames, type Measurements } from "./types";
import { invalidate } from "./service";
import { BodyError } from "./auth";

export const independentMeasurementSchema = z.object({
  scanId: z.uuid(), bodyVersion: z.number().int().positive(), operator: z.string().trim().min(1).max(100),
  source: z.literal("independent-tape"), measuredAt: z.iso.datetime(),
  studyKey: z.string().regex(/^garments\/[\w./-]+\.json$/).refine(v => !v.includes("..")),
  values: z.partialRecord(z.enum(measurementNames), z.object({
    value: z.number().finite().min(.05).max(2.5), uncertainty: z.number().finite().positive().max(.05),
    overClothing: z.literal(false),
  }).strict()).refine(v => Object.keys(v).length > 0),
}).strict();

// Called only by the trusted operator CLI, never by user correction endpoints.
export async function applyIndependentMeasurements(client: PoolClient, data: unknown, study: unknown) {
  const report = independentMeasurementSchema.parse(data);
  const evidence = z.object({ participants: z.number().int().min(12), measurementGate: z.literal(true),
    dimensions: z.record(z.string(), z.object({ passed: z.boolean() })),
  }).parse(study);
  if (Object.keys(report.values).some(k => !evidence.dimensions[k]?.passed)) throw new BodyError("Study does not cover all supplied measurements.");
  const row = (await client.query("SELECT * FROM body_scans WHERE id=$1 AND state='ready' AND accessed_at>now()-interval '30 days' FOR UPDATE", [report.scanId])).rows[0];
  if (!row || row.version !== report.bodyVersion) throw new BodyError("Scan changed or is not ready.", 409);
  const corrections: Measurements = {};
  for (const [name, m] of Object.entries(report.values)) corrections[name as keyof Measurements] = {
    ...m!, method: "manual", quality: "validated", validationReference: report.studyKey,
  };
  await invalidate(client, report.scanId);
  await client.query("UPDATE body_scans SET corrections=corrections || $2::jsonb,version=version+1 WHERE id=$1", [report.scanId, JSON.stringify(corrections)]);
  await client.query("INSERT INTO body_audit(actor,scan_id,action) VALUES($1,$2,'validate-independent-measurements')", [report.operator, report.scanId]);
}
