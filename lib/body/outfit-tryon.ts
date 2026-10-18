import type { Product } from "../types";
import type { GarmentAsset, TryOnJob } from "./types";

function productUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = ""; url.searchParams.sort(); return url.href;
  } catch { return null; }
}

// A name/category resemblance must never attach a different retail garment.
export function garmentForProduct(product: Product, assets: GarmentAsset[]) {
  if (product.linkType !== "product" || !product.garmentIdentity || typeof product.brand !== "string" ||
      typeof product.garmentIdentity.sku !== "string" || typeof product.garmentIdentity.variant !== "string" || product.garmentIdentity.region !== "US") return undefined;
  const url = productUrl(product.url);
  const matches = assets.filter(asset => asset.schemaVersion === 2 && asset.productId === product.id && asset.category === product.category &&
    asset.identity?.brand.trim().toLowerCase() === product.brand.trim().toLowerCase() &&
    asset.identity.sku === product.garmentIdentity!.sku && asset.identity.region === product.garmentIdentity!.region && asset.identity.variant === product.garmentIdentity!.variant &&
    url && productUrl(asset.identity.productUrl) === url);
  return matches.length === 1 ? matches[0] : undefined;
}

export function selectionMatchesJob(job: TryOnJob, scanId: string, bodyVersion: number, selections: { garmentId: string; version: number; size: string }[]) {
  return selections.length > 0 && new Set(selections.map(s => s.garmentId)).size === selections.length && job.scanId === scanId && job.bodyVersion === bodyVersion && job.garments.length === selections.length &&
    selections.every(s => job.garments.some(g => g.garmentId === s.garmentId && g.version === s.version && g.size === s.size));
}

export function assertGarmentGroups(document: { nodes?: { name?: string }[] }, productIds: string[]) {
  const actual = (document.nodes || []).flatMap(node => node.name?.startsWith("garment:") ? [node.name.slice(8)] : []);
  if (!productIds.length || new Set(productIds).size !== productIds.length || actual.length !== productIds.length ||
      productIds.some(id => actual.filter(value => value === id).length !== 1)) throw new Error("The clothing model does not match the selected products.");
}

export function outfitPreviewKey(scanId: string | undefined, version: number | undefined, products: Product[], sizes: Record<string, string>) {
  return JSON.stringify([scanId, version, products.map(p => [p.id, p.brand, p.category, p.url, p.color, p.hex, p.garmentIdentity]), Object.entries(sizes).sort(([a],[b]) => a.localeCompare(b))]);
}
