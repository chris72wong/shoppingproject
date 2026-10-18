"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { BodyScan, FitAssessment, GarmentAsset, MeasurementName, ReviewLandmarks, TryOnJob } from "@/lib/body/types";
import { measurementNames } from "@/lib/body/types";
import type { BodyPreview } from "./BodyMesh";
import { MAX_SCAN_BYTES } from "@/lib/body/contracts";
import "./body.css";
const Viewer = dynamic(() => import("./BodyReviewViewer"), { ssr: false });
async function api(path: string, method = "GET", data?: unknown) {
  const response = await fetch("/api/body/" + path, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "Body scan request failed."); return value;
}
const landmarkKeys = ["chestY", "waistY", "hipY", "shoulderLeft", "shoulderRight", "crotch"] as const;
const extraLandmarkKeys = ["chestFront", "chestBack", "waistFront", "waistBack", "hipFront", "hipBack", "elbowLeft", "wristLeft", "upperArmLeft", "thighLeft"] as const;
const allLandmarkKeys = [...landmarkKeys, ...extraLandmarkKeys];
export default function BodyPanel({ onPreview }: { onPreview?: (preview: BodyPreview | undefined) => void }) {
  const [enabled, setEnabled] = useState(false), [identity, setIdentity] = useState<{ role: string } | null>(null);
  const [scans, setScans] = useState<BodyScan[]>([]), [selected, setSelected] = useState<string>("");
  const [assets, setAssets] = useState<GarmentAsset[]>([]), [sizes, setSizes] = useState<Record<string,string>>({});
  const [research, setResearch] = useState<{ sku: string; name: string; variant: string; composition: string; sources: { url: string }[]; missingEvidence: string[] }[]>([]);
  const [job, setJob] = useState<TryOnJob | null>(null), [assessments, setAssessments] = useState<FitAssessment[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [qr, setQr] = useState(""), [pairExpiry, setPairExpiry] = useState(0);
  const [reviews, setReviews] = useState<BodyScan[]>([]), [reviewId, setReviewId] = useState("");
  const [landmarks, setLandmarks] = useState<Partial<ReviewLandmarks>>({}), [picking, setPicking] = useState<typeof allLandmarkKeys[number]>("chestY");
  const scan = scans.find(s => s.id === selected), review = reviews.find(s => s.id === reviewId);
  const load = useCallback(async () => { const result = await api("scans"); setScans(result.scans); }, []);
  useEffect(() => { let active = true; void api("config").then(async config => {
    if (!active) return; setEnabled(config.enabled); if (!config.enabled) return;
    try { const session = await api("session"); if (active) { setIdentity(session); await load(); } } catch { /* Invitation form is the signed-out state. */ }
  }).catch(() => {}); return () => { active = false; }; }, [load]);
  useEffect(() => { if (!identity) return; void api("garments").then(r => setAssets(r.garments)).catch(e => setError(e.message)); }, [identity]);
  useEffect(() => { if (!identity) { setResearch([]); return; } let active = true; void api("garment-research").then(r => { if (active) setResearch(r.products); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [identity]);
  useEffect(() => {
    if (!identity || !scans.some(s => ["uploading", "processing", "review"].includes(s.state))) return;
    const interval = setInterval(() => { void load().catch(e => setError(e.message)); }, 5000); return () => clearInterval(interval);
  }, [identity, scans, load]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.state)) return;
    const interval = setInterval(() => { void api("tryons/" + job.id).then(setJob).catch(e => { setError(e.message); setJob(null); }); }, 3000);
    return () => clearInterval(interval);
  }, [job]);
  const preview: BodyPreview | undefined = scan?.state === "ready" && scan.displayUrl ? {
    url: job?.state === "ready" && job.scanId === scan.id && job.bodyVersion === scan.version ? job.resultUrl! : scan.displayUrl,
    height: scan.confirmedHeight, version: scan.version, scanId: scan.id, simulated: job?.state === "ready" && job.scanId === scan.id && job.bodyVersion === scan.version,
    baseUrl: scan.displayUrl,
  } : undefined;
  useEffect(() => { onPreview?.(preview); }, [preview?.url, preview?.version, preview?.height, preview?.simulated, onPreview]); // Only public references leave this component.
  useEffect(() => () => onPreview?.(undefined), [onPreview]);
  useEffect(() => { if (!qr) return; const timer = setTimeout(() => setQr(""), Math.max(0, pairExpiry - Date.now())); return () => clearTimeout(timer); }, [qr, pairExpiry]);
  async function run(task: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); } }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget), file = form.get("file") as File;
    await run(async () => {
      if (!file?.size || file.size > MAX_SCAN_BYTES) throw new Error("Choose a GLB or PLY file up to 150 MiB.");
      const format = file.name.split(".").pop()?.toLowerCase(); if (format !== "glb" && format !== "ply") throw new Error("Choose a GLB or PLY export.");
      const result = await api("scans", "POST", { format, source: form.get("source"), units: form.get("units"), upAxis: form.get("axis"), confirmedHeight: Number(form.get("height")) / 100, bytes: file.size, consent: form.get("consent") === "on", closeFittingClothing: form.get("clothing") === "on" });
      setSelected(result.scan.id); await load();
      const response = await fetch(result.uploadUrl, { method: "PUT", headers: result.uploadHeaders, body: file });
      if (!response.ok) throw new Error("Upload failed. Remove this upload and retry with a new one.");
      await api(`scans/${result.scan.id}/finalize`, "POST", {}); await load();
    });
  }
  if (!enabled) return null;
  return <section className="body-panel" aria-label="Private body scan pilot">
    <details><summary>Your body scan <span>Private pilot</span></summary>
      <p>Import a scan or capture with an assistant using the iOS companion. A personal scan previews your body; realistic garments require measured pilot assets.</p>
      {error && <p role="alert" className="body-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      {!identity ? <form onSubmit={event => { event.preventDefault(); const code = new FormData(event.currentTarget).get("code"); void run(async () => { setIdentity(await api("session", "POST", { code })); await load(); }); }}>
        <label>Pilot invitation code<input name="code" type="password" minLength={16} autoComplete="off" required /></label><button disabled={busy}>Sign in</button>
      </form> : <>
        <button disabled={busy} onClick={() => void run(async () => { await api("session", "DELETE"); setIdentity(null); setScans([]); setSelected(""); setJob(null); setReviews([]); setQr(""); })}>Sign out</button>
        <form onSubmit={upload} className="body-upload">
          <label>Scan export (GLB or PLY, up to 150 MiB)<input name="file" type="file" accept=".glb,.ply" required /></label>
          <label>Scanner app / source<input name="source" placeholder="App name and version" required minLength={2} maxLength={100} /></label>
          <label>Your measured height (cm)<input name="height" type="number" min={80} max={250} step="0.1" required /></label>
          <label>Export units<select name="units"><option value="m">Meters</option><option value="cm">Centimeters</option><option value="mm">Millimeters</option></select></label>
          <label>Export up axis<select name="axis"><option value="y">Y up</option><option value="z">Z up</option></select></label>
          <label className="body-check"><input name="clothing" type="checkbox" required />I was stationary in an A-pose wearing close-fitting clothing.</label>
          <label className="body-check"><input name="consent" type="checkbox" required />I consent to private cloud processing and authorized pilot review. Raw captures are deleted within 24 hours; results expire after 30 days of inactivity. I can delete them sooner.</label>
          <button disabled={busy}>{busy ? "Working…" : "Upload scan"}</button>
        </form>
        <button disabled={busy} onClick={() => void run(async () => {
          const result = await api("pairings", "POST", {}); const QRCode = await import("qrcode");
          const url = `formcapture://pair?origin=${encodeURIComponent(location.origin)}&token=${result.token}`;
          setQr(await QRCode.toDataURL(url)); setPairExpiry(Date.now() + result.expiresIn * 1000);
        })}>Pair iPhone / iPad</button>
        {qr && <div><img src={qr} alt="Single-use pairing code for the Mirra Capture app" width={220} height={220} /><p>Open with the Mirra Capture companion. Expires in five minutes; usable once.</p></div>}
        <button disabled={busy} onClick={() => void run(load)}>Refresh scans</button>
        {!!scans.length && <label>Scan<select value={selected} onChange={e => { setSelected(e.target.value); setJob(null); setAssessments([]); }}><option value="">Illustrative mannequin</option>{scans.map(s => <option key={s.id} value={s.id}>{s.source} · {s.state} · {new Date(s.createdAt).toLocaleDateString()}</option>)}</select></label>}
        {scan && <article>
          <p role="status">{scan.state} · {scan.provenance === "native-depth" ? "Paired depth capture" : "Unverified import"}. {scan.error}</p>
          {scan.state === "uploading" && <button disabled={busy} onClick={() => void run(async () => { await api(`scans/${scan.id}/finalize`, "POST", {}); await load(); })}>Retry processing uploaded file</button>}
          <button disabled={busy} onClick={() => void run(async () => { await api(`scans/${scan.id}`, "DELETE"); setSelected(""); setJob(null); await load(); })}>Delete scan and results</button>
          {preview && !onPreview && <Viewer preview={preview} onError={setError} />}
          {scan.state === "ready" && <>
            <button disabled={busy} onClick={() => void run(async () => { await api(`scans/${scan.id}/fit-review`, "POST", { version: scan.version }); setJob(null); setAssessments([]); await load(); })}>Request garment landmark review (clears measurements and previous results)</button>
            <p>{preview?.simulated ? "Estimated clothing preview · fixed pose. Physical fit and comfort are not established by the image." : "Body scan only · existing demo clothing is not overlaid."}</p>
            <form key={scan.id + scan.version} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const values: Partial<Record<MeasurementName,number>> = {}; measurementNames.forEach(k => { if (form.get(k)) values[k] = Number(form.get(k)) / 100; }); void run(async () => { await api(`scans/${scan.id}/corrections`, "PATCH", { version: scan.version, values }); setJob(null); setAssessments([]); await load(); }); }}>
              <h3>Measurements</h3><p>Original measurements remain unchanged. Manual corrections are unvalidated and invalidate previous fit results.</p>
              {measurementNames.map(k => <label key={k}>{k} (cm) · original {scan.measurements[k] ? `${(scan.measurements[k]!.value * 100).toFixed(1)} ± ${(scan.measurements[k]!.uncertainty * 100).toFixed(1)}, ${scan.measurements[k]!.overClothing ? "over capture clothing, " : ""}${scan.measurements[k]!.quality}` : "unavailable"}<input name={k} type="number" min={5} max={250} step="0.1" defaultValue={scan.corrections[k] ? scan.corrections[k]!.value * 100 : ""} placeholder="Optional correction" /></label>)}
              <button disabled={busy}>Save corrections</button>
            </form>
            <h3>Pilot garments</h3>
            {!!research.length && <details><summary>Garment research · awaiting samples and measurements</summary>{research.map(product => <article key={product.sku}><h4>{product.name} · {product.sku} · {product.variant}</h4><p>{product.composition}</p><a href={product.sources[0].url} target="_blank" rel="noreferrer">Researched product page</a><ul>{product.missingEvidence.map(item => <li key={item}>{item}</li>)}</ul></article>)}</details>}
            {!assets.length && <p>No measured garment assets are available yet. Demo catalog illustrations cannot establish drape or size.</p>}
            {assets.map(asset => <label key={asset.id}>{asset.name} · {asset.identity ? `${asset.identity.brand} ${asset.identity.sku} / ${asset.identity.variant}` : "Legacy asset"} · {asset.validation?.status === "validated" ? "physically validated within tested coverage" : "estimated evidence"}<select value={sizes[asset.id] || ""} onChange={e => { setSizes(v => ({ ...v, [asset.id]: e.target.value })); setJob(null); setAssessments([]); }}><option value="">Do not include</option>{asset.sizes.map(s => <option key={s.label}>{s.label}</option>)}</select></label>)}
            <button disabled={busy || !Object.values(sizes).some(Boolean)} onClick={() => void run(async () => {
              const result = await api("tryons", "POST", { scanId: scan.id, version: scan.version, garments: Object.entries(sizes).filter(([,size]) => size).map(([garmentId,size]) => ({ garmentId,size })) }); setJob(result.job); setAssessments(result.assessments);
            })}>Simulate selected clothing</button>
            {job && <p role="status">Clothing: {job.state} · {job.progress}% {job.error}</p>}
            {assessments.map(a => <article key={a.garmentId}><p>Sizing: {a.status === "recommended" ? a.size : "withheld"} · {a.reason}</p>
              {a.candidates && <details><summary>Compare sizes and body regions</summary>{a.candidates.map(c => <div key={c.size}><strong>{c.size}</strong><ul>{c.regions.map(r => <li key={r.region}>{r.region}: {r.status}{r.easeM ? ` · estimated dimensional ease ${(r.easeM[0] * 100).toFixed(1)}–${(r.easeM[1] * 100).toFixed(1)} cm` : ""}. {r.reason}</li>)}</ul></div>)}</details>}
            </article>)}
            {job?.diagnostics && <p>Simulation includes individual/layered checks and fabric-bound sensitivity estimates. These do not measure pressure or comfort.</p>}
            <label className="body-check"><input type="checkbox" checked={scan.shareFit} disabled={busy} onChange={event => { const shareFit = event.target.checked; void run(async () => { await api(`scans/${scan.id}/consent`, "PATCH", { shareFit }); await load(); }); }} />Allow a server-derived fit summary in stylist chat. Scans and measurements are excluded.</label>
          </>}
        </article>}
        <details><summary>Manual measurements without a scan</summary><p>Use a retailer’s exact size guide to compare your tape measurements. These values stay in this form for this session.</p>{measurementNames.map(k => <label key={k}>{k} (cm)<input type="number" min={5} max={250} step="0.1" /></label>)}<p>Size recommendations remain unavailable without validated garment evidence.</p></details>
        {identity.role === "operator" && <details><summary>Operator review</summary>
          <button disabled={busy} onClick={() => void run(async () => setReviews((await api("review")).scans))}>Load review queue</button>
          <label>Capture to review<select value={reviewId} onChange={e => { setReviewId(e.target.value); setLandmarks({}); }}><option value="">Choose scan</option>{reviews.map(s => <option key={s.id} value={s.id}>{s.id} · {s.source}</option>)}</select></label>
          {review?.displayUrl && <>
            <p>Check segmentation, metric scale, coverage, close-fitting clothing, and A-pose. Reject substantial holes or invented geometry. Click each landmark on the mesh.</p>
            <p>For garment fitting, select front/back torso points at the corresponding chest/waist/hip heights. Limb points are optional; upper-arm extraction also requires the elbow. Missing dimensions remain unavailable.</p>
            <label>Landmark<select value={picking} onChange={e => setPicking(e.target.value as typeof picking)}>{allLandmarkKeys.map(k => <option key={k}>{k}</option>)}</select></label>
            <Viewer preview={{ url: review.displayUrl, height: review.confirmedHeight, version: review.version, simulated: false }} onError={setError} onPoint={point => setLandmarks(v => ({ ...v, [picking]: picking.endsWith("Y") ? point[1] : point }))} />
            <ul>{allLandmarkKeys.map(k => <li key={k}>{k}: {landmarks[k] === undefined ? "not selected" : JSON.stringify(landmarks[k])}</li>)}</ul>
            <form onSubmit={event => { event.preventDefault(); const fitReviewConfirmed = new FormData(event.currentTarget).get("fitReview") === "on"; void run(async () => { await api(`review/${review.id}`, "POST", { version: review.version, approve: true, segmentationConfirmed: true, closeClothingConfirmed: true, ...(fitReviewConfirmed ? { fitReviewConfirmed: true } : {}), landmarks }); setReviews((await api("review")).scans); setReviewId(""); await load(); }); }}>
              <label className="body-check"><input type="checkbox" required />I confirm segmentation and close-fitting capture clothing.</label>
              <label className="body-check"><input name="fitReview" type="checkbox" />I reviewed the A-pose, metric scale, critical surface coverage and capture clothing for garment simulation.</label>
              <button disabled={busy || landmarkKeys.some(k => landmarks[k] === undefined)}>Approve for measurement extraction</button>
            </form>
            <button disabled={busy} onClick={() => void run(async () => { await api(`review/${review.id}`, "POST", { version: review.version, approve: false }); setReviews((await api("review")).scans); setReviewId(""); await load(); })}>Reject and purge capture</button>
          </>}
        </details>}
      </>}
    </details>
  </section>;
}
