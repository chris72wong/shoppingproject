"use client";
import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Mesh, MeshStandardMaterial, Texture } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { inspectGlb } from "@/lib/body/glb";
import { assertGarmentGroups } from "@/lib/body/outfit-tryon";
export type BodyPreview = { url: string; baseUrl?: string; height: number; version: number; simulated: boolean; scanId?: string; productIds?: string[] };
export default function BodyMesh({ preview, onItem, onSelectItem, onPoint, centered = false, onError }: {
  preview: BodyPreview; onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
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
        const bytes = await response.arrayBuffer(); const document = inspectGlb(bytes);
        if (preview.productIds) assertGarmentGroups(document, preview.productIds);
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        owned = gltf.scene;
        if (abort.signal.aborted) { dispose(owned); return; }
        owned.traverse(object => {
          if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
        });
        setScene(owned);
      } catch (error) { if (!abort.signal.aborted) onError?.(error instanceof Error ? error.message : "Mesh unavailable."); }
    })();
    return () => { abort.abort(); if (owned) dispose(owned); };
  }, [preview.url, preview.version, JSON.stringify(preview.productIds), onError]);
  function garmentId(event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) {
    let object = event.object;
    const name = () => String(object.userData.name || object.name);
    while (object.parent && !name().startsWith("garment:")) object = object.parent;
    return name().startsWith("garment:") ? name().slice(8) : null;
  }
  function hover(event: ThreeEvent<PointerEvent>) {
    if (!onItem) return; event.stopPropagation(); onItem(garmentId(event));
  }
  if (!scene) return null;
  const scale = centered ? 1 : 3 / preview.height;
  return <group position={[0, centered ? -preview.height / 2 : -1.49, 0]} scale={scale}
    onPointerMove={hover} onPointerOut={() => onItem?.(null)}
    onClick={event => { const id = garmentId(event); if (id && onSelectItem) { event.stopPropagation(); onSelectItem(id); } if (onPoint) { event.stopPropagation(); onPoint([event.point.x, event.point.y + preview.height / 2, event.point.z]); } }}>
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
