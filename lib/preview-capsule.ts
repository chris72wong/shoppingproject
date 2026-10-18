import { z } from "zod";
import rawManifest from "../public/models/preview-manifest.json";

const asset = z.object({ url: z.string().regex(/^\/models\/[\w/-]+\.glb$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const product = z.object({ productId: z.string().min(1), sku: z.string().min(1), variant: z.string().min(1), region: z.literal("US"),
  category: z.enum(["top", "bottom", "outerwear"]), size: z.string().min(1), garmentVersion: z.number().int().positive(),
  dimensionsVerified: z.boolean(), sourceUrls: z.array(z.url()).min(1),
}).strict();
export const previewManifestSchema = z.object({
  schemaVersion: z.literal(1), status: z.enum(["blocked", "draft", "ready"]), reason: z.string(),
  avatarVersion: z.number().int().positive(), rigVersion: z.number().int().positive(), idleClip: z.literal("FORM_Idle"),
  products: z.array(product),
  combinations: z.array(asset.extend({ productIds: z.array(z.string().min(1)).min(1).max(3),
    avatarVersion: z.number().int().positive(), rigVersion: z.number().int().positive(),
    idleCollisionChecked: z.boolean(), visualReviewPassed: z.boolean(),
  }).strict()),
}).strict().superRefine((manifest, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const ids = manifest.products.map(p => p.productId);
  if (new Set(ids).size !== ids.length) issue("Duplicate capsule product");
  const combos = new Set<string>();
  for (const combination of manifest.combinations) {
    const key = combination.productIds.slice().sort().join("|");
    if (combos.has(key) || new Set(combination.productIds).size !== combination.productIds.length) issue("Duplicate combination");
    combos.add(key);
    if (combination.avatarVersion !== manifest.avatarVersion || combination.rigVersion !== manifest.rigVersion) issue("Incompatible avatar or rig version");
    if (combination.productIds.some(id => !ids.includes(id))) issue("Unknown product in combination");
    const categories = combination.productIds.map(id => manifest.products.find(p => p.productId === id)?.category);
    if (new Set(categories).size !== categories.length) issue("Only one garment per category");
  }
  if (manifest.status === "ready" && (manifest.products.some(p => !p.dimensionsVerified) || manifest.combinations.some(c => !c.idleCollisionChecked || !c.visualReviewPassed))) issue("Validated release requires verified dimensions and collision/visual approvals");
  if (manifest.status !== "blocked") {
    const tops = manifest.products.filter(p => p.category === "top"), bottoms = manifest.products.filter(p => p.category === "bottom"), outer = manifest.products.filter(p => p.category === "outerwear");
    if (tops.length !== 2 || bottoms.length !== 2 || outer.length !== 1) issue("Release requires the complete five-product capsule");
    for (const p of manifest.products) if (!combos.has(p.productId)) issue("Every product needs a reviewed individual preview");
    for (const top of tops) for (const bottom of bottoms) for (const layer of [null, ...outer]) {
      if (!combos.has([top.productId, bottom.productId, ...(layer ? [layer.productId] : [])].sort().join("|"))) issue("A supported outfit combination is missing");
    }
  }
});
export const previewManifest = previewManifestSchema.parse(rawManifest);
export function sampleCombination(productIds: string[], manifest = previewManifest) {
  if (manifest.status === "blocked" || new Set(productIds).size !== productIds.length) return undefined;
  const key = productIds.slice().sort().join("|");
  return manifest.combinations.find(combo => combo.productIds.slice().sort().join("|") === key);
}
export function assertCapsuleOutfits(outfits: { items: { productId: string }[] }[], manifest = previewManifest) {
  if (manifest.status === "blocked") throw new Error("The animated clothing capsule is not released: garment measurements and reviewed models are still required. Your existing looks are unchanged.");
  if (!outfits.length || outfits.some(outfit => {
    const ids = outfit.items.map(item => item.productId);
    const categories = ids.map(id => manifest.products.find(product => product.productId === id)?.category);
    return !categories.includes("top") || !categories.includes("bottom") || !sampleCombination(ids, manifest);
  })) throw new Error("This outfit has no approved animated garment combination.");
}
