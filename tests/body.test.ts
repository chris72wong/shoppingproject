import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { authenticate, digest, inviteLogin, issueSession, readSession } from "../lib/body/auth";
import { MAX_SCAN_BYTES, meters, uploadSchema } from "../lib/body/contracts";
import { inspectGlb } from "../lib/body/glb";
import { assessFit } from "../lib/body/fit";
import { consumePairing, correctScan, createTryon, deleteScan, ownedScan, ownedTryon, pairing, requestFitReview, reviewScan } from "../lib/body/service";
import { fitSummary } from "../lib/body/summary";
import type { BodyScan, GarmentAsset, Measurements } from "../lib/body/types";
import { GET, POST } from "../app/api/body/[...path]/route";
import { restore, serializeStore, type Store } from "../lib/storage";
import { generate } from "../lib/agent";
import { chatRequestSchema, chatWithGemini } from "../lib/gemini";
import { signedUpload } from "../lib/body/objects";
const alice = { userId: "alice", role: "user", scope: "web" } as const;
const bob = { userId: "bob", role: "user", scope: "web" } as const;
const operator = { userId: "reviewer", role: "operator", scope: "web" } as const;
const id = "bc53a440-4ae8-4f7a-b294-b98c3470c141";
const garmentId = "a7227b21-ac78-43c1-84cb-7fc93bf3899e";
const measurements: Measurements = { chest: { value: .96, uncertainty: .005, quality: "validated", method: "manual", overClothing: false } };
const body = (overrides = {}): BodyScan => ({ schemaVersion: 1, id, version: 1, state: "ready", source: "test", format: "glb", units: "m", upAxis: "y", confirmedHeight: 1.75, provenance: "unverified-import", measurements, corrections: {}, quality: {}, createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), shareFit: false, ...overrides });
const garment: GarmentAsset = { schemaVersion: 1, id: garmentId, version: 1, productId: "u-tee", name: "Measured tee", category: "top", evidence: { source: "physical trial", physicalSample: "sample01", measuredAt: new Date().toISOString(), validated: true }, sizes: [
  { label: "S", blendKey: "garments/tee/s.blend", ranges: { chest: [.80,.92] } },
  { label: "M", blendKey: "garments/tee/m.blend", ranges: { chest: [.93,1.00] } },
  { label: "L", blendKey: "garments/tee/l.blend", ranges: { chest: [1.01,1.12] } },
] };
function glb(document: unknown) {
  const text = Buffer.from(JSON.stringify(document)); const size = Math.ceil(text.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + size + 8 + 4, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2,4); bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(size,12); bytes.writeUInt32LE(0x4e4f534a,16); text.copy(bytes,20);
  bytes.writeUInt32LE(4,20+size); bytes.writeUInt32LE(0x004e4942,24+size); bytes.fill(0,28+size);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
test("input contracts require consent, bounded payloads, explicit units and calibrated native coordinates", () => {
  const input = { format: "glb", source: "scanner", units: "cm", upAxis: "y", confirmedHeight: 1.75, bytes: 1024, consent: true, closeFittingClothing: true };
  assert.ok(uploadSchema.safeParse(input).success);
  for (const change of [{ bytes: MAX_SCAN_BYTES + 1 }, { bytes: 0 }, { consent: false }, { closeFittingClothing: false }, { format: "rgbd" }, { extra: true }]) assert.equal(uploadSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(meters(175,"cm"), 1.75); assert.equal(meters(1750,"mm"), 1.75); assert.throws(() => meters(NaN,"m"));
});
test("GLB rejects external resources, unsupported extensions, corrupted lengths and texture formats", () => {
  const valid = { asset: { version: "2.0" }, buffers: [{ byteLength: 4 }] };
  assert.deepEqual(inspectGlb(glb(valid)), valid);
  for (const patch of [{ buffers: [{ byteLength: 4, uri: "https://attacker.invalid/scan" }] }, { images: [{ uri: "file:///etc/passwd" }] }, { extensionsUsed: ["KHR_draco_mesh_compression"] }, { images: [{ mimeType: "image/svg+xml", bufferView: 0 }] }, { buffers: [{ byteLength: 900 }] }]) assert.throws(() => inspectGlb(glb({ ...valid, ...patch })));
  const corrupt = glb(valid); new DataView(corrupt).setUint32(8, 10, true); assert.throws(() => inspectGlb(corrupt));
});
test("sizing abstains for unvalidated bodies, capture clothing, corrections, incomplete evidence and boundary uncertainty", () => {
  assert.equal(assessFit(body(), garment).status, "withheld"); // Legacy evidence must be migrated.
  for (const m of [{ ...measurements.chest!, quality: "unvalidated" as const }, { ...measurements.chest!, overClothing: true }, { ...measurements.chest!, uncertainty: .05 }, { ...measurements.chest!, uncertainty: -1 }]) assert.equal(assessFit(body({ measurements: { chest: m } }), garment).status, "withheld");
  assert.equal(assessFit(body({ state: "review" }), garment).status, "withheld");
  assert.equal(assessFit(body(), { ...garment, evidence: { ...garment.evidence, validated: false } }).status,"withheld");
  assert.equal(assessFit(body(), { ...garment, sizes: [...garment.sizes, { ...garment.sizes[1], label: "Other" }] }).status,"withheld");
});
test("signed sessions reject tampering, expiry and untrusted identity headers", () => {
  process.env.BODY_SESSION_SECRET = "test-session-secret-at-least-32-characters";
  process.env.BODY_PILOT_INVITES = JSON.stringify([{ userId: alice.userId, role: "user", codeHash: digest("invitation-32-byte-secret-for-test-only") }]);
  assert.equal(inviteLogin("invitation-32-byte-secret-for-test-only").userId,"alice");
  assert.throws(() => inviteLogin("wrong"));
  const token = issueSession(alice); assert.equal(readSession(token).userId,"alice");
  assert.equal(authenticate(new Request("http://localhost", { headers: { cookie: "form-body=" + token } })).userId,"alice");
  assert.throws(() => readSession("X" + token)); assert.throws(() => readSession(issueSession(alice,-10)));
  assert.throws(() => authenticate(new Request("http://localhost", { headers: { "x-user-id": "alice" } })));
});
test("signed uploads bind size, write-once headers and a five-minute expiry", async () => {
  process.env.AWS_ACCESS_KEY_ID="test-access"; process.env.AWS_SECRET_ACCESS_KEY="test-secret";
  process.env.BODY_S3_BUCKET="test-private"; process.env.BODY_S3_REGION="ca-central-1";
  process.env.BODY_S3_ENDPOINT="http://localhost:9000"; process.env.BODY_S3_PATH_STYLE="true";
  const url = new URL(await signedUpload("body/test/raw/input.glb",1024));
  assert.equal(url.origin,"http://localhost:9000");
  assert.equal(url.searchParams.get("X-Amz-Expires"),"300");
  assert.ok(url.searchParams.get("X-Amz-SignedHeaders")?.includes("if-none-match"));
  assert.ok(url.searchParams.get("X-Amz-SignedHeaders")?.includes("content-length"));
});
test("PostgreSQL lifecycle enforces ownership, atomic pairing, cache versions, deletion and review roles", async () => {
  const database = new PGlite();
  await database.exec(await readFile(new URL("../infra/body/schema.sql", import.meta.url),"utf8"));
  const query = async (sql: string, params?: unknown[]) => { const r = await database.query<Record<string, any>>(sql,params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  (globalThis as typeof globalThis & { bodyPool?: Pool }).bodyPool = pool;
  process.env.BODY_PILOT_ENABLED = "true";
  const insert = () => query("INSERT INTO body_scans(id,owner_id,state,metadata,raw_key,raw_bytes,measurements,display_key,collision_key) VALUES($1,$2,'ready',$3,'raw',100,$4,'display','collision')", [id,alice.userId,JSON.stringify({ source: "test", format: "glb", units: "m", upAxis: "y", confirmedHeight: 1.75, provenance: "unverified-import" }),JSON.stringify(measurements)]);
  try {
    await insert();
    assert.equal((await ownedScan(alice,id)).owner_id,"alice");
    await assert.rejects(ownedScan(bob,id), /unavailable/);
    const pair = await pairing(alice); assert.equal((await consumePairing(pair.token)).scope,"capture"); await assert.rejects(consumePairing(pair.token), /expired or already used/);
    await query("INSERT INTO body_pairings(token_hash,owner_id,expires_at) VALUES($1,'alice',now()-interval '1 second')", [digest("expired")]); await assert.rejects(consumePairing("expired"));
    await query("INSERT INTO body_garments(id,version,data,enabled) VALUES($1,1,$2,true)", [garmentId,JSON.stringify(garment)]);
    const created = await createTryon(alice,{ scanId:id,version:1,garments:[{garmentId,size:"M"}] });
    const cached = await createTryon(alice,{ scanId:id,version:1,garments:[{garmentId,size:"M"}] });
    assert.equal(created.job.id,cached.job.id); assert.equal((await query("SELECT * FROM body_jobs WHERE kind='simulate'")).rows.length,1);
    await assert.rejects(ownedTryon(bob,created.job.id), /unavailable/);
    await assert.rejects(createTryon(alice,{ scanId:id,version:2,garments:[{garmentId,size:"M"}] }), /changed/);
    await assert.rejects(correctScan(bob,id,{version:1,values:{chest:.97}}), /unavailable/);
    await correctScan(alice,id,{version:1,values:{chest:.97}});
    const corrected = await ownedScan(alice,id); assert.equal(corrected.measurements.chest.value,.96); assert.equal(corrected.corrections.chest.value,.97); assert.equal(corrected.version,2);
    assert.equal((await query("SELECT state FROM body_tryons")).rows[0].state,"cancelled");
    await assert.rejects(ownedTryon(alice,created.job.id), /unavailable/);
    await query("UPDATE body_scans SET state='review' WHERE id=$1",[id]);
    const review = {version:2,approve:true,segmentationConfirmed:true,closeClothingConfirmed:true,landmarks:{chestY:1.3,waistY:1,hipY:.9,shoulderLeft:[-.2,1.4,0],shoulderRight:[.2,1.4,0],crotch:[0,.8,0]}};
    await assert.rejects(reviewScan(alice,id,review),/Operator/); await reviewScan(operator,id,review);
    assert.equal((await ownedScan(alice,id)).state,"processing"); await assert.rejects(reviewScan(operator,id,review),/stale/);
    await query("UPDATE body_scans SET state='ready',share_fit=true,corrections='{}' WHERE id=$1",[id]);
    const request = new Request("http://localhost/api/chat",{headers:{cookie:"form-body="+issueSession(alice)}});
    assert.deepEqual(await fitSummary(request,id),{status:"withheld",recommendations:[]});
    assert.equal(await fitSummary(new Request("http://localhost"),id),undefined);
    await query("UPDATE body_scans SET share_fit=false WHERE id=$1",[id]); assert.equal(await fitSummary(request,id),undefined);
    const beforeReview = await ownedScan(alice, id);
    await assert.rejects(requestFitReview(bob, id, { version: beforeReview.version }), /unavailable/);
    await requestFitReview(alice, id, { version: beforeReview.version });
    assert.equal((await ownedScan(alice, id)).state, "review");
    assert.deepEqual((await ownedScan(alice, id)).measurements, {});
    await assert.rejects(requestFitReview(alice, id, { version: beforeReview.version }), /changed/);
    await deleteScan(alice,id);
    await assert.rejects(ownedScan(alice,id),/unavailable/); await assert.rejects(ownedTryon(alice,created.job.id),/unavailable/);
    const deleted = (await query("SELECT * FROM body_scans WHERE id=$1",[id])).rows[0]; assert.deepEqual(deleted.measurements,{}); assert.deepEqual(deleted.metadata,{});
    const purges = (await query("SELECT * FROM body_jobs WHERE kind='purge'")).rows; assert.equal(purges.length,2);
    assert.ok(new Date(purges[1].available_at).getTime() - new Date(purges[0].available_at).getTime() >= 359000);
    assert.equal(await fitSummary(request,id),undefined);
  } finally { delete (globalThis as typeof globalThis & { bodyPool?: Pool }).bodyPool; await database.close(); process.env.BODY_PILOT_ENABLED = "false"; }
});
test("API disabled state, authentication, origin and native capture scopes fail closed", async () => {
  process.env.BODY_PILOT_ENABLED="false";
  const ctx = (path: string[]) => ({ params:Promise.resolve({path}) });
  assert.equal((await GET(new Request("http://localhost/api/body/config"),ctx(["config"]))).status,200);
  assert.equal((await GET(new Request("http://localhost/api/body/scans"),ctx(["scans"]))).status,404);
  process.env.BODY_PILOT_ENABLED="true"; process.env.BODY_PUBLIC_ORIGIN="http://localhost";
  assert.equal((await GET(new Request("http://localhost/api/body/scans"),ctx(["scans"]))).status,401);
  const capture = issueSession({...alice,scope:"capture"});
  assert.equal((await GET(new Request("http://localhost/api/body/scans",{headers:{authorization:"Bearer "+capture}}),ctx(["scans"]))).status,403);
  assert.equal((await POST(new Request("http://localhost/api/body/scans",{method:"POST",headers:{origin:"https://other.invalid"}}),ctx(["scans"]))).status,403);
  process.env.BODY_PILOT_ENABLED="false";
});
test("browser persistence excludes body dimensions and legacy complete flags do not prove a scan", () => {
  const profile = {styles:[],colors:[],avoid:"",fit:"Regular",budget:250,occasion:"Everyday",weights:{},inspiration:[]};
  const store: Store = { profile, scan:{ complete:true,height:175,chest:96,waist:80,hip:98,shoulder:44,fit:"Regular" }, outfits:generate("everyday",profile),saved:[],wardrobe:[],custom:[],messages:[],selected:0 };
  assert.deepEqual(JSON.parse(serializeStore(store)).scan,{fit:"Regular"});
  assert.equal(restore(JSON.stringify(store),store).scan.complete,false);
});
test("structured body data and client fit claims cannot enter Gemini context", async () => {
  const profile={styles:[],colors:[],avoid:"",fit:"Regular",budget:250,occasion:"Everyday"};
  const input=chatRequestSchema.parse({message:"Style advice",history:[],scan:{raw:"secret"},fitSummary:{size:"invented"},state:{profile,outfits:[],selected:-1,pending:"",wardrobe:[],custom:[],measurements,bodyScan:body()}});
  await chatWithGemini(input,{apiKey:"test",fitSummary:{status:"withheld",recommendations:[]},fetcher:async (_url,init) => {
    const context=JSON.parse(JSON.parse(init!.body as string).input); assert.equal(context.state.measurements,undefined); assert.equal(context.state.bodyScan,undefined); assert.equal(context.scan,undefined); assert.deepEqual(context.fitSummary,{status:"withheld",recommendations:[]});
    return Response.json({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify({action:"reply",text:"Sizing evidence is unavailable.",selected:-1,profile,updates:[]})}]}]});
  }});
});
