import { readFile } from "node:fs/promises";
import { independentMeasurementSchema, applyIndependentMeasurements } from "../../lib/body/measurement-validation";
import { db, transaction } from "../../lib/body/db";
import { privateJson } from "../../lib/body/objects";
async function main() {
  const report = independentMeasurementSchema.parse(JSON.parse(await readFile(process.argv[2], "utf8")));
  const study = await privateJson(report.studyKey);
  try { await transaction(client => applyIndependentMeasurements(client, report, study)); }
  finally { await db().end(); }
  console.log("Recorded independently validated measurements; previous fit results invalidated.");
}
void main().catch(e => { console.error(e instanceof Error ? e.message : "Validation failed"); process.exitCode = 1; });
