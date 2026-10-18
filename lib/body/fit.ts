import type { BodyScan, FitAssessment, GarmentAsset, MeasurementName } from "./types";
// A recommendation requires the entire uncertainty interval inside one size's
// physically validated body range. Overlapping ranges are deliberately ambiguous.
export function assessFit(scan: BodyScan, garment: GarmentAsset): FitAssessment {
  const base = { schemaVersion: 1 as const, bodyVersion: scan.version, garmentId: garment.id, garmentVersion: garment.version, supporting: [] as MeasurementName[] };
  const withheld = (reason: string): FitAssessment => ({ ...base, status: "withheld", reason });
  if (scan.state !== "ready" || !garment.evidence.validated) return withheld("Body or garment evidence has not passed validation.");
  const required = [...new Set(garment.sizes.flatMap(s => Object.keys(s.ranges)))] as MeasurementName[];
  if (!required.length || garment.sizes.some(s => required.some(k => !s.ranges[k]))) return withheld("Garment size evidence is incomplete.");
  const values = { ...scan.measurements, ...scan.corrections };
  if (required.some(k => !values[k] || values[k]!.quality !== "validated" || values[k]!.overClothing)) return withheld("Required body dimensions lack validated evidence.");
  const candidates = garment.sizes.filter(s => required.every(k => {
    const m = values[k]!, [min, max] = s.ranges[k]!;
    return Number.isFinite(m.value) && Number.isFinite(m.uncertainty) && m.uncertainty >= 0 && min <= max && m.value - m.uncertainty >= min && m.value + m.uncertainty <= max;
  }));
  if (candidates.length !== 1) return withheld("Measurement uncertainty does not identify one supported size.");
  return { ...base, status: "recommended", size: candidates[0].label, supporting: required, reason: "Within the physically validated ranges for this pilot garment." };
}
