"use client";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Mesh } from "three";

// Cache the asset once; clone the skeleton for each independent viewer instance.
export default function DatasetAvatar() {
  const { scene } = useGLTF("/models/avatar.glb");
  const instance = useMemo(() => {
    const copy = clone(scene);
    copy.traverse(object => {
      if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    return copy;
  }, [scene]);
  return <group position={[0, -1.5, 0]} scale={3 / 1.75}><primitive object={instance} dispose={null} /></group>;
}
