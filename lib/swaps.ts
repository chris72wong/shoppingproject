import { catalog, product } from "./catalog";
import type { Outfit, Product } from "./types";
import { capsuleProducts } from "./capsule-products";

export function similarItems(outfit: Outfit, piece: Product, extra: Product[], budget: number, owned: string[]) {
  if (outfit.lockedCategories?.includes(piece.category) || outfit.items.some(item => item.productId === piece.id && item.owned)) return [];
  const otherCost = outfit.items.reduce((sum, item) => sum + (item.productId === piece.id || item.owned ? 0 : product(item.productId, extra).price), 0);
  const affordable = (p: Product) => Number(otherCost + (owned.includes(p.id) || p.retailer === "Owned" ? 0 : p.price) <= budget);
  const score = (p: Product) => p.tags.filter((t) => piece.tags.includes(t)).length * 4 + Number(p.color === piece.color) * 2;
  const candidates = capsuleProducts.some(p => p.id === piece.id) ? capsuleProducts : [...catalog, ...extra];
  return candidates.filter((p) => p.category === piece.category && p.id !== piece.id)
    .sort((a, b) => affordable(b) - affordable(a) || score(b) - score(a) || Math.abs(a.price - piece.price) - Math.abs(b.price - piece.price));
}

export function swapItem(outfit: Outfit, oldId: string, replacement: Product, owned: string[], extra: Product[] = []): Outfit {
  const old = outfit.items.find((item) => item.productId === oldId);
  if (!old || old.owned || product(oldId, extra).category !== replacement.category || outfit.lockedCategories?.includes(replacement.category)) return outfit;
  return { ...outfit, rationale: `Updated with ${replacement.name}. ${outfit.description}`, items: outfit.items.map((item) => item.productId === oldId ? { productId: replacement.id, owned: owned.includes(replacement.id) || replacement.retailer === "Owned" } : { ...item }) };
}
