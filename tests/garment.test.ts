import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dimensionMeters, garmentSchema, simulationIdentity } from "../lib/body/garment";
import { assessFit } from "../lib/body/fit";
import type { BodyScan, ResearchedGarmentAsset } from "../lib/body/types";
import { researchSchema } from "../infra/body/research-products";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient, Pool } from "pg";
import { applyIndependentMeasurements } from "../lib/body/measurement-validation";
import { createTryon } from "../lib/body/service";

const timestamp = "2026-10-18T00:00:00Z";
function fixture(): ResearchedGarmentAsset {
  const dimension = (value: number, convention: "circumference" | "length" = "circumference") => ({ value, uncertainty: .001, units: "m" as const, convention, origin: "measured" as const, sourceIndex: 0, method: "Synthetic test fixture; no physical validation implied" });
  return {
    schemaVersion: 2, id: "a7227b21-ac78-43c1-84cb-7fc93bf3899e", version: 1, productId: "fixture", name: "Synthetic tee", category: "top",
    identity: { brand: "Fixture", sku: "test", variant: "test", region: "US", productUrl: "https://example.com/product" },
    sources: [ { url: "https://example.com/sample", retrievedAt: timestamp, kind: "sample", note: "Synthetic fixture" }, { url: "https://example.com/trial", retrievedAt: timestamp, kind: "trial", note: "Synthetic fixture" } ],
    evidence: { source: "Synthetic test", measuredAt: timestamp, physicalSample: "test", validated: true },
    pattern: { version: 1, sourceKey: "garments/test/v1/pattern.json", approvedBy: "fixture", approvedAt: timestamp, dimensionToleranceM: .005 },
    fabric: { calibrationId: "fixture", version: 1, composition: "fixture", status: "sample-calibrated", recordKey: "garments/test/v1/fabric.json", properties: { stretchWarp: [.1,.2], stretchWeft: [.1,.2], bending: [.1,.2], densityKgM2: [.1,.2], thicknessM: [.001,.002], friction: [.1,.2] } },
    arrangementVersion: 1, requiredMeasurements: ["chest", "shoulder", "sleeve", "upperArm"],
    validation: { status: "validated", reportKey: "garments/test/v1/trial.json", participants: 12, sizeAgreement: .95, measurementGate: true, appearanceGate: true, subgroupReview: true, sizes: ["M"], bodyRanges: { chest: [.8,1.2], shoulder: [.35,.5], sleeve: [.5,.7], upperArm: [.2,.4] } },
    sizes: [{ label: "M", blendKey: "garments/test/v1/m.blend", sampleId: "fixture", ranges: { chest: [.93,1], shoulder: [.4,.46], sleeve: [.55,.65], upperArm: [.25,.35] }, bodyChart: { chest: [.9,1.05] }, preferredEase: { chest: [.05,.15] }, dimensions: { chest: dimension(1.06), shoulder: dimension(.45, "length"), sleeve: dimension(.62, "length"), upperArm: dimension(.36), length: dimension(.7, "length") } }],
  };
}
function body(): BodyScan {
  const measurement = (value: number) => ({ value, uncertainty: .005, method: "manual" as const, quality: "validated" as const, overClothing: false });
  return { schemaVersion: 1, id: "test", version: 1, state: "ready", source: "test", format: "glb", units: "m", upAxis: "y", confirmedHeight: 1.75, provenance: "unverified-import", measurements: { chest: measurement(.96), shoulder: measurement(.43), sleeve: measurement(.6), upperArm: measurement(.3) }, corrections: {}, quality: {}, createdAt: timestamp, expiresAt: timestamp, shareFit: false };
}

