import { catalog, product } from "./catalog";
import { Outfit, Product, UserStyleProfile, Category } from "./types";
export const total = (outfit: Outfit, extra: Product[] = []) =>
  Math.round(
    outfit.items.reduce(
      (s, i) => s + (i.owned ? 0 : product(i.productId, extra).price),
      0,
    ) * 100,
  ) / 100;
export function budgetFrom(text: string, fallback: number) {
  const m =
    text.match(
      /(?:under|below|budget(?:\s+of)?|less than|up to|maximum|keep.*?under)\s*\$?\s*(\d+(?:\.\d+)?)/i,
    ) || text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? Math.max(0, Number(m[1])) : fallback;
}
export function generate(
  text: string,
  profile: UserStyleProfile,
  owned: string[] = [],
  extra: Product[] = [],
): Outfit[] {
  const budget = budgetFrom(text, profile.budget),
    lower = text.toLowerCase();
  const street = /street|sport|hoodie/.test(lower),
    dinner = /dinner|birthday|night|formal/.test(lower) || profile.occasion === "Dinner",
    preppy = /preppy|office|work/.test(lower),
    rain = /rain|seattle|cold|weather/.test(lower);
  const useOwned = /wardrobe|own|already|buy as little/.test(lower);
  const ranked = [...profile.styles].sort(
    (a, b) => (profile.weights[b] || 0) - (profile.weights[a] || 0),
  );
  const chosen = street
    ? "streetwear"
    : dinner
      ? "night out"
      : preppy
        ? "preppy"
        : ranked[0] || "minimalist";
  const templates = street
    ? [
        ["hoodie", "cargo", "canvas", "rain-shell"],
        ["air-tee", "washed-jeans", "runners", "cap"],
        ["sage-tee", "cargo", "stan", "overshirt"],
      ]
    : dinner
      ? [
          ["polo", "black-pants", "loafers", "belt"],
          ["knit", "trousers", "stan", "blazer"],
          ["oxford", "chino", "loafers", "cardigan"],
        ]
      : [
          ["u-tee", "trousers", "stan", "overshirt"],
          ["air-tee", "washed-jeans", "canvas", "denim-jacket"],
          ["oxford", "chino", "white-canvas", "cardigan"],
        ];
  const names = street
    ? ["Off-duty energy", "City in motion", "Utility, refined"]
    : dinner
      ? ["After hours", "Quiet confidence", "A little occasion"]
      : ["The everyday edit", "A different rhythm", "Considered casual"];
  return templates.map((ids, index) => {
    let items = ids.map((id) => ({ productId: id, owned: false }));
    // Profile colors and dislikes choose real alternatives, never merely change copy.
    items = items.map((i) => {
      const p = product(i.productId),
        avoided = profile.avoid
          .toLowerCase()
          .split(/[,;]+/)
          .map((x) => x.trim())
          .filter(Boolean);
      const blocked = (candidate: Product) =>
        avoided.some((a) =>
          [candidate.color, ...candidate.tags, candidate.name].some((v) =>
            v.toLowerCase().includes(a),
          ),
        );
      if (blocked(p) || (!profile.colors.includes(p.color) && index === 2)) {
        const candidates = catalog
          .filter((c) => c.category === p.category && !blocked(c))
          .sort(
            (a, b) =>
              Number(profile.colors.includes(b.color)) -
              Number(profile.colors.includes(a.color)) +
              (Number(b.tags.includes(chosen)) -
                Number(a.tags.includes(chosen))) *
                0.5,
          );
        if (candidates.length)
          return { ...i, productId: candidates[index % candidates.length].id };
      }
      return i;
    });
    if (rain)
      items = items
        .filter((i) => product(i.productId).category !== "outerwear")
        .concat({ productId: "rain-shell", owned: false });
    if (useOwned)
      items = items.map((i) => {
        const matches = owned.filter(
          (id) => product(id, extra).category === product(i.productId).category,
        );
        const match =
          matches.find((id) =>
            lower.includes(product(id, extra).name.toLowerCase()),
          ) || matches[0];
        return match ? { productId: match, owned: true } : i;
      });
    const outfit: Outfit = {
      id: `look-${Date.now()}-${index}`,
      name: names[index],
      description: [
        "Relaxed proportions. A thoughtful palette. Effortless by design.",
        "A little texture, a little attitude. Made for your everyday.",
        "Familiar pieces, pulled together with a fresh point of view.",
      ][index],
      tags: [chosen, index === 1 ? "relaxed" : "considered"],
      occasion: dinner ? "Dinner" : rain ? "Rainy days" : profile.occasion,
      rationale: `${useOwned ? "Built around pieces you own. " : ""}${rain ? "A lightweight shell adds a layer for changing weather. " : ""}Balanced proportions and ${index === 1 ? "contrasting textures" : "a tonal palette"} make this easy to wear.`,
      items,
    };
    const categories: Category[] = [
      "outerwear",
      "accessory",
      "shoes",
      "bottom",
      "top",
    ];
    for (const category of categories) {
      if (total(outfit, extra) <= budget) break;
      const at = outfit.items.findIndex(
        (i) => !i.owned && product(i.productId, extra).category === category,
      );
      if (at < 0) continue;
      const current = product(outfit.items[at].productId, extra);
      const cheap = catalog
        .filter((p) => p.category === category)
        .sort((a, b) => a.price - b.price)[index % 2];
      if (cheap.price < current.price)
        outfit.items[at] = { productId: cheap.id, owned: false };
      if (
        total(outfit, extra) > budget &&
        (category === "outerwear" || category === "accessory")
      )
        outfit.items.splice(at, 1);
    }
    outfit.tags = [
      ...new Set(outfit.items.map((i) => product(i.productId, extra).tags[0])),
    ].slice(0, 2);
    return outfit;
  });
}
export function replacementCategory(text: string): Category | undefined {
  if (/jacket|coat|blazer|outerwear|layer/.test(text)) return "outerwear";
  if (/pants|trouser|jeans|bottom/.test(text)) return "bottom";
  if (/shoe|sneaker|loafer/.test(text)) return "shoes";
  if (/shirt|tee|top|polo|knit/.test(text)) return "top";
  if (/bag|belt|cap|accessor/.test(text)) return "accessory";
}
export function alternatives(
  outfit: Outfit,
  category: Category,
  extra: Product[] = [],
  cheaper = false,
) {
  const old = outfit.items.find(
    (i) => product(i.productId, extra).category === category,
  );
  return [...catalog, ...extra]
    .filter(
      (p) =>
        p.category === category &&
        p.id !== old?.productId &&
        (!cheaper || p.price < product(old?.productId || "", extra).price),
    )
    .sort((a, b) => a.price - b.price);
}
export function readStored<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...fallback, ...value }
      : fallback;
  } catch {
    return fallback;
  }
}
