export const measurementNames = ["height", "chest", "waist", "hip", "shoulder", "inseam"] as const;
export type MeasurementName = typeof measurementNames[number];
export type BodyMeasurement = {
  value: number; // meters, including uncertainty
  uncertainty: number;
  method: "surface-section" | "landmark-distance" | "manual";
  quality: "unvalidated" | "validated";
  overClothing: boolean;
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
export type GarmentAsset = {
  schemaVersion: 1; id: string; version: number; productId: string;
  name: string; category: "top" | "bottom" | "outerwear";
  evidence: { source: string; measuredAt: string; physicalSample: string; validated: boolean };
  sizes: { label: string; blendKey: string; ranges: Partial<Record<MeasurementName, [number, number]>> }[];
};
export type FitAssessment = {
  schemaVersion: 1; bodyVersion: number; garmentId: string; garmentVersion: number;
  status: "recommended" | "withheld"; size?: string; reason: string;
  supporting: MeasurementName[];
};
export type TryOnJob = {
  schemaVersion: 1; id: string; scanId: string; bodyVersion: number;
  state: "queued" | "processing" | "ready" | "failed" | "cancelled";
  garments: { garmentId: string; version: number; size: string }[];
  progress: number; error?: string; resultUrl?: string;
};
export type ReviewLandmarks = {
  chestY: number; waistY: number; hipY: number;
  shoulderLeft: [number, number, number]; shoulderRight: [number, number, number];
  crotch: [number, number, number];
};