test("measurement conventions convert units and uncertainty without treating length as girth", () => {
  const d = { value: 50, uncertainty: .5, units: "cm" as const, convention: "flat-width" as const, origin: "published" as const, sourceIndex: 0, method: "pit to pit" };
  assert.deepEqual(dimensionMeters(d, true), { value: 1, uncertainty: .01 });
  assert.equal(dimensionMeters({ ...d, value: 10, units: "in", convention: "length" }).value, .254);
  assert.throws(() => dimensionMeters({ ...d, convention: "length" }, true));
  assert.throws(() => dimensionMeters({ ...d, uncertainty: -1 }));
});
test("registration accepts actual size labels and rejects incomplete or overstated evidence", () => {
  const g = fixture();
  assert.ok(garmentSchema.safeParse(g).success);
  g.sizes[0].label = "32/30"; g.validation.sizes = ["32/30"];
  assert.ok(garmentSchema.safeParse(g).success);
  for (const change of [
    (v: ResearchedGarmentAsset) => { v.sizes.push(structuredClone(v.sizes[0])); },
    (v: ResearchedGarmentAsset) => { delete v.sizes[0].dimensions.chest; },
    (v: ResearchedGarmentAsset) => { v.validation.participants = 11; },
    (v: ResearchedGarmentAsset) => { v.fabric.status = "estimated"; },
    (v: ResearchedGarmentAsset) => { v.sizes[0].dimensions.chest.sourceIndex = 99; },
    (v: ResearchedGarmentAsset) => { v.pattern.sourceKey = "garments/../secret.json"; },
    (v: ResearchedGarmentAsset) => { v.requiredMeasurements = ["chest"]; },
  ]) { const changed = fixture(); change(changed); assert.equal(garmentSchema.safeParse(changed).success, false); }
});
test("fit compares regional uncertainty and abstains outside physical coverage or with ambiguous sizes", () => {
  const g = fixture(), b = body();
  const fit = assessFit(b, g);
  assert.equal(fit.size, "M"); assert.equal(fit.candidates?.[0].regions.length, 4);
  assert.ok(fit.candidates?.[0].regions[0].easeM![0]! > .09);
  g.validation.bodyRanges.chest = [.97,1.2];
  assert.equal(assessFit(b, g).status, "withheld");
  const ambiguous = fixture(); ambiguous.sizes.push({ ...structuredClone(ambiguous.sizes[0]), label: "L" }); ambiguous.validation.sizes.push("L");
  assert.equal(assessFit(b, ambiguous).status, "withheld");
  b.measurements.upperArm!.overClothing = true;
  assert.equal(assessFit(b, fixture()).status, "withheld");
});
test("every authoring dependency changes simulation identity", () => {
  const initial = fixture();
  for (const change of [
    (g: ResearchedGarmentAsset) => { g.pattern.version++; },
    (g: ResearchedGarmentAsset) => { g.fabric.version++; },
    (g: ResearchedGarmentAsset) => { g.arrangementVersion++; },
    (g: ResearchedGarmentAsset) => { g.version++; },
  ]) { const changed = fixture(); change(changed); assert.notDeepEqual(simulationIdentity(changed), simulationIdentity(initial)); }
});
test("researched products retain missing dimensions and cannot register as authored assets", async () => {
  const records = researchSchema.parse(JSON.parse(await readFile(new URL("../infra/body/research/products.json", import.meta.url), "utf8")));
  assert.equal(records.length, 3);
  for (const record of records) { assert.equal(garmentSchema.safeParse(record).success, false); assert.ok(record.missingEvidence.length); }
});
test("operator evidence preserves original measurements, invalidates results and refuses uncovered or stale reports", async () => {
  const database = new PGlite();
  await database.exec(await readFile(new URL("../infra/body/schema.sql", import.meta.url), "utf8"));
  const scanId = "bc53a440-4ae8-4f7a-b294-b98c3470c141";
  const query = async (sql: string, params?: unknown[]) => { const r = await database.query<Record<string, any>>(sql, params); return { rows: r.rows, rowCount: r.affectedRows }; };
  const client = { query } as unknown as PoolClient;
  const report = { scanId, bodyVersion: 1, operator: "fixture", source: "independent-tape", measuredAt: timestamp, studyKey: "garments/study/v1/report.json", values: { chest: { value: .96, uncertainty: .005, overClothing: false } } };
  try {
    await query("INSERT INTO body_scans(id,owner_id,state,metadata,raw_key,raw_bytes,measurements) VALUES($1,'fixture','ready','{}','raw',100,$2)", [scanId, JSON.stringify({ chest: { value: .98, quality: "unvalidated" } })]);
    await assert.rejects(applyIndependentMeasurements(client, report, { participants: 12, measurementGate: true, dimensions: {} }), /cover/);
    await applyIndependentMeasurements(client, report, { participants: 12, measurementGate: true, dimensions: { chest: { passed: true } } });
    const row = (await query("SELECT * FROM body_scans WHERE id=$1", [scanId])).rows[0];
    assert.equal(row.version, 2); assert.equal(row.measurements.chest.value, .98);
    assert.equal(row.corrections.chest.quality, "validated"); assert.equal(row.corrections.chest.validationReference, report.studyKey);
    assert.equal((await query("SELECT * FROM body_audit")).rows.length, 1);
    await assert.rejects(applyIndependentMeasurements(client, report, { participants: 12, measurementGate: true, dimensions: { chest: { passed: true } } }), /changed/);
  } finally { await database.close(); }
});
test("version-2 try-ons require reviewed arrangement landmarks and invalidate cache when authoring changes", async () => {
  const database = new PGlite();
  await database.exec(await readFile(new URL("../infra/body/schema.sql", import.meta.url), "utf8"));
  const query = async (sql: string, params?: unknown[]) => { const r = await database.query<Record<string, any>>(sql, params); return { rows: r.rows, rowCount: r.affectedRows || r.rows.length }; };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  (globalThis as typeof globalThis & { bodyPool?: Pool }).bodyPool = pool;
  const scanId = "bc53a440-4ae8-4f7a-b294-b98c3470c141", g = fixture(), b = body();
  const identity = { userId: "fixture", role: "user", scope: "web" } as const;
  const request = { scanId, version: 1, garments: [{ garmentId: g.id, size: "M" }] };
  try {
    await query("INSERT INTO body_scans(id,owner_id,state,metadata,raw_key,raw_bytes,measurements,display_key,collision_key) VALUES($1,'fixture','ready',$2,'raw',100,$3,'display','collision')", [scanId, JSON.stringify({ source: "fixture", format: "glb", units: "m", upAxis: "y", confirmedHeight: 1.75, provenance: "unverified-import" }), JSON.stringify(b.measurements)]);
    await query("INSERT INTO body_garments(id,version,data,enabled) VALUES($1,1,$2,true)", [g.id, JSON.stringify(g)]);
    await assert.rejects(createTryon(identity, request), /landmarks/);
    await query("UPDATE body_scans SET landmarks=$2 WHERE id=$1", [scanId, JSON.stringify({ chestY: 1.3, waistY: 1, hipY: .9, shoulderLeft: [-.2,1.5,0], shoulderRight: [.2,1.5,0], crotch: [0,.8,0], chestFront: [0,1.3,.15], chestBack: [0,1.3,-.15] })]);
    await assert.rejects(createTryon(identity, request), /coverage/);
    await query("UPDATE body_scans SET quality=$2 WHERE id=$1", [scanId, JSON.stringify({ fitReview: "approved" })]);
    const created = await createTryon(identity, request);
    assert.equal(created.assessments[0].size, "M");
    assert.equal((await createTryon(identity, request)).job.id, created.job.id);
    g.version++; g.pattern.version++; g.arrangementVersion++;
    await query("UPDATE body_garments SET version=$2,data=$3 WHERE id=$1", [g.id, g.version, JSON.stringify(g)]);
    assert.notEqual((await createTryon(identity, request)).job.id, created.job.id);
  } finally { delete (globalThis as typeof globalThis & { bodyPool?: Pool }).bodyPool; await database.close(); }
});
