import { z } from "zod";
import { measurementNames } from "./types";
export const MAX_SCAN_BYTES = 150 * 1024 * 1024;
export const uploadSchema = z.object({
  format: z.enum(["glb", "ply", "rgbd"]), source: z.string().trim().min(2).max(100),
  units: z.enum(["m", "cm", "mm"]), upAxis: z.enum(["y", "z"]),
  confirmedHeight: z.number().finite().min(0.8).max(2.5),
  bytes: z.number().int().positive().max(MAX_SCAN_BYTES),
  consent: z.literal(true), closeFittingClothing: z.literal(true),
}).strict().refine(v => v.format !== "rgbd" || (v.units === "m" && v.upAxis === "y"), "Native depth must use meters and Y-up");
export const correctionsSchema = z.object({
  version: z.number().int().positive(),
  values: z.partialRecord(z.enum(measurementNames), z.number().finite().min(0.05).max(2.5)),
}).strict();
const point = z.tuple([z.number().finite().min(-2).max(2), z.number().finite().min(0).max(2.5), z.number().finite().min(-2).max(2)]);
const approvalSchema = z.object({
  version: z.number().int().positive(), approve: z.literal(true),
  segmentationConfirmed: z.literal(true), closeClothingConfirmed: z.literal(true),
  landmarks: z.object({ chestY: z.number().min(0.1).max(2.5), waistY: z.number().min(0.1).max(2.5), hipY: z.number().min(0.1).max(2.5),
    shoulderLeft: point, shoulderRight: point, crotch: point }).strict(),
}).strict().refine(v => v.landmarks.chestY > v.landmarks.waistY && v.landmarks.waistY > v.landmarks.hipY, "Landmark heights must descend from chest to hip");
export const reviewSchema = z.union([approvalSchema, z.object({ version: z.number().int().positive(), approve: z.literal(false) }).strict()]);
export const tryOnSchema = z.object({
  scanId: z.string().uuid(), version: z.number().int().positive(),
  garments: z.array(z.object({ garmentId: z.string().uuid(), size: z.string().min(1).max(20) }).strict()).min(1).max(3),
}).strict();
export function meters(value: number, units: "m" | "cm" | "mm") {
  if (!Number.isFinite(value)) throw new Error("Invalid distance");
  return value * ({ m: 1, cm: 0.01, mm: 0.001 }[units]);
}
