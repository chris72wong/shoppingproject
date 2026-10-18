// Validate research records and list the evidence needed before garment authoring.
// Never enables a product or promotes online information to physical validation.
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { dimensionSchema, sourceSchema } from "../../lib/body/garment";

export const researchSchema = z.array(z.object({
  brand: z.string().min(1), sku: z.string().min(1), region: z.literal("US"), variant: z.string().min(1),
  category: z.enum(["top", "bottom", "outerwear"]), name: z.string().min(1),
  identityStatus: z.enum(["confirmed", "needs-sample-label-check"]),
  sources: z.array(sourceSchema).min(1), composition: z.string().min(1), construction: z.string().min(1),
  sizes: z.array(z.object({ label: z.string().min(1).max(20), dimensions: z.record(z.string(), dimensionSchema) }).strict()).min(1),
  missingEvidence: z.array(z.string().min(1)).min(1), sampleStatus: z.literal("not-obtained"),
}).strict().superRefine((g, ctx) => {
  if (new Set(g.sizes.map(s => s.label)).size !== g.sizes.length) ctx.addIssue({ code: "custom", message: "Duplicate sizes" });
  for (const s of g.sizes) for (const d of Object.values(s.dimensions)) {
    if (d.sourceIndex >= g.sources.length) ctx.addIssue({ code: "custom", message: "Unknown source index" });
    if (d.origin === "measured") ctx.addIssue({ code: "custom", message: "Research-only records cannot claim a measured sample" });
  }
}));

async function main() {
  const products = researchSchema.parse(JSON.parse(await readFile(process.argv[2] || "infra/body/research/products.json", "utf8")));
  console.log(JSON.stringify(products.map(g => ({ sku: g.sku, category: g.category, status: "research-only", sizes: g.sizes.map(s => s.label), missingEvidence: g.missingEvidence })), null, 2));
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/research-products.ts")) void main().catch(e => { console.error(e.message); process.exitCode = 1; });
