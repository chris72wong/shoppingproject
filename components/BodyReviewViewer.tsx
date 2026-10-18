"use client";
import { Component, type ReactNode, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import BodyMesh, { type BodyPreview } from "./BodyMesh";
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">3D is unavailable on this device. Measurements remain available; use a supported device for visual review.</p> : this.props.children; }
}
export default function BodyReviewViewer({ preview, onPoint, onError }: { preview: BodyPreview; onPoint?: (point: [number,number,number]) => void; onError: (message: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => { const canvas = document.createElement("canvas"); setSupported(!!(canvas.getContext("webgl2") || canvas.getContext("webgl"))); }, []);
  if (supported === null) return <p role="status">Preparing private 3D viewer…</p>;
  if (!supported) return <p>3D is unavailable on this device. Use a supported browser for visual review; measurements and deletion remain available.</p>;
  return <ViewerBoundary key={preview.url}><div className="body-review-viewer"><Canvas camera={{ position: [0, 0.25, 3.4], fov: 40 }} frameloop="demand" dpr={[1, 1.5]} aria-label="Personal body scan. Drag to rotate; select a landmark and click its position.">
    <ambientLight intensity={1.8} /><directionalLight position={[2, 4, 3]} intensity={2.5} />
    <BodyMesh preview={preview} centered onPoint={onPoint} onError={onError} />
    <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} />
  </Canvas></div></ViewerBoundary>;
}
