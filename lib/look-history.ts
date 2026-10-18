import { snapshotOutfits } from "./conversation";
import type { Outfit } from "./types";

// Keep independent versions even when the generator reuses outfit IDs.
export function rememberOutfits(history: Outfit[] = [], outfits: Outfit[]): Outfit[] {
  const result = snapshotOutfits(history);
  const keys = new Set(result.map((outfit) => JSON.stringify(outfit)));
  for (const outfit of outfits) {
    const key = JSON.stringify(outfit);
    if (!keys.has(key)) {
      result.push(snapshotOutfits([outfit])[0]);
      keys.add(key);
    }
  }
  return result;
}

export function swapLook(outfits: Outfit[], index: number, updated: Outfit): Outfit[] {
  return outfits.map((outfit, position) => position === index ? snapshotOutfits([updated])[0] : outfit);
}
