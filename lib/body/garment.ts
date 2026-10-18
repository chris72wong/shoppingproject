import { z } from "zod";
import { measurementNames } from "./types";
import type { GarmentAsset } from "./types";

const text = z.string().trim().min(1).max(2000);
const key = (suffix: string) => text.refine(v => v.startsWith("garments/") && !v.includes("..") && /^[\w./-]+$/.test(v) && v.endsWith(suffix), "Use an immutable private garments/ object key");
const range = z.tuple([z.number().finite().positive().max(3), z.number().finite().positive().max(3)]).refine(([a,b]) => a < b);
const propertyRange = z.tuple([z.number().finite().positive(), z.number().finite().positive()]).refine(([a,b]) => a < b);
const ranges = z.partialRecord(z.enum(measurementNames), range);
export const sourceSchema = z.object({
  url: z.url().refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }),
  retrievedAt: z.iso.datetime(), kind: z.enum(["product", "size-guide", "measurement-guide", "sample", "trial"]),
  note: text,
}).strict();
export const dimensionSchema = z.object({
  value: z.number().finite().positive().max(3000), uncertainty: z.number().finite().nonnegative().max(300),
  units: z.enum(["m", "cm", "mm", "in"]), convention: z.enum(["length", "circumference", "flat-width"]),
  origin: z.enum(["published", "measured", "estimated"]), sourceIndex: z.number().int().nonnegative(), method: text,
}).strict();
export type GarmentDimension = z.infer<typeof dimensionSchema>;
export function dimensionMeters(dimension: GarmentDimension, circumference = false) {
  const d = dimensionSchema.parse(dimension);
  if (circumference && d.convention === "length") throw new Error("A length cannot establish a circumference");
  const factor = { m: 1, cm: .01, mm: .001, in: .0254 }[d.units] * (circumference && d.convention === "flat-width" ? 2 : 1);
  return { value: d.value * factor, uncertainty: d.uncertainty * factor };
}
const sizeSchema = z.object({
  label: z.string().trim().min(1).max(20), blendKey: key(".blend"),
  ranges, bodyChart: ranges, preferredEase: z.partialRecord(z.enum(measurementNames), z.tuple([z.number().finite().min(-.5).max(1), z.number().finite().min(-.5).max(1)]).refine(([a,b]) => a <= b)),
  dimensions: z.record(text, dimensionSchema), sampleId: text.optional(),
}).strict();
export const garmentSchema = z.object({
  schemaVersion: z.literal(2), id: z.uuid(), version: z.number().int().positive(), productId: text, name: text,
  category: z.enum(["top", "bottom", "outerwear"]),
  identity: z.object({ brand: text, sku: text, region: z.literal("US"), variant: text, productUrl: sourceSchema.shape.url }).strict(),
  sources: z.array(sourceSchema).min(1).max(100),
  evidence: z.object({ source: text, measuredAt: z.iso.datetime(), physicalSample: text, validated: z.boolean() }).strict(),
  pattern: z.object({ version: z.number().int().positive(), sourceKey: key(".json"), approvedBy: text, approvedAt: z.iso.datetime(), dimensionToleranceM: z.number().positive().max(.01) }).strict(),
  fabric: z.object({ calibrationId: text, version: z.number().int().positive(), composition: text,
    status: z.enum(["estimated", "sample-calibrated"]), recordKey: key(".json"),
    properties: z.object({ stretchWarp: propertyRange, stretchWeft: propertyRange, bending: propertyRange, densityKgM2: propertyRange, thicknessM: z.tuple([z.number().positive().max(.05), z.number().positive().max(.05)]).refine(([a,b]) => a < b), friction: z.tuple([z.number().positive().max(80), z.number().positive().max(80)]).refine(([a,b]) => a < b) }).strict(),
  }).strict(),
  arrangementVersion: z.number().int().positive(),
  requiredMeasurements: z.array(z.enum(measurementNames)).min(1),
  validation: z.object({ status: z.enum(["estimated", "validated"]), reportKey: key(".json").optional(),
    participants: z.number().int().nonnegative(), sizeAgreement: z.number().min(0).max(1),
    measurementGate: z.boolean(), appearanceGate: z.boolean(), subgroupReview: z.boolean(),
    sizes: z.array(z.string().min(1).max(20)), bodyRanges: ranges,
  }).strict(),
  sizes: z.array(sizeSchema).min(1).max(100),
}).strict().superRefine((g, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(g.sizes.map(s => s.label)).size !== g.sizes.length) issue("Size labels must be unique");
  if (new Set(g.requiredMeasurements).size !== g.requiredMeasurements.length) issue("Required measurements must be unique");
  const required = g.category === "bottom" ? ["waist", "hip", "inseam", "thigh", "rise"] : ["chest", "shoulder", "sleeve", "upperArm", "length"];
  const requiredBody: (typeof measurementNames)[number][] = g.category === "bottom" ? ["waist", "hip", "inseam", "thigh"] : ["chest", "shoulder", "sleeve", "upperArm"];
  if (requiredBody.some(k => !g.requiredMeasurements.includes(k))) issue("Critical body regions must be included in the assessment");
  for (const s of g.sizes) {
    if (required.some(k => !s.dimensions[k])) issue(`Missing garment dimensions for ${s.label}`);
    for (const [name, d] of Object.entries(s.dimensions)) {
      if (d.sourceIndex >= g.sources.length) issue("Dimension references an unknown source");
      if (d.origin === "measured" && g.sources[d.sourceIndex]?.kind !== "sample") issue("Measured dimensions must reference sample evidence");
      if (["chest", "waist", "hip", "upperArm", "thigh"].includes(name) && d.convention === "length") issue("Girth dimensions need explicit flat-width or circumference conventions");
    }
  }
  if (g.evidence.validated !== (g.validation.status === "validated")) issue("Validation flags disagree");
  if (g.validation.status === "validated") {
    if (g.fabric.status !== "sample-calibrated" || !g.validation.reportKey || !g.sources.some(s => s.kind === "trial") || g.validation.participants < 12 || g.validation.sizeAgreement < .9 || !g.validation.measurementGate || !g.validation.appearanceGate || !g.validation.subgroupReview) issue("Physical validation gates have not passed");
    for (const s of g.sizes) {
      if (!s.sampleId || !g.validation.sizes.includes(s.label) || required.some(k => s.dimensions[k]?.origin !== "measured")) issue(`Physical sample validation missing for ${s.label}`);
      if (g.requiredMeasurements.some(k => !s.ranges[k] || !g.validation.bodyRanges[k])) issue(`Validated body coverage missing for ${s.label}`);
    }
  }
});

export const SOLVER_VERSION = "blender-cloth-v2";
export function simulationIdentity(g: GarmentAsset) {
  return [g.id, g.version, g.pattern?.version, g.fabric?.version, g.fabric?.calibrationId, g.arrangementVersion];
}
