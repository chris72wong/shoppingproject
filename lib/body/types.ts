import type { z } from "zod";
import type { garmentSchema } from "./garment";
export const measurementNames = ["height", "chest", "waist", "hip", "shoulder", "inseam", "sleeve", "upperArm", "thigh", "rise"] as const;
export type MeasurementName = typeof measurementNames[number];
export type BodyMeasurement = {
  value: number; // meters, including uncertainty
  uncertainty: number;
  method: "surface-section" | "landmark-distance" | "manual";
  quality: "unvalidated" | "validated";
  overClothing: boolean;
  validationReference?: string;
};
export type Measurements = Partial<Record<MeasurementName, BodyMeasurement>>;
export type ScanState = "uploading" | "processing" | "review" | "ready" | "rejected" | "failed" | "deleted";
export type BodyScan = {
  schemaVersion: 1; id: string; version: number; state: ScanState;
  source: string; format: "glb" | "ply" | "rgbd"; units: "m" | "cm" | "mm";
  upAxis: "y" | "z"; confirmedHeight: number;
  provenance: "unverified-import" | "native-depth";
  measurements: Measurements; corrections: Measurements;
  quality: Record<string, unknown>; error?: string;
  createdAt: string; expiresAt: string; shareFit: boolean;
  displayUrl?: string;
};
export type LegacyGarmentAsset = {
  schemaVersion: 1; id: string; version: number; productId: string;
  name: string; category: "top" | "bottom" | "outerwear";
  evidence: { source: string; measuredAt: string; physicalSample: string; validated: boolean };
  sizes: { label: string; blendKey: string; ranges: Partial<Record<MeasurementName, [number, number]>> }[];
};
export type ResearchedGarmentAsset = z.infer<typeof garmentSchema>;
// Legacy assets remain readable for migration, but cannot establish verified fit.
export type GarmentAsset = Omit<LegacyGarmentAsset, "schemaVersion" | "sizes"> & Partial<Omit<ResearchedGarmentAsset, "schemaVersion" | "sizes">> & {
  schemaVersion: 1 | 2;
  sizes: (LegacyGarmentAsset["sizes"][number] & Partial<ResearchedGarmentAsset["sizes"][number]>)[];
};
export type FitAssessment = {
  schemaVersion: 1; bodyVersion: number; garmentId: string; garmentVersion: number;
  status: "recommended" | "withheld"; size?: string; reason: string;
  supporting: MeasurementName[];
  evidenceStatus?: "estimated" | "validated";
  validationReference?: string;
  candidates?: { size: string; regions: { region: MeasurementName; status: "within-range" | "outside-range" | "unknown"; easeM?: [number, number]; reason: string }[] }[];
};
export type TryOnJob = {
  schemaVersion: 1; id: string; scanId: string; bodyVersion: number;
  state: "queued" | "processing" | "ready" | "failed" | "cancelled";
  garments: { garmentId: string; version: number; size: string }[];
  progress: number; error?: string; resultUrl?: string;
  previewStatus?: "estimated";
  diagnostics?: Record<string, unknown>;
};
export type ReviewLandmarks = {
  chestY: number; waistY: number; hipY: number;
  shoulderLeft: [number, number, number]; shoulderRight: [number, number, number];
  crotch: [number, number, number];
  chestFront?: [number, number, number]; chestBack?: [number, number, number];
  waistFront?: [number, number, number]; waistBack?: [number, number, number];
  hipFront?: [number, number, number]; hipBack?: [number, number, number];
  elbowLeft?: [number, number, number]; wristLeft?: [number, number, number];
  upperArmLeft?: [number, number, number]; thighLeft?: [number, number, number];
};
