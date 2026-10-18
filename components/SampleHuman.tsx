"use client";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, Mesh, LoopRepeat } from "three";
import type { MutableRefObject } from "react";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { previewManifest, sampleCombination } from "@/lib/preview-capsule";
import { assertGarmentGroups } from "@/lib/body/outfit-tryon";
import type { ThreeEvent } from "@react-three/fiber";

export default function SampleHuman({ productIds, elapsed, onItem, onSelectItem }: {
  productIds: string[]; elapsed: MutableRefObject<number>; onItem?: (id: string | null) => void; onSelectItem?: (id: string) => void;
}) {
  const combination = sampleCombination(productIds);
  const url = combination?.url || "/models/sample-human.glb";
  const gltf = useGLTF(url);
  const instance = useMemo(() => {
    if (combination) assertGarmentGroups({ nodes: collectNames(gltf.scene) }, productIds);
    const scene = clone(gltf.scene);
    scene.traverse(object => {
      // GLTFLoader removes ':' from Object3D.name for animation bindings but
      // preserves the original node identity in userData.name.
      if (typeof object.userData.name === "string" && object.userData.name.startsWith("garment:")) object.name = object.userData.name;
      if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    return scene;
  }, [gltf.scene, url]);
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
    while (object.parent && !object.name.startsWith("garment:")) object = object.parent;
    return object.name.startsWith("garment:") ? object.name.slice(8) : null;
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
