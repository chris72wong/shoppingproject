import { authenticate, enabled } from "./auth";
import { garments, ownedScan, publicScan } from "./service";
import { assessFit } from "./fit";
export type FitSummary = { status: "withheld" | "available"; recommendations: { productId: string; size: string }[] };
export async function fitSummary(request: Request, scanId?: string): Promise<FitSummary | undefined> {
  if (!scanId || !enabled()) return undefined;
  try {
    const identity = authenticate(request);
    if (identity.scope !== "web") return undefined;
    const row = await ownedScan(identity, scanId);
    if (!row.share_fit || row.state !== "ready") return undefined;
    const scan = publicScan(row), recommendations: FitSummary["recommendations"] = [];
    for (const garment of await garments()) { const fit = assessFit(scan, garment); if (fit.status === "recommended") recommendations.push({ productId: garment.productId, size: fit.size! }); }
    return { status: recommendations.length ? "available" : "withheld", recommendations };
  } catch { return undefined; }
}
