"use client";
import { Component, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Outfit, Product, ScanProfile } from "@/lib/types";
import { PerspectiveCamera } from "three";
import DatasetAvatar from "./DatasetAvatar";
import { FlatAvatar } from "./FlatAvatar";
import BodyMesh, { type BodyPreview } from "./BodyMesh";
function Illustration({ outfit, extra, onItem, onSelectItem, zoom, label }: {
  outfit: Outfit; extra: Product[]; onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void; zoom: number; label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFit(Math.min(1, Math.max(0.1, (entry.contentRect.height - 30) / 310), entry.contentRect.width / 240));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} style={{ position: "relative", height: "100%", width: "100%" }}>
    <div style={{ position: "absolute", left: "50%", top: "45%", transform: `translate(-50%, -50%) scale(${fit * zoom})` }}>
      <FlatAvatar outfit={outfit} extra={extra} onItem={onItem} onSelectItem={onSelectItem} />
    </div>
    <span style={{ position: "absolute", bottom: 0, width: "100%", textAlign: "center", fontSize: 11 }}>{label}</span>
  </div>;
}
function FrameAvatar() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const halfFov = camera.fov * Math.PI / 360;
    const height = 3.3;
    const width = 2.5;
    const distance = Math.max(height / 2 / Math.tan(halfFov), width / 2 / Math.tan(halfFov) / (size.width / Math.max(1, size.height))) / 0.94;
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}
function LoadingSignal({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => { onChange(true); return () => onChange(false); }, [onChange]);
  return null;
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function Avatar({
  outfit,
  extra = [],
  angle = 0,
  zoom = 1,
  onItem,
  onSelectItem,
  interactive = true,
  bodyPreview,
  illustrated = false,
}: {
  outfit: Outfit;
  profile: ScanProfile;
  extra?: Product[];
  angle?: number;
  zoom?: number;
  onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
  interactive?: boolean;
  bodyPreview?: BodyPreview;
  illustrated?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [meshError, setMeshError] = useState("");
  useEffect(() => setMeshError(""), [bodyPreview?.url]);
  useEffect(() => {
    const c = document.createElement("canvas");
    setSupported(!!(c.getContext("webgl2") || c.getContext("webgl")));
  }, []);
  const fallback = <Illustration outfit={outfit} extra={extra} onItem={onItem} onSelectItem={onSelectItem} zoom={zoom} label="Illustrated preview · 3D unavailable" />;
  if (illustrated) return <Illustration outfit={outfit} extra={extra} onItem={onItem} onSelectItem={onSelectItem} zoom={zoom} label="Outfit illustration · fit is not simulated" />;
  if (supported === null)
    return <div className="avatar-loading">Preparing your studio…</div>;
  if (!supported) return fallback;
  if (meshError) return <div className="avatar-fallback" role="alert">{meshError}</div>;
  return (
    <Boundary key={bodyPreview?.url ?? "dataset-avatar"} fallback={<div style={{ display: "flex", flexDirection: "column", height: "100%" }}><p role="alert" style={{ textAlign: "center", fontSize: 12 }}>The 3D avatar could not load. Refresh to retry, or use Outfit illustration to keep styling.</p><div style={{ flex: 1, minHeight: 0 }}>{fallback}</div></div>}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {loading && <div className="avatar-loading" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 1, pointerEvents: "none" }}>Loading textured human avatar…</div>}
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6.5], fov: 30 }}
        gl={{ alpha: true }}
        aria-label={bodyPreview ? "Personal body scan. Drag to rotate." : "Microsoft Rocketbox sample human avatar. Drag to rotate. Shopping garments are shown in Outfit illustration."}
      >
        <FrameAvatar />
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={2} castShadow />
        <directionalLight position={[-3, 2, -3]} intensity={1.2} />
        <Suspense fallback={<LoadingSignal onChange={setLoading} />}>
          <group rotation={[0, angle, 0]} scale={zoom}>
            {bodyPreview ? <BodyMesh preview={bodyPreview} onItem={onItem} onError={setMeshError} /> : <DatasetAvatar />}
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
      </div>
    </Boundary>
  );
}
