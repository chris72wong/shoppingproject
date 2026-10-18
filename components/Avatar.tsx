"use client";
import { Component, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Outfit, Product, ScanProfile, AvatarModelId } from "@/lib/types";
import { PerspectiveCamera, Vector3 } from "three";
import SampleHuman from "./SampleHuman";
import { previewManifest, sampleCombination } from "@/lib/preview-capsule";
import BodyMesh, { type BodyPreview } from "./BodyMesh";
function FrameAvatar({ reset }: { reset: number }) {
  const { camera, size } = useThree();
  const previousReset = useRef<number | null>(null);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const halfFov = camera.fov * Math.PI / 360;
    const height = 3.3;
    const width = 2.5;
    const distance = Math.max(height / 2 / Math.tan(halfFov), width / 2 / Math.tan(halfFov) / (size.width / Math.max(1, size.height))) / 0.94;
    const resetDirection = previousReset.current === null || previousReset.current !== reset;
    const direction = resetDirection ? new Vector3(0, 0, 1) : camera.position.clone().normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    previousReset.current = reset;
  }, [camera, size.width, size.height, reset]);
  return null;
}
function AnimationClock({ elapsed, active }: { elapsed: React.MutableRefObject<number>; active: boolean }) {
  useFrame((_, delta) => { if (active) elapsed.current += Math.min(delta, .1); });
  return null;
}
function LoadingSignal({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => { onChange(true); return () => onChange(false); }, [onChange]);
  return null;
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() { this.props.onFailure?.(); }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function Avatar({
  outfit,
  extra = [],
  angle = 0,
  onItem,
  onSelectItem,
  interactive = true,
  bodyPreview,
  previewProductIds,
  modelId = "model-1",
}: {
  outfit: Outfit;
  profile: ScanProfile;
  extra?: Product[];
  angle?: number;
  onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
  interactive?: boolean;
  bodyPreview?: BodyPreview;
  previewProductIds?: string[];
  modelId?: AvatarModelId;
}) {
  const container = useRef<HTMLDivElement>(null), elapsed = useRef(0);
  const [paused, setPaused] = useState(false), [visible, setVisible] = useState(true);
  const [foreground, setForeground] = useState(true);
  const [reduced, setReduced] = useState(true), [reset, setReset] = useState(0);
  const ids = previewProductIds ?? outfit.items.map(item => item.productId);
  const combination = sampleCombination(ids);
  const active = interactive && !bodyPreview && visible && foreground && !paused && !reduced;
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [meshError, setMeshError] = useState("");
  const [garmentError, setGarmentError] = useState(false);
  useEffect(() => setGarmentError(false), [combination?.url, modelId]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches); update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = container.current; if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting)); observer.observe(element);
    const visibility = () => setForeground(!document.hidden); visibility(); document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [supported]);
  useEffect(() => setMeshError(""), [bodyPreview?.url]);
  useEffect(() => {
    const c = document.createElement("canvas");
    setSupported(!!(c.getContext("webgl2") || c.getContext("webgl")));
  }, []);
  if (supported === null)
    return <div className="avatar-loading">Preparing your studio…</div>;
  if (!supported) return <p role="status">3D is unavailable on this device. Product details remain available.</p>;
  if (meshError) return <div className="avatar-fallback" role="alert">{meshError}</div>;
  return (
    <Boundary fallback={<p role="alert">The 3D human could not load. Refresh to retry; product details remain available.</p>}>
      <div ref={container} style={{ position: "relative", width: "100%", height: "100%" }}>
      {loading && <div className="avatar-loading" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 1, pointerEvents: "none" }}>Loading textured human avatar…</div>}
      <Canvas
        frameloop={active ? "always" : "demand"}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6.5], fov: 30 }}
        gl={{ alpha: true }}
        aria-label={bodyPreview ? "Personal body scan. Drag to rotate." : `${modelId === "model-1" ? "Model 1" : "Model 2"}. Animated outfit preview. Drag to rotate.`}
      >
        <FrameAvatar reset={reset} />
        <AnimationClock elapsed={elapsed} active={active} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-normalBias={.025} shadow-bias={-.0001} />
        <directionalLight position={[-3, 2, -3]} intensity={1.2} />
        <Suspense fallback={<LoadingSignal onChange={setLoading} />}>
          <group rotation={[0, angle, 0]}>
            {bodyPreview ? <BodyMesh preview={bodyPreview} onItem={onItem} onSelectItem={onSelectItem} onError={setMeshError} /> :
              <Boundary key={`${modelId}:${combination?.url || "base-human"}`} onFailure={() => setGarmentError(true)} fallback={null}>
                <Suspense fallback={<LoadingSignal onChange={setLoading} />}><SampleHuman modelId={modelId} productIds={ids} elapsed={elapsed} onItem={onItem} onSelectItem={onSelectItem} /></Suspense>
              </Boundary>}
          </group>
          <ContactShadows
            position={[0, -1.51, 0]}
            opacity={0.35}
            scale={7}
            blur={2.5}
            far={4}
          />
        </Suspense>
        <OrbitControls
          enabled={interactive}
          enableDamping={false}
          onStart={() => onItem?.(null)}
          enableZoom={false}
          target={[0, 0, 0]}
          enablePan={false}
          minPolarAngle={0.9}
          maxPolarAngle={1.8}
        />
      </Canvas>
      {interactive && <div className="human-controls">
        {!bodyPreview && <button type="button" disabled={reduced} aria-pressed={!paused && !reduced} onClick={() => setPaused(value => !value)}>{reduced ? "Reduced motion" : paused ? "Play" : "Pause"}</button>}
        <button type="button" onClick={() => setReset(value => value + 1)}>Reset view</button>
      </div>}
      {!bodyPreview && (garmentError || !combination) && <p className="human-preview-status" role="status">{garmentError ? "This preview could not load. Choose another model or outfit, or refresh to retry." : "This saved outfit has no matching preview. Choose a current look."}</p>}
      </div>
    </Boundary>
  );
}
