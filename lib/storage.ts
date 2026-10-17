import {
  Product,
  Outfit,
  UserStyleProfile,
  ScanProfile,
  ConversationMessage,
  WardrobeItem,
} from "./types";
export type Store = {
  profile: UserStyleProfile;
  scan: ScanProfile;
  outfits: Outfit[];
  saved: Outfit[];
  wardrobe: WardrobeItem[];
  custom: Product[];
  messages: ConversationMessage[];
  selected: number;
};
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const validOutfit = (o: Outfit) =>
  o &&
  typeof o.id === "string" &&
  typeof o.name === "string" &&
  typeof o.description === "string" &&
  typeof o.rationale === "string" &&
  strings(o.tags) &&
  Array.isArray(o.items) &&
  o.items.length > 0 &&
  o.items.every(
    (i) => i && typeof i.productId === "string" && typeof i.owned === "boolean",
  );
export function restore(raw: string | null, defaults: Store): Store {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || typeof value !== "object" || Array.isArray(value))
      return defaults;
    const s: Store = { ...defaults, ...value };
    s.outfits =
      Array.isArray(s.outfits) &&
      s.outfits.length === 3 &&
      s.outfits.every(validOutfit)
        ? s.outfits
        : defaults.outfits;
    s.saved = Array.isArray(s.saved) ? s.saved.filter(validOutfit) : [];
    s.wardrobe = Array.isArray(s.wardrobe)
      ? s.wardrobe.filter(
          (i) =>
            i && typeof i.id === "string" && typeof i.productId === "string",
        )
      : defaults.wardrobe;
    s.messages = Array.isArray(s.messages)
      ? s.messages.filter(
          (m) =>
            m &&
            typeof m.id === "string" &&
            typeof m.text === "string" &&
            ["user", "agent"].includes(m.role),
        )
      : [];
    s.custom = Array.isArray(s.custom)
      ? s.custom.filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            typeof p.price === "number" &&
            Number.isFinite(p.price) &&
            p.price >= 0 &&
            typeof p.hex === "string" &&
            /^#[a-f0-9]{6}$/i.test(p.hex) &&
            typeof p.color === "string" &&
            strings(p.tags) &&
            typeof p.image === "string" &&
            (p.image.startsWith("/garments/") ||
              /^data:image\/(png|jpeg|webp);base64,/.test(p.image)) &&
            ["top", "bottom", "shoes", "outerwear", "accessory"].includes(
              p.category,
            ),
        )
      : [];
    s.profile = { ...defaults.profile, ...s.profile };
    for (const key of ["styles", "colors"] as const)
      if (!strings(s.profile[key])) s.profile[key] = defaults.profile[key];
    for (const key of ["avoid", "occasion", "fit"] as const)
      if (typeof s.profile[key] !== "string")
        s.profile[key] = defaults.profile[key];
    if (!Number.isFinite(s.profile.budget) || s.profile.budget < 0)
      s.profile.budget = defaults.profile.budget;
    s.profile.inspiration = Array.isArray(s.profile.inspiration)
      ? s.profile.inspiration.filter(
          (i) =>
            i &&
            typeof i.id === "string" &&
            typeof i.tag === "string" &&
            typeof i.image === "string" &&
            (i.image.startsWith("/garments/") ||
              /^data:image\/(png|jpeg|webp);base64,/.test(i.image)),
        )
      : defaults.profile.inspiration;
    s.profile.weights =
      s.profile.weights && typeof s.profile.weights === "object"
        ? Object.fromEntries(
            Object.entries(s.profile.weights).filter(
              ([, v]) => typeof v === "number" && Number.isFinite(v),
            ),
          )
        : {};
    s.scan = { ...defaults.scan, ...s.scan };
    for (const key of [
      "height",
      "chest",
      "waist",
      "hip",
      "shoulder",
    ] as const) {
      const min = key === "height" ? 140 : key === "shoulder" ? 32 : 60,
        max = key === "height" ? 205 : key === "shoulder" ? 60 : 140;
      if (!Number.isFinite(s.scan[key])) s.scan[key] = defaults.scan[key];
      s.scan[key] = Math.max(min, Math.min(max, s.scan[key]));
    }
    s.scan.complete = s.scan.complete === true;
    s.scan.fit = ["Regular", "Oversized", "Fitted"].includes(s.scan.fit)
      ? s.scan.fit
      : "Regular";
    s.selected = Math.max(0, Math.min(2, Math.floor(Number(s.selected) || 0)));
    return s;
  } catch {
    return defaults;
  }
}
