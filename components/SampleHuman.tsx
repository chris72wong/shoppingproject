"use client";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, Mesh, LoopRepeat } from "three";
import type { MutableRefObject } from "react";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { previewManifest, sampleCombination, previewAssetUrl } from "@/lib/preview-capsule";
import { assertGarmentGroups } from "@/lib/body/outfit-tryon";
import type { ThreeEvent } from "@react-three/fiber";

export default function SampleHuman({ productIds, elapsed, onItem, onSelectItem, reviewAsset }: {
  productIds: string[]; elapsed: MutableRefObject<number>; onItem?: (id: string | null) => void; onSelectItem?: (id: string) => void;
  reviewAsset?: { url: string; productIds: string[]; durationSeconds?: number };
}) {
  const combination = sampleCombination(productIds);
  const url = reviewAsset?.url || previewAssetUrl(productIds);
  const gltf = useGLTF(url);
  const instance = useMemo(() => {
    const clip = gltf.animations.find(animation => animation.name === previewManifest.idleClip);
    const duration = reviewAsset?.durationSeconds ?? previewManifest.clipDurationSeconds;
    if (!clip || Math.abs(clip.duration - duration) > .01) throw new Error("The preview has incompatible animation timing.");
    if (reviewAsset?.productIds.length || (!reviewAsset && combination)) assertGarmentGroups({ nodes: collectNames(gltf.scene) }, reviewAsset?.productIds || productIds);
    const scene = clone(gltf.scene);
    scene.traverse(object => {
      // Keep GLTFLoader's animation-safe name: morph tracks bind to it. Exact
      // shopping identity is preserved independently in userData.name.
      if (object instanceof Mesh) {
        object.castShadow = true; object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material.name.toLowerCase().includes("eyebrow") && material.transparent) material.depthWrite = false;
        }
      }
    });
    return scene;
  }, [gltf.scene, gltf.animations, url, reviewAsset?.durationSeconds]);
  const mixer = useMemo(() => new AnimationMixer(instance), [instance]);
  useEffect(() => {
    const clip = gltf.animations.find(animation => animation.name === previewManifest.idleClip);
    if (!clip) throw new Error("The human model has no compatible idle animation.");
    const action = mixer.clipAction(clip); action.setLoop(LoopRepeat, Infinity).play(); mixer.setTime(elapsed.current);
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(instance); };
  }, [mixer, instance, gltf.animations, elapsed]);
  useFrame(() => mixer.setTime(elapsed.current));
  function id(event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) {
    let object = event.object;
    const name = () => String(object.userData.name || object.name);
    while (object.parent && !name().startsWith("garment:")) object = object.parent;
    return name().startsWith("garment:") ? name().slice(8) : null;
  }
  return <group position={[0, -1.5, 0]} scale={3 / 1.75}
    onPointerMove={event => { const value = id(event); if (value) event.stopPropagation(); onItem?.(value); }}
    onPointerOut={() => onItem?.(null)} onClick={event => { const value = id(event); if (value) { event.stopPropagation(); onSelectItem?.(value); } }}>
    <primitive object={instance} dispose={null} />
  </group>;
}
function collectNames(scene: import("three").Object3D) {
  const nodes: { name: string }[] = []; scene.traverse(object => nodes.push({ name: object.userData.name || object.name })); return nodes;
}
