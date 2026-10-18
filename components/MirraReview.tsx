"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import SampleHuman from "./SampleHuman";
import manifest from "@/public/models/mirra-manifest.json";
import type { AvatarModelId } from "@/lib/types";

function Clock({ elapsed, playing }: { elapsed: React.MutableRefObject<number>; playing: boolean }) {
  useFrame((_, delta) => { if (playing) elapsed.current = (elapsed.current + delta) % 12; });
  return null;
}
type ReviewView = "body" | "face" | "hands" | "garment";
function Camera({ view }: { view: ReviewView }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const [height, distance] = view === "face" ? [1.1, 2.2] : view === "hands" ? [-.28, 2.8] : view === "garment" ? [.35, 3.6] : [0, 6.7];
    camera.position.set(0, height, distance); camera.lookAt(0, height, 0); camera.updateProjectionMatrix(); invalidate();
  }, [camera, view, invalidate]);
  return null;
}
export default function MirraReview() {
  const [model, setModel] = useState<AvatarModelId>("model-1");
  const [index, setIndex] = useState(0), [angle, setAngle] = useState(0), [view, setView] = useState<ReviewView>("body"), [playing, setPlaying] = useState(true);
  const elapsed = useRef(0);
  const [phase, setPhase] = useState(0);
  const [rendered, setRendered] = useState("");
  const reported = useRef("");
  const models = manifest.models as Record<string, { assets: { productIds: string[]; sha256: string }[] }>;
  const assets = models[model]?.assets ?? [];
  const asset = assets[Math.min(index, assets.length - 1)];
  return <main style={{ padding: 20, height: "100dvh", display: "flex", flexDirection: "column", gap: 12 }}>
    <h1 style={{ fontSize: 24 }}>Mirra visual review</h1>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Model <select aria-label="Review model" value={model} onChange={e => { setModel(e.target.value as AvatarModelId); setIndex(0); }}><option value="model-1">Model 1</option><option value="model-2">Model 2</option></select></label>
      <label>Asset <select aria-label="Review asset" value={index} onChange={e => setIndex(Number(e.target.value))}>{assets.map((a, i) => <option key={i} value={i}>{i}: {a.productIds.join(" + ")}</option>)}</select></label>
      <button onClick={() => setAngle(0)}>Front</button><button onClick={() => setAngle(Math.PI / 2)}>Side</button><button onClick={() => setAngle(Math.PI)}>Back</button>
      <button aria-pressed={view === "face"} onClick={() => setView(view === "face" ? "body" : "face")}>{view === "face" ? "Full body" : "Face close-up"}</button>
      <button aria-pressed={view === "hands"} onClick={() => setView(view === "hands" ? "body" : "hands")}>Hands close-up</button>
      <button aria-pressed={view === "garment"} onClick={() => setView(view === "garment" ? "body" : "garment")}>Garment close-up</button>
      <button onClick={() => setView("body")}>Full-body view</button>
      <button onClick={() => setPlaying(!playing)}>{playing ? "Pause review" : "Play review"}</button>
      {[0, 2.25, 3, 6, 9, 11.95].map(t => <button key={t} onClick={() => { elapsed.current = t; setPhase(t); setPlaying(false); }}>Phase {t}s</button>)}
    </div>
    <p style={{ fontSize: 11 }}>Asset {index + 1}/{assets.length} · {asset?.sha256}</p>
    <p role="status" style={{ fontSize: 11 }}>{playing ? "Live playback" : rendered.includes(asset?.sha256 || "missing") && rendered.endsWith(`@ ${phase.toFixed(2)}s`) ? `Rendered ${rendered}` : `Waiting for selected asset at ${phase.toFixed(2)}s…`}</p>
    <div style={{ flex: 1, minHeight: 0, border: "1px solid #ddd", background: "#eeefe7" }}>
      {asset && <Canvas frameloop={playing ? "always" : "demand"} camera={{ position: [0, 0, 6.7], fov: 30 }} dpr={[1, 1.5]} shadows>
        <Camera view={view} /><Clock elapsed={elapsed} playing={playing} />
        <ambientLight intensity={1.1} /><directionalLight position={[3, 6, 4]} intensity={1.6} castShadow shadow-normalBias={.025} /><directionalLight position={[-3, 2, -3]} intensity={1.2} />
        <Suspense fallback={null}><group rotation={[0, angle, 0]}><SampleHuman modelId={model} productIds={asset.productIds} elapsed={elapsed} reviewTime={playing ? undefined : phase} onReviewFrame={playing ? undefined : (url, seconds) => {
          const key=`${url} @ ${seconds.toFixed(2)}s`;
          if (reported.current !== key) { reported.current=key; setRendered(key); }
        }} /></group><ContactShadows position={[0, -1.51, 0]} opacity={.35} scale={7} blur={2.5} far={4} /></Suspense>
      </Canvas>}
    </div>
  </main>;
}
