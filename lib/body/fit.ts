import type { BodyScan, FitAssessment, GarmentAsset, MeasurementName } from "./types";
import { dimensionMeters, garmentSchema } from "./garment";

export function assessFit(scan: BodyScan, asset: GarmentAsset): FitAssessment {
  const base = { schemaVersion: 1 as const, bodyVersion: scan.version, garmentId: asset.id, garmentVersion: asset.version, supporting: [] as MeasurementName[] };
  const parsed = garmentSchema.safeParse(asset);
  if (!parsed.success) return { ...base, status: "withheld", evidenceStatus: "estimated", reason: "Exact product, pattern, fabric and validation evidence is incomplete. Legacy assets require migration." };
  const garment = parsed.data;
  const values = { ...scan.measurements, ...scan.corrections };
  const required = garment.requiredMeasurements;
  const validBody = (k: MeasurementName) => {
    const m = values[k];
    return !!m && Number.isFinite(m.value) && Number.isFinite(m.uncertainty) && m.uncertainty >= 0 && m.quality === "validated" && !m.overClothing;
  };
  const contains = (k: MeasurementName, range?: [number, number]) => {
    const m = values[k];
    return !!range && validBody(k) && m!.value - m!.uncertainty >= range[0] && m!.value + m!.uncertainty <= range[1];
  };
  const candidates = garment.sizes.map(s => ({ size: s.label, regions: required.map(region => {
    const m = values[region], d = s.dimensions[region];
    let easeM: [number, number] | undefined;
    if (m && d && Number.isFinite(m.value) && Number.isFinite(m.uncertainty) && m.uncertainty >= 0) {
      try {
        const g = dimensionMeters(d, ["chest", "waist", "hip", "upperArm", "thigh"].includes(region));
        easeM = [g.value - g.uncertainty - m.value - m.uncertainty, g.value + g.uncertainty - m.value + m.uncertainty];
      } catch { /* Incompatible dimensions cannot establish ease. */ }
    }
    const known = validBody(region) && !!s.ranges[region] && garment.validation.status === "validated";
    const preferred = s.preferredEase[region];
    const easeMatches = !preferred || (!!easeM && easeM[0] >= preferred[0] && easeM[1] <= preferred[1]);
    return { region, status: !known ? "unknown" as const : contains(region, s.ranges[region]) && easeMatches ? "within-range" as const : "outside-range" as const,
      easeM, reason: known ? "Compared with physically validated body ranges; ease is a dimensional estimate." : "Body or garment evidence is unvalidated or incomplete." };
  }) }));
  const details = { ...base, candidates, evidenceStatus: garment.validation.status, validationReference: garment.validation.reportKey };
  const withheld = (reason: string): FitAssessment => ({ ...details, status: "withheld", reason });
  if (scan.state !== "ready" || garment.validation.status !== "validated") return withheld("Body or garment evidence has not passed physical validation.");
  if (required.some(k => !validBody(k))) return withheld("Required body dimensions lack validated, non-clothing evidence.");
  if (required.some(k => !contains(k, garment.validation.bodyRanges[k]))) return withheld("Body is outside the physically tested coverage or crosses its uncertainty boundary.");
  const matches = candidates.filter(c => c.regions.every(r => r.status === "within-range"));
  if (matches.length !== 1) return withheld("Measurement uncertainty does not identify one supported size.");
  return { ...details, status: "recommended", size: matches[0].size, supporting: required, reason: "Within the physically validated ranges for this exact product and size." };
}
