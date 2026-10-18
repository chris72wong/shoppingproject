"use client";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import type { FitAssessment, GarmentAsset, TryOnJob } from "@/lib/body/types";
import { garmentForProduct, outfitPreviewKey, selectionMatchesJob } from "@/lib/body/outfit-tryon";
import type { BodyPreview } from "./BodyMesh";

async function api(path: string, signal: AbortSignal, data?: unknown) {
  const response = await fetch("/api/body/" + path, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), cache: "no-store", method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Try-on is unavailable.");
  return value;
}

export default function ShoppingTryOn({ products, selectedId, body, onPreview }: {
  products: Product[]; selectedId: string | null; body?: BodyPreview;
  onPreview: (preview: BodyPreview | undefined) => void;
}) {
  const [assets, setAssets] = useState<GarmentAsset[]>([]);
  const [availability, setAvailability] = useState("loading");
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [single, setSingle] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [request, setRequest] = useState<{ key: string; selections: { garmentId: string; version: number; size: string }[] }>();
  const [state, setState] = useState<{ key: string; job?: TryOnJob; assessments?: FitAssessment[]; error?: string }>();
  const targets = single ? products.filter(p => p.id === targetId) : products;
  const wearable = targets.filter(p => ["top", "bottom", "outerwear"].includes(p.category));
  const mapped = wearable.map(product => ({ product, asset: garmentForProduct(product, assets) }));
  const key = outfitPreviewKey(body?.scanId, body?.version, targets, sizes);
  const current = state?.key === key ? state : undefined;
  const ready = current?.job?.state === "ready";
  const busy = !!request && request.key === key && !current?.error && (!current?.job || ["queued", "processing"].includes(current.job.state));
  const incomplete = !wearable.length || mapped.some(({ asset }) => !asset || !asset.sizes.some(s => s.label === sizes[asset.id]));

  useEffect(() => {
    if (!body?.scanId) { setAvailability("scan-required"); return; }
    const abort = new AbortController();
    void api("garments", abort.signal).then(value => { setAssets(value.garments); setAvailability("ready"); })
      .catch(error => { if (!abort.signal.aborted) setAvailability(error.message); });
    return () => abort.abort();
  }, [body?.scanId]);

  useEffect(() => {
    if (!request || request.key !== key || !body?.scanId) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const scanId = body.scanId, version = body.version;
    async function receive(job: TryOnJob, assessments?: FitAssessment[]) {
      if (abort.signal.aborted) return;
      if (!selectionMatchesJob(job, scanId, version, request!.selections)) throw new Error("The result does not match this body, outfit and size selection. Please retry.");
      setState(previous => ({ key, job, assessments: assessments ?? previous?.assessments }));
      if (job.state === "ready") {
        if (!job.resultUrl) throw new Error("The clothing result is unavailable.");
        onPreview({ ...body!, url: job.resultUrl, baseUrl: body!.baseUrl || body!.url, simulated: true, productIds: wearable.map(p => p.id) });
      } else if (["queued", "processing"].includes(job.state)) {
        timer = setTimeout(() => { void api("tryons/" + job.id, abort.signal).then(next => receive(next)).catch(fail); }, 3000);
      }
    }
    function fail(error: Error) { if (!abort.signal.aborted) { onPreview(undefined); setState({ key, error: error.message }); } }
    setState({ key }); onPreview(undefined);
    void api("tryons", abort.signal, { scanId, version, garments: request.selections.map(({ garmentId, size }) => ({ garmentId, size })) })
      .then(value => receive(value.job, value.assessments)).catch(fail);
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [request, key, body?.scanId, body?.version, onPreview]);

  function change(action: () => void) { onPreview(undefined); setRequest(undefined); setState(undefined); action(); }
  return <details className="shopping-tryon">
    <summary>Try selected clothes on your body</summary>
    {!body?.scanId ? <p>Add and review a personal body scan in Your body scan. The sample human wears its original clothing and cannot establish your fit.</p> : <>
      <div className="avatar-item-controls" aria-label="Try-on selection">
        <button type="button" aria-pressed={!single} onClick={() => change(() => setSingle(false))}>Outfit garments</button>
        <button type="button" aria-pressed={single && targetId === selectedId} disabled={!selectedId} onClick={() => change(() => { setTargetId(selectedId); setSingle(true); })}>Inspected piece</button>
      </div>
      {single && <p>Previewing: {targets[0]?.name || "Choose a clothing piece"}</p>}
      <p>Choose an actual garment size. The preview preserves its dimensions; clothing is never resized to force a fit.</p>
      {availability === "loading" && <p role="status">Checking product models…</p>}
      {!["loading", "ready"].includes(availability) && <p role="status">{availability}</p>}
      {mapped.map(({ product, asset }) => <article key={product.id} className="tryon-product">
        <strong>{product.name}</strong>
        {!asset ? <p>No matching product-specific garment model is available. An exact product, variant, size measurements and authored garment are required.</p> : <>
          <label>Size<select value={sizes[asset.id] || ""} onChange={event => change(() => setSizes(previous => ({ ...previous, [asset.id]: event.target.value })))}>
            <option value="">Choose size</option>{asset.sizes.map(size => <option key={size.label} value={size.label}>{size.label}</option>)}
          </select></label>
          <details><summary>Product and fit evidence · {asset.validation?.status === "validated" ? "physically tested coverage" : "estimated"}</summary>
            <p>{asset.identity?.brand} · {asset.identity?.sku} · {asset.identity?.variant} · {asset.identity?.region}</p>
            <p>Material: {asset.fabric?.composition}. Fabric behavior: {asset.fabric?.status === "sample-calibrated" ? "sample calibrated" : "estimated; drape unverified"}.</p>
            {asset.sources?.map((source, index) => <p key={index}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.kind} · {new Date(source.retrievedAt).toLocaleDateString()}</a> — {source.note}</p>)}
            {asset.sizes.filter(size => size.label === sizes[asset.id]).map(size => <ul key={size.label}>{Object.entries(size.dimensions || {}).map(([name, d]) => <li key={name}>{name}: {d.value} ± {d.uncertainty} {d.units} · {d.convention} · {d.origin} · {d.method}</li>)}</ul>)}
          </details>
        </>}
      </article>)}
      {targets.some(p => !["top", "bottom", "outerwear"].includes(p.category)) && <p>Shoes and accessories are not included in this garment simulation.</p>}
      {!wearable.length && <p>Select a top, trousers or outerwear piece to try it on.</p>}
      <button type="button" disabled={availability !== "ready" || incomplete || busy} onClick={() => {
        onPreview(undefined);
        setRequest({ key, selections: mapped.map(({ asset }) => ({ garmentId: asset!.id, version: asset!.version, size: sizes[asset!.id] })) });
      }}>{busy ? "Simulating clothing…" : "Preview selected sizes"}</button>
      {current?.error && <p role="alert">{current.error}</p>}
      {current?.job && <p role="status">{current.job.state} · {current.job.progress}% {current.job.error}{ready ? " · estimated fixed-pose appearance" : ""}</p>}
      {current?.assessments?.map(assessment => <article key={assessment.garmentId}><p>Previewed size: {sizes[assessment.garmentId]}. {assessment.status === "recommended" ? `Recommended size: ${assessment.size}.` : "Size recommendation withheld."} {assessment.reason}</p>
        {assessment.candidates && <details><summary>Fit by size and body region</summary>{assessment.candidates.map(candidate => <div key={candidate.size}><strong>{candidate.size}</strong><ul>{candidate.regions.map(region => <li key={region.region}>{region.region}: {region.status}. {region.reason}</li>)}</ul></div>)}</details>}
      </article>)}
      <p>A realistic-looking preview does not verify physical fit. Size recommendations require validated body and garment evidence.</p>
    </>}
  </details>;
}
