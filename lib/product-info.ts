import { catalog } from "./catalog";
import type { Product } from "./types";

export type ProductInfo = {
  href: string | null;
  linkLabel: string;
  sourceLabel: string;
  fitSummary: string;
  materials: string | null;
  sizeGuideUrl: string | null;
  reviewsSummary: string | null;
};

// Official category destinations checked 2026-10-17. These are inspiration
// links, never evidence that a demo item or its illustrated color is for sale.
const uniqloCollections = {
  top: "https://www.uniqlo.com/us/en/men/tops",
  bottom: "https://www.uniqlo.com/us/en/men/bottoms",
  outerwear: "https://www.uniqlo.com/us/en/men/outerwear-and-blazers",
  accessory: "https://www.uniqlo.com/us/en/men/accessories-and-shoes",
  shoes: "https://www.uniqlo.com/us/en/men/accessories-and-shoes/shoes",
} as const;

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function getProductInfo(p: Product): ProductInfo {
  const missing = {
    materials: null,
    sizeGuideUrl: null,
    reviewsSummary: null,
  };
  if (p.retailer === "Owned" || p.id.startsWith("custom-")) {
    return {
      ...missing,
      href: null,
      linkLabel: "From your wardrobe",
      sourceLabel: "Your wardrobe · user-provided information",
      fitSummary:
        "Use your experience with this item; fit has not been measured or verified.",
    };
  }

  const demo = catalog.find((entry) => entry.id === p.id);
  if (demo) {
    // FORM concepts have no corresponding retailer product. Do not send them
    // to unrelated UNIQLO clothing just because the old catalog did.
    const href =
      demo.id === "jeans"
        ? "https://www.levi.com/US/en_US/jeans-by-fit-number/men/jeans/501/c/levi_jeans_by_fit_number_men_jeans_501"
        : demo.id === "stan"
          ? "https://www.adidas.com/us/stan_smith"
          : demo.brand === "FORM essentials"
            ? null
            : ["knit", "polo", "cardigan"].includes(demo.id)
              ? "https://www.uniqlo.com/us/en/men/sweaters"
              : ["oxford", "overshirt"].includes(demo.id)
                ? "https://www.uniqlo.com/us/en/men/shirts-and-polos"
                : uniqloCollections[demo.category];
    return {
      ...missing,
      href,
      linkLabel: href
        ? `Browse ${demo.retailer} collection`
        : "Retailer link unavailable",
      sourceLabel: "Demo catalog · estimated USD price · illustration",
      fitSummary:
        "Fit unverified. No exact garment measurements, verified materials, size guide, or customer fit reviews are available for this demo item.",
    };
  }

  const href = safeExternalUrl(p.url);
  return {
    ...missing,
    href,
    linkLabel: href
      ? p.linkType === "collection"
        ? "Browse collection (unverified)"
        : "View supplied product link (unverified)"
      : "Retailer link unavailable",
    sourceLabel: "User-provided item · price and availability unverified",
    fitSummary:
      "Fit unverified. Check the exact item's retailer size guide and garment measurements before choosing a size.",
  };
}
