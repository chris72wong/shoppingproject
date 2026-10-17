import { alternatives, budgetFrom, generate, total } from "./agent";
import { product } from "./catalog";
import {
  Category,
  Outfit,
  Product,
  UserStyleProfile,
  WardrobeItem,
} from "./types";
export type ConversationState = {
  profile: UserStyleProfile;
  outfits: Outfit[];
  selected: number;
  custom: Product[];
  wardrobe: WardrobeItem[];
  pending?: string;
};
export type ConversationResponse = {
  text: string;
  outfits?: Outfit[];
  selected?: number;
  profile?: UserStyleProfile;
  pending?: string;
};
export const snapshotOutfits = (outfits: Outfit[]): Outfit[] =>
  outfits.map((o) => ({
    ...o,
    tags: [...o.tags],
    items: o.items.map((i) => ({ ...i })),
    ...(o.lockedCategories
      ? { lockedCategories: [...o.lockedCategories] }
      : {}),
  }));
const words: Record<string, number> = {
  one: 0,
  first: 0,
  two: 1,
  second: 1,
  three: 2,
  third: 2,
  "1": 0,
  "2": 1,
  "3": 2,
};
const categories: [Category, RegExp][] = [
  ["outerwear", /\b(jacket|coat|blazer|outerwear|layer|cardigan|overshirt)\b/i],
  ["bottom", /\b(pants|trousers?|jeans|bottoms?|chinos?)\b/i],
  ["shoes", /\b(shoes?|sneakers?|loafers?|footwear)\b/i],
  ["top", /\b(shirts?|tees?|tops?|polo|knit|hoodie)\b/i],
  ["accessory", /\b(bag|belt|cap|accessor(?:y|ies)|scarf|tote)\b/i],
];
function targetIn(text: string): number | undefined {
  const m =
    text.match(/\b(?:outfit|look|option)\s*(one|two|three|[123])\b/i) ||
    text.match(/\b(first|second|third)\s+(?:outfit|look|option)\b/i) ||
    text.match(/^\s*(one|two|three|[123])\s*[.!]?$/i);
  return m ? words[m[1].toLowerCase()] : undefined;
}
const avoids = (p: Product, profile: UserStyleProfile) =>
  profile.avoid
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((a) =>
      [p.name, p.color, ...p.tags].some((v) => v.toLowerCase().includes(a)),
    );
