import type { Product, Outfit } from "./types";
import evidence from "../docs/animated-capsule-research.json";

const rows = [
  ["uq-489929-white", "top", "White", "#e8e5dc", 19.90, "u-tee"],
  ["uq-493232-black", "top", "Black", "#17191b", 24.90, "air-tee"],
  ["uq-482880-navy", "bottom", "Navy", "#1a2b49", 19.90, "uq-482880-navy"],
  ["uq-482880-olive", "bottom", "Olive", "#616b46", 19.90, "uq-482880-olive"],
  ["uq-482452-blue", "outerwear", "Blue", "#5c88a3", 7.90, "uq-482452-blue"],
] as const;
export const capsuleProducts: Product[] = rows.map(([id, category, color, hex, price, thumbnail], i) => ({
  id, name: evidence.products[i].name, brand: "UNIQLO", category, color, hex, price,
  tags: ["minimalist", "casual elevated"], retailer: "UNIQLO", url: evidence.products[i].url,
  image: `/garments/${thumbnail}.svg`, linkType: "product",
  garmentIdentity: { sku: evidence.products[i].productId, region: "US", variant: evidence.products[i].variant },
}));
export function nameCapsuleLook(outfit: Outfit): Outfit {
  const pieces = outfit.items.map(item => capsuleProducts.find(p => p.id === item.productId));
  if (pieces.some(p => !p)) return outfit;
  const top = pieces.find(p => p!.category === "top"), bottom = pieces.find(p => p!.category === "bottom");
  if (!top || !bottom) return outfit;
  return { ...outfit, name: `${top.color} ${top.id.includes("493232") ? "oversized tee" : "tee"} & ${bottom.color.toLowerCase()} chinos${pieces.some(p => p!.category === "outerwear") ? " · blue overshirt" : ""}` };
}
export function capsuleLooks(): Outfit[] {
  return [[0,2], [1,3], [0,3,4]].map((indices, i) => ({
    id: `capsule-draft-${i+1}`, name: ["White tee & navy chinos", "Oversized black & olive", "Blue chambray layers"][i],
    description: ["A fresh everyday pairing.", "Quiet contrast, effortless proportions.", "An easy layer for wherever the day goes."][i],
    rationale: ["A clean white tee and deep navy chinos. Simple contrast that feels considered without trying too hard.", "An oversized black tee meets earthy olive chinos. A relaxed silhouette with just enough contrast.", "Blue chambray adds texture over a white tee, while olive chinos keep the palette grounded."][i],
    tags: ["Everyday", "Minimal"], occasion: "Everyday", items: indices.map(index => ({ productId: capsuleProducts[index].id, owned: false })),
  }));
}
