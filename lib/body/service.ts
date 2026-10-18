import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, transaction } from "./db";
import { BodyError, digest, type Identity } from "./auth";
import { correctionsSchema, MAX_SCAN_BYTES, reviewSchema, tryOnSchema, uploadSchema } from "./contracts";
import { objectSize, signedUpload } from "./objects";
import { assessFit } from "./fit";
import type { BodyScan, GarmentAsset, Measurements, TryOnJob } from "./types";

type Row = Record<string, any>;
export function publicScan(row: Row, review = false): BodyScan {
  const { source, format, units, upAxis, confirmedHeight, provenance } = row.metadata;
  return { schemaVersion: 1, id: row.id, version: row.version, state: row.state,
    source, format, units, upAxis, confirmedHeight, provenance,
    measurements: row.measurements, corrections: row.corrections, quality: row.quality,
    error: row.error || undefined, shareFit: row.share_fit,
    createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(new Date(row.accessed_at).getTime() + 30 * 86400000).toISOString(),
    ...(row.display_key && (review || row.state === "ready") ? { displayUrl: `/api/body/${review ? "review" : "scans"}/${row.id}/assets/display?v=${row.version}` } : {}),
  };
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const result = await db().query(`INSERT INTO body_rate_limits(key,count,resets_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN body_rate_limits.resets_at<=now() THEN 1 ELSE body_rate_limits.count+1 END,
    resets_at=CASE WHEN body_rate_limits.resets_at<=now() THEN now()+$2*interval '1 second' ELSE body_rate_limits.resets_at END RETURNING count`, [key, seconds]);
  if (result.rows[0].count > max) throw new BodyError("Pilot request limit reached. Try again later.", 429);
}
export async function ownedScan(identity: Identity, id: string, client?: PoolClient, lock = false): Promise<Row> {
  const result = await (client || db()).query(`SELECT * FROM body_scans WHERE id=$1 AND owner_id=$2 AND state<>'deleted' AND accessed_at>now()-interval '30 days' ${lock ? "FOR UPDATE" : ""}`, [id, identity.userId]);
  if (!result.rows.length) throw new BodyError("Scan unavailable.", 404);
  return result.rows[0];
}
export async function queue(client: PoolClient, kind: string, scanId: string, tryonId?: string, delay = 0) {
  await client.query("INSERT INTO body_jobs(id,kind,scan_id,tryon_id,available_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 second')", [randomUUID(), kind, scanId, tryonId || null, delay]);
}
export async function invalidate(client: PoolClient, id: string) {
  await client.query("UPDATE body_tryons SET state='cancelled',result_key=NULL WHERE scan_id=$1", [id]);
  await client.query("UPDATE body_jobs SET state='cancelled' WHERE scan_id=$1 AND kind<>'purge' AND state IN ('queued','running')", [id]);
}
export async function createScan(identity: Identity, data: unknown) {
  const input = uploadSchema.parse(data);
  if (input.format === "rgbd" && identity.scope !== "capture") throw new BodyError("Native captures require a paired device.", 403);
  await rateLimit("upload:" + identity.userId, 5, 86400);
  const id = randomUUID(), rawKey = `body/${id}/raw/input.${input.format === "rgbd" ? "zip" : input.format}`;
  const metadata = { ...input, provenance: input.format === "rgbd" ? "native-depth" : "unverified-import" };
  const uploadUrl = await signedUpload(rawKey, input.bytes);
  const row = (await db().query("INSERT INTO body_scans(id,owner_id,state,metadata,raw_key,raw_bytes) VALUES($1,$2,'uploading',$3,$4,$5) RETURNING *", [id, identity.userId, metadata, rawKey, input.bytes])).rows[0];
  return { scan: publicScan(row), uploadUrl, uploadHeaders: { "Content-Type": "application/octet-stream", "If-None-Match": "*" }, uploadExpiresIn: 300 };
}
export async function finalizeScan(identity: Identity, id: string) {
  return transaction(async client => {
    const row = await ownedScan(identity, id, client, true);
    if (row.state !== "uploading") return publicScan(row);
    if (new Date(row.raw_expires_at).getTime() <= Date.now()) throw new BodyError("Upload expired. Start a new scan.", 410);
    const size = await objectSize(row.raw_key);
    if (size !== Number(row.raw_bytes) || size > MAX_SCAN_BYTES) throw new BodyError("Uploaded file size does not match the declared file.");
    await client.query("UPDATE body_scans SET state='processing' WHERE id=$1", [id]);
    await queue(client, "reconstruct", id);
    return publicScan({ ...row, state: "processing" });
  });
}
export async function deleteScan(identity: Identity, id: string) {
  await transaction(async client => {
    await ownedScan(identity, id, client, true);
    await invalidate(client, id);
    await client.query("UPDATE body_scans SET state='deleted',version=version+1,measurements='{}',corrections='{}',metadata='{}',quality='{}',landmarks=NULL,share_fit=false,error=NULL,display_key=NULL,collision_key=NULL WHERE id=$1", [id]);
    await client.query("DELETE FROM body_pairings WHERE owner_id=$1", [identity.userId]);
    await queue(client, "purge", id);
    // A previously signed upload URL can remain valid for five minutes. Purge
    // again after that window so an in-flight upload cannot resurrect raw data.
    await queue(client, "purge", id, undefined, 360);
    await client.query("INSERT INTO body_audit(actor,scan_id,action) VALUES($1,$2,'delete')", [identity.userId, id]);
  });
}
export async function correctScan(identity: Identity, id: string, data: unknown) {
  const input = correctionsSchema.parse(data);
  await transaction(async client => {
    const row = await ownedScan(identity, id, client, true);
    if (row.version !== input.version || row.state !== "ready") throw new BodyError("Scan changed or is not ready. Refresh and retry.", 409);
    const corrections: Measurements = {};
    for (const [name, value] of Object.entries(input.values)) corrections[name as keyof Measurements] = { value: value!, uncertainty: 0.02, method: "manual", quality: "unvalidated", overClothing: false };
    await invalidate(client, id);
    await client.query("UPDATE body_scans SET corrections=$2,version=version+1,accessed_at=now() WHERE id=$1", [id, { ...row.corrections, ...corrections }]);
  });
}
export async function reviewScan(identity: Identity, id: string, data: unknown) {
  const input = reviewSchema.parse(data);
  if (identity.role !== "operator" || identity.scope !== "web") throw new BodyError("Operator access required.", 403);
  await transaction(async client => {
    const row = (await client.query("SELECT * FROM body_scans WHERE id=$1 AND state='review' AND accessed_at>now()-interval '30 days' FOR UPDATE", [id])).rows[0];
    if (!row || row.version !== input.version) throw new BodyError("Review is stale or unavailable.", 409);
    await client.query("UPDATE body_scans SET state=$2,landmarks=$3,version=version+1 WHERE id=$1", [id, input.approve ? "processing" : "rejected", input.approve ? input.landmarks : null]);
    if (input.approve) await queue(client, "measure", id);
    else { await queue(client, "purge", id); await client.query("UPDATE body_scans SET display_key=NULL,collision_key=NULL,raw_deleted=true WHERE id=$1", [id]); }
    await client.query("INSERT INTO body_audit(actor,scan_id,action) VALUES($1,$2,$3)", [identity.userId, id, input.approve ? "approve-segmentation" : "reject"]);
  });
}
export async function garments(): Promise<GarmentAsset[]> {
  return (await db().query("SELECT data FROM body_garments WHERE enabled=true ORDER BY id")).rows.map(r => r.data);
}
function publicTryon(row: Row): TryOnJob {
  return { schemaVersion: 1, id: row.id, scanId: row.scan_id, bodyVersion: row.body_version, state: row.state, garments: row.garments, progress: row.progress,
    error: row.error || undefined, ...(row.state === "ready" && row.result_key ? { resultUrl: `/api/body/tryons/${row.id}/asset` } : {}) };
}
export async function createTryon(identity: Identity, data: unknown) {
  const input = tryOnSchema.parse(data);
  await rateLimit("tryon:" + identity.userId, 30, 3600);
  return transaction(async client => {
    const scan = await ownedScan(identity, input.scanId, client, true);
    if (scan.state !== "ready" || scan.version !== input.version) throw new BodyError("Scan changed or is not ready.", 409);
    const assets: GarmentAsset[] = (await client.query("SELECT data FROM body_garments WHERE enabled=true AND id=ANY($1::uuid[])", [input.garments.map(g => g.garmentId)])).rows.map(r => r.data);
    if (assets.length !== input.garments.length || new Set(assets.map(a => a.category)).size !== assets.length) throw new BodyError("Select at most one supported garment per category.");
    const selections = input.garments.map(g => {
      const asset = assets.find(a => a.id === g.garmentId)!;
      if (!asset.sizes.some(s => s.label === g.size)) throw new BodyError("Unsupported garment size.");
      return { ...g, version: asset.version };
    }).sort((a,b) => a.garmentId.localeCompare(b.garmentId));
    const cacheKey = digest(JSON.stringify([scan.id, scan.version, selections, "blender-cloth-v1"]));
    const row = (await client.query(`INSERT INTO body_tryons(id,scan_id,owner_id,body_version,cache_key,garments,state)
      VALUES($1,$2,$3,$4,$5,$6,'queued') ON CONFLICT(cache_key) DO UPDATE SET cache_key=EXCLUDED.cache_key RETURNING *`, [randomUUID(), scan.id, identity.userId, scan.version, cacheKey, JSON.stringify(selections)])).rows[0];
    if (row.state === "queued" && !(await client.query("SELECT id FROM body_jobs WHERE tryon_id=$1 AND state IN ('queued','running')", [row.id])).rowCount) await queue(client, "simulate", scan.id, row.id);
    await client.query("UPDATE body_scans SET accessed_at=now() WHERE id=$1", [scan.id]);
    return { job: publicTryon(row), assessments: assets.map(a => assessFit(publicScan(scan), a)) };
  });
}
export async function ownedTryon(identity: Identity, id: string) {
  const row = (await db().query(`SELECT t.* FROM body_tryons t JOIN body_scans s ON s.id=t.scan_id
    WHERE t.id=$1 AND t.owner_id=$2 AND s.state='ready' AND s.version=t.body_version AND s.accessed_at>now()-interval '30 days'`, [id, identity.userId])).rows[0];
  if (!row) throw new BodyError("Try-on unavailable.", 404);
  return { row, job: publicTryon(row) };
}
export async function pairing(identity: Identity) {
  const token = randomBytes(32).toString("base64url");
  await db().query("INSERT INTO body_pairings(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [digest(token), identity.userId]);
  return { token, expiresIn: 300 };
}
export async function consumePairing(token: string): Promise<Identity> {
  const row = (await db().query("UPDATE body_pairings SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING owner_id", [digest(token)])).rows[0];
  if (!row) throw new BodyError("Pairing code expired or already used.", 401);
  return { userId: row.owner_id, role: "user", scope: "capture" };
}