export function respond(
  input: string,
  state: ConversationState,
): ConversationResponse {
  const original = input.trim();
  if (!original)
    return {
      text: "Describe an occasion, a style, or an outfit change and I’ll help.",
    };
  let text = original.toLowerCase();
  let target = targetIn(text);
  if (state.pending && (target !== undefined || /\ball\b/.test(text)))
    text = `${state.pending.toLowerCase()} ${text}`;
  const all = /\b(all|every|each)\b/.test(text);
  if (target === undefined && state.selected >= 0)
    target = Math.min(2, state.selected);
  const cheaper =
    /cheaper|affordable|lower.*(?:price|cost)|less expensive|reduce.*(?:price|cost)|\bunder\s*\$?\d|\bbudget\b/.test(
      text,
    );
  const replaceMatch = text.match(
    /\b(?:replace|swap|change|switch)\s+(?:out|the|my|a|an|in|on|\s)*(.+)/,
  );
  const replaceCategory = replaceMatch
    ? categories.find(([, p]) => p.test(replaceMatch[1]))?.[0]
    : undefined;
  const keepMatch = text.match(
    /\b(?:keep|lock|preserve)\s+(.+?)(?=\b(?:but|replace|swap|change|switch|and make)\b|$)/,
  );
  const keep = keepMatch
    ? categories.filter(([, p]) => p.test(keepMatch[1])).map(([c]) => c)
    : [];
  const refinement = !!replaceMatch || keep.length > 0 || cheaper;
  const hasOutfits = state.outfits.length === 3;
  const newRequest =
    /\b(new|fresh|another|different)\s+(?:three\s+)?(?:outfits?|looks?|options?)\b|\b(start over|regenerate)\b/.test(
      text,
    ) ||
    (!replaceMatch &&
      !keepMatch &&
      targetIn(text) === undefined &&
      !all &&
      /\b(dinner|office|work|campus|school|streetwear|preppy|minimalist|birthday|casual|sporty|weekend|travel)\b/.test(text) &&
      /\b(outfits?|looks?|something|for|streetwear|preppy|minimalist|casual|sporty)\b/.test(text));
  const styleRequest =
    /\b(outfits?|looks?|style|wear|dress|dinner|office|work|campus|school|casual|streetwear|preppy|minimalist|birthday|wedding|rain|weather|sporty|weekend|date|travel)\b/.test(
      text,
    );
  if (hasOutfits && refinement && !newRequest) {
    if (target === undefined && !all)
      return {
        text: "Which outfit should I update—one, two, or three? You can also say all three.",
        pending: original,
      };
    if (replaceMatch && !replaceCategory)
      return {
        text: "Which piece should I replace: the top, pants, shoes, jacket, or accessory?",
        pending: "",
      };
    const replacementConstraint = replaceMatch?.[1].match(
      /\b(?:with|for|to)\s+(.+)/,
    )?.[1];
    if (replacementConstraint)
      return {
        text: `I can swap that piece for a catalog alternative, but I can’t apply the requested “${replacementConstraint}” constraint yet. The outfits are unchanged. Ask for a simple replacement or a cheaper alternative.`,
        pending: "",
      };
    const next = snapshotOutfits(state.outfits),
      indices = all ? [0, 1, 2] : [target!];
    let changes = 0,
      lockedCount = 0;
    const budget = budgetFrom(text, state.profile.budget);
    for (const index of indices) {
      const outfit = next[index],
        locked = new Set([...(outfit.lockedCategories || []), ...keep]);
      if (replaceCategory) locked.delete(replaceCategory);
      outfit.lockedCategories = [...locked];
      lockedCount += locked.size;
      const update = (category: Category, lowerPrice: boolean) => {
        if (locked.has(category)) return;
        const at = outfit.items.findIndex(
          (i) => product(i.productId, state.custom).category === category,
        );
        if (at < 0 || outfit.items[at].owned) return;
        const candidate = alternatives(
          outfit,
          category,
          state.custom,
          lowerPrice,
        ).find((p) => !avoids(p, state.profile));
        if (!candidate) return;
      outfit.items[at] = {
        productId: candidate.id,
        owned: state.wardrobe.some((item) => item.productId === candidate.id) || candidate.retailer === "Owned",
      };
        changes++;
      };
      if (replaceCategory) update(replaceCategory, cheaper);
      else if (cheaper)
        for (const [category] of categories) update(category, true);
      outfit.rationale = `Selected for ${outfit.occasion.toLowerCase()}, using ${outfit.items
        .map((i) => product(i.productId, state.custom).color.toLowerCase())
        .filter((v, at, a) => a.indexOf(v) === at)
        .join(
          ", ",
        )} tones. ${locked.size ? "The pieces you asked to keep are preserved. " : ""}Prices are demo estimates; confirm retailer details before buying.`;
    }
    const label = all ? "all three outfits" : `outfit ${target! + 1}`;
    const overBudget =
      cheaper && indices.some((i) => total(next[i], state.custom) > budget);
    return {
      text: `${changes ? `Updated ${label}${replaceCategory ? ` with ${replaceCategory === "outerwear" ? "different outerwear" : replaceCategory === "shoes" ? "different shoes" : `a different ${replaceCategory === "bottom" ? "pair of pants" : replaceCategory}`}` : " with lower-priced pieces"}.` : keep.length ? `Kept those pieces in ${label}.` : `I couldn’t find an available ${cheaper ? "lower-priced " : ""}alternative for ${label}.`}${lockedCount ? " Your kept pieces stay in place." : ""}${overBudget ? ` The available pieces still exceed $${budget}; the cards show the actual demo totals.` : ""}`,
      outfits: next,
      selected: target ?? state.selected,
      ...(cheaper && /\d/.test(text)
        ? { profile: { ...state.profile, budget } }
        : {}),
      pending: "",
    };
  }
  if (
    hasOutfits &&
    !refinement &&
    !newRequest &&
    /\b(make|tweak|add|remove|resize|recolor|adjust)\b/.test(text)
  )
    return {
      text: "I can replace a top, pants, shoes, jacket, or accessory, keep pieces you like, or find lower-priced alternatives. Tell me the outfit and one of those changes.",
      pending: "",
    };
  if (hasOutfits && /\b(why|reason|explain)\b/.test(text))
    return { text: state.outfits[target ?? 0].rationale, pending: "" };
  if (
    hasOutfits &&
    targetIn(original) !== undefined &&
    !refinement &&
    !newRequest
  )
    return {
      text: `Outfit ${target! + 1} is selected. Tell me which piece to replace or ask me to make it more affordable.`,
      selected: target,
      pending: "",
    };
  if (!styleRequest && !newRequest && !(cheaper && !hasOutfits))
    return {
      text: "I can suggest three outfits and help replace pieces or lower their cost. Try an occasion and budget, or ask to replace a specific piece in outfit one, two, or three.",
      pending: "",
    };
  const profile = {
    ...state.profile,
    budget: budgetFrom(text, state.profile.budget),
    occasion: /dinner|birthday|night out/.test(text)
      ? "Dinner"
      : /campus|school/.test(text)
        ? "Campus"
        : /office|work/.test(text)
          ? "Work"
          : state.profile.occasion,
  };
  const outfits = generate(
    text,
    profile,
    state.wardrobe.map((i) => i.productId),
    state.custom,
  );
  outfits.forEach((o) => {
    const pieces = o.items.map((i) => product(i.productId, state.custom));
    o.rationale = `Built for ${o.occasion.toLowerCase()} with ${pieces
      .map((p) => p.color.toLowerCase())
      .filter((v, at, a) => a.indexOf(v) === at)
      .join(
        ", ",
      )} tones. ${pieces.map((p) => p.name).join(", ")} form this combination, guided by your ${profile.styles.join(" and ") || "everyday"} preferences. Prices are demo estimates; fit and availability need retailer confirmation.`;
  });
  const exceeded = outfits.some((o) => total(o, state.custom) > profile.budget);
  return {
    text: `Here are three outfits to explore. Open any look for the pieces and styling notes, then tell me what you’d like to change.${exceeded ? " The catalog cannot meet that budget with complete outfits; the cards show the actual demo totals." : ""}`,
    outfits: snapshotOutfits(outfits),
    selected: -1,
    profile,
    pending: "",
  };
}
