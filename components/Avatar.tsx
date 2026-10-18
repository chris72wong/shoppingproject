"use client";
import { Component, ReactNode, Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Category, Outfit, Product, ScanProfile } from "@/lib/types";
import { product } from "@/lib/catalog";
import { Vector2 } from "three";
import { FlatAvatar } from "./FlatAvatar";
function Mannequin({
  outfit,
  profile,
  extra,
  onItem,
  onSelectItem,
}: {
  outfit: Outfit;
  profile: ScanProfile;
  extra: Product[];
  onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
}) {
  const get = (cat: string) =>
    outfit.items
      .map((i) => product(i.productId, extra))
      .find((p) => p.category === cat);
  const skin = "#c2afa0",
    top = get("outerwear")?.hex || get("top")?.hex || "#ded8ca",
    bottom = get("bottom")?.hex || "#333",
    shoe = get("shoes")?.hex || "#eee";
  const loose =
    profile.fit === "Oversized" ? 1.13 : profile.fit === "Fitted" ? 0.94 : 1;
  const shoulder = profile.shoulder / 44,
    waist = profile.waist / 80;
  const torso = [
    new Vector2(0.28 * waist, 0),
    new Vector2(0.29 * waist, 0.12),
    new Vector2(0.3, 0.42),
    new Vector2(0.35 * shoulder, 0.7),
    new Vector2(0.31 * shoulder, 0.81),
    new Vector2(0.1, 0.88),
  ];
  const mesh = (
    position: [number, number, number],
    scale: [number, number, number],
    color: string,
    key: string,
  ) => (
    <mesh key={key} name={key} position={position} scale={scale} castShadow>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
  const itemForRegion = (name: string) => {
    const upper: Category = get("outerwear") ? "outerwear" : "top";
    const regions: Partial<Record<string, Category>> = {
      shoe: "shoes", hip: "bottom", leg: "bottom", underlayer: "top",
      accessory: "accessory", torso: upper, sleeve: upper,
      ...(get("outerwear") ? { arm: "outerwear" as const } : {}),
    };
    const category = regions[name];
    return category ? get(category)?.id ?? null : null;
  };
  return (
    <group
      onPointerMove={(event) => {
        if (!onItem) return;
        event.stopPropagation();
        onItem(itemForRegion(event.object.name));
      }}
      onPointerOut={() => onItem?.(null)}
      onClick={(event) => {
        event.stopPropagation();
        const id = itemForRegion(event.object.name) ?? get("top")?.id;
        if (id && event.delta <= 3) onSelectItem?.(id);
      }}
      position={[0, -1.48, 0]}
      scale={[profile.chest / 96, profile.height / 175, profile.hip / 98]}
    >
      {mesh([0, 2.83, 0], [0.185, 0.26, 0.19], skin, "head")}
      {mesh([0, 2.53, 0], [0.09, 0.14, 0.09], skin, "neck")}
      <mesh name="torso" position={[0, 1.67, 0]} castShadow scale={[loose, 1, 0.73]}>
        <latheGeometry args={[torso, 48]} />
        <meshStandardMaterial color={top} roughness={0.85} />
      </mesh>
      {mesh([0, 1.6, 0], [0.31, 0.21, 0.21], bottom, "hip")}
      {[-1, 1].map((s) => (
        <group key={s}>
          <group
            position={[s * 0.33 * shoulder, 2.37, 0]}
            rotation={[0, 0, s * 0.11]}
          >
            {mesh(
              [s * 0.05, -0.23, 0],
              [0.115 * loose, 0.33, 0.115],
              top,
              "sleeve",
            )}
            {mesh(
              [s * 0.075, -0.67, 0],
              [0.074, 0.23, 0.08],
              get("outerwear") ? top : skin,
              "arm",
            )}
            {mesh([s * 0.08, -0.93, 0], [0.07, 0.12, 0.075], skin, "hand")}
          </group>
          <mesh name="leg" position={[s * 0.165, 0.93, 0]} castShadow>
            <cylinderGeometry args={[0.145 * loose, 0.117 * loose, 1.3, 24]} />
            <meshStandardMaterial color={bottom} />
          </mesh>
          {mesh([s * 0.165, 0.2, 0.075], [0.13, 0.11, 0.255], shoe, "shoe")}
        </group>
      ))}
      {get("outerwear") && (
        <mesh name="underlayer" position={[0, 2.13, 0.244]}>
          <boxGeometry args={[0.12, 0.63, 0.035]} />
          <meshStandardMaterial color={get("top")?.hex || "#eee"} />
        </mesh>
      )}
      {get("accessory") && mesh([0.4, 1.58, 0.14], [0.12, 0.18, 0.08], get("accessory")!.hex, "accessory")}
    </group>
  );
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
  profile,
  extra = [],
  angle = 0,
  zoom = 1,
  onItem,
  onSelectItem,
  interactive = true,
}: {
  outfit: Outfit;
  profile: ScanProfile;
  extra?: Product[];
  angle?: number;
  zoom?: number;
  onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
  interactive?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    setSupported(!!(c.getContext("webgl2") || c.getContext("webgl")));
  }, []);
  const fallback = (
    <div className="avatar-fallback">
      <div style={{ transform: `scale(${zoom})` }}>
        <FlatAvatar outfit={outfit} extra={extra} onItem={onItem} onSelectItem={onSelectItem} />
      </div>
      <span>Illustrated preview · 3D unavailable</span>
    </div>
  );
  if (supported === null)
    return <div className="avatar-loading">Preparing your studio…</div>;
  if (!supported) return fallback;
  return (
    <Boundary fallback={fallback}>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 1, 5.7], fov: 36 }}
        aria-label="Interactive 3D fashion mannequin. Drag to rotate. Click a garment for details."
      >
        <color attach="background" args={["#deded4"]} />
        <ambientLight intensity={1.7} />
        <directionalLight position={[3, 6, 4]} intensity={3} castShadow />
        <directionalLight position={[-3, 2, -3]} intensity={1.2} />
        <Suspense fallback={null}>
          <group rotation={[0, angle, 0]} scale={zoom}>
            <Mannequin outfit={outfit} profile={profile} extra={extra} onItem={onItem} onSelectItem={onSelectItem} />
          </group>
          <ContactShadows
            position={[0, -1.49, 0]}
            opacity={0.35}
            scale={7}
            blur={2.5}
            far={4}
          />
        </Suspense>
        <OrbitControls
          enabled={interactive}
          enableZoom={false}
          target={[0, 0, 0]}
          enablePan={false}
          minDistance={3.5}
          maxDistance={9}
          minPolarAngle={0.9}
          maxPolarAngle={1.8}
        />
      </Canvas>
    </Boundary>
  );
}
