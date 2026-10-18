"use client";
import { Component, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Category, Outfit, Product, ScanProfile } from "@/lib/types";
import { scenery, type Scenery } from "@/lib/scenery";
import { product } from "@/lib/catalog";
import { Group, PerspectiveCamera, Vector2 } from "three";
import { FlatAvatar } from "./FlatAvatar";
import BodyMesh, { type BodyPreview } from "./BodyMesh";
function Mannequin({
  outfit,
  profile,
  extra,
  onItem,
  paused,
  onSelectItem,
}: {
  outfit: Outfit;
  profile: ScanProfile;
  extra: Product[];
  onItem?: (id: string | null) => void;
  paused: boolean;
  onSelectItem?: (id: string) => void;
}) {
  const model = useRef<Group>(null);
  const phase = useRef(0);
  useFrame((_, delta) => {
    if (paused || !model.current) return;
    // Local time freezes with the pose; clothing updates never reset it.
    phase.current += Math.min(delta, 0.05);
    const t = phase.current;
    model.current.rotation.z = Math.sin(t * 0.85) * 0.018;
    model.current.rotation.y = Math.sin(t * 0.55) * 0.07;
    model.current.position.x = Math.sin(t * 0.85) * 0.018;
    for (const side of [-1, 1]) {
      const arm = model.current.getObjectByName('arm-pivot-' + side);
      if (arm) {
        arm.rotation.x = Math.sin(t * 1.1 + side) * 0.07;
        arm.rotation.z = side * (0.11 + Math.sin(t * 0.85) * 0.025);
      }
    }
    const head = model.current.getObjectByName('head');
    if (head) head.rotation.y = Math.sin(t * 0.65) * 0.12;
  });
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
      ref={model}
      onPointerMove={(event) => {
        if (!onItem || event.buttons > 0) return;
        event.stopPropagation();
        onItem(itemForRegion(event.object.name));
      }}
      onPointerOut={() => onItem?.(null)}
      onClick={(event) => {
        event.stopPropagation();
        const id = itemForRegion(event.object.name) ?? get("top")?.id;
        if (id && event.delta <= 3) onSelectItem?.(id);
      }}
      position={[0, -1.6 * profile.height / 175, 0]}
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
            name={"arm-pivot-" + s}
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
function FrameAvatar({ profile }: { profile: ScanProfile }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const halfFov = camera.fov * Math.PI / 360;
    const height = 3.2 * profile.height / 175;
    const width = 1.25 * Math.max(profile.chest / 96, profile.shoulder / 44);
    const distance = Math.max(height / 2 / Math.tan(halfFov), width / 2 / Math.tan(halfFov) / (size.width / Math.max(1, size.height))) / 0.94;
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, profile.height, profile.chest, profile.shoulder]);
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
  profile,
  extra = [],
  angle = 0,
  zoom = 1,
  onItem,
  onSelectItem,
  interactive = true,
  bodyPreview,
  sceneryId = "studio",
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
  sceneryId?: Scenery;
}) {
  const lighting = scenery[sceneryId];
  const [rotating, setRotating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [meshError, setMeshError] = useState("");
  useEffect(() => setMeshError(""), [bodyPreview?.url]);
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
  if (meshError) return <div className="avatar-fallback" role="alert">{meshError}</div>;
  return (
    <Boundary fallback={fallback}>
      <Canvas
        frameloop={rotating || reducedMotion || !interactive ? "demand" : "always"}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6.5], fov: 30 }}
        gl={{ alpha: true }}
        aria-label={bodyPreview ? "Personal body scan. Drag to rotate." : "Interactive 3D fashion mannequin. Drag to rotate. Click a garment for details."}
      >
        <FrameAvatar profile={profile} />
        <ambientLight intensity={lighting.ambient} />
        <directionalLight position={[...lighting.position]} intensity={lighting.key} color={lighting.color} castShadow />
        <directionalLight position={[-3, 2, -3]} intensity={lighting.fill} />
        <Suspense fallback={null}>
          <group rotation={[0, angle, 0]} scale={zoom}>
            {bodyPreview ? <BodyMesh preview={bodyPreview} onItem={onItem} onError={setMeshError} /> : <Mannequin outfit={outfit} profile={profile} extra={extra} onItem={onItem} onSelectItem={onSelectItem} paused={rotating || reducedMotion || !interactive} />}
          </group>
          <ContactShadows
            position={[0, -1.51 * profile.height / 175, 0]}
            opacity={0.35}
            scale={7}
            blur={2.5}
            far={4}
          />
        </Suspense>
        <OrbitControls
          enabled={interactive}
          enableDamping={false}
          onStart={() => { setRotating(true); onItem?.(null); }}
          onEnd={() => setRotating(false)}
          enableZoom={false}
          target={[0, 0, 0]}
          enablePan={false}
          minPolarAngle={0.9}
          maxPolarAngle={1.8}
        />
      </Canvas>
    </Boundary>
  );
}
