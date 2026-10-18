"use client";
import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Mesh, MeshStandardMaterial, Texture } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { inspectGlb } from "@/lib/body/glb";
export type BodyPreview = { url: string; height: number; version: number; simulated: boolean; scanId?: string };
export default function BodyMesh({ preview, onItem, onPoint, centered = false, onError }: {
  preview: BodyPreview; onItem?: (id: string | null) => void;
  onPoint?: (point: [number, number, number]) => void; centered?: boolean; onError?: (message: string) => void;
}) {
  const [scene, setScene] = useState<Group | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let owned: Group | undefined;
    setScene(null);
    void (async () => {
      try {
        const response = await fetch(preview.url, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("The private mesh is unavailable. Refresh the scan.");
        const bytes = await response.arrayBuffer(); inspectGlb(bytes);
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        owned = gltf.scene;
        if (abort.signal.aborted) { dispose(owned); return; }
        owned.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
        setScene(owned);
      } catch (error) { if (!abort.signal.aborted) onError?.(error instanceof Error ? error.message : "Mesh unavailable."); }
    })();
    return () => { abort.abort(); if (owned) dispose(owned); };
  }, [preview.url, preview.version, onError]);
  function hover(event: ThreeEvent<PointerEvent>) {
    if (!onItem) return; event.stopPropagation();
    let object = event.object;
    while (object.parent && !object.name.startsWith("garment:")) object = object.parent;
    onItem(object.name.startsWith("garment:") ? object.name.slice(8) : null);
  }
  if (!scene) return null;
  const scale = centered ? 1 : 3 / preview.height;
  return <group position={[0, centered ? -preview.height / 2 : -1.49, 0]} scale={scale}
    onPointerMove={hover} onPointerOut={() => onItem?.(null)}
    onClick={event => { if (onPoint) { event.stopPropagation(); onPoint([event.point.x, event.point.y + preview.height / 2, event.point.z]); } }}>
    <primitive object={scene} />
  </group>;
}
function dispose(scene: Group) {
  const textures = new Set<Texture>();
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]) as MeshStandardMaterial[]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach(t => t.dispose());
}
