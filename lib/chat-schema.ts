import { z } from "zod";

const text = z.string().min(1).max(2000);
const labels = z.array(z.string().min(1).max(100)).max(20);
export const categorySchema = z.enum(["top", "bottom", "shoes", "outerwear", "accessory"]);
const profileSchema = z.object({
  styles: labels, colors: labels, avoid: z.string().max(2000),
  fit: text, budget: z.number().min(0).max(1000000), occasion: text,
});
const outfitSchema = z.object({
  id: text, name: text, description: text, rationale: text, occasion: text,
  tags: labels,
  items: z.array(z.object({ productId: text, owned: z.boolean() })).min(1).max(5),
  lockedCategories: z.array(categorySchema).max(5).optional(),
});
export const chatRequestSchema = z.object({
  message: text,
  weatherCity: z.string().trim().min(2).max(100).optional(),
  location: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).optional(),
  history: z.array(z.object({ role: z.enum(["user", "agent"]), text })).max(24),
  state: z.object({
    profile: profileSchema,
    outfits: z.array(outfitSchema).max(3),
    selected: z.number().int().min(-1).max(2),
    pending: z.string().max(2000),
    wardrobe: z.array(z.object({ id: text, productId: text })).max(100),
    // Only text catalog metadata crosses the API boundary; never images or body scans.
    custom: z.array(z.object({
      id: text, name: text, brand: text, category: categorySchema,
      tags: labels, color: text, hex: z.string().regex(/^#[a-f\d]{6}$/i),
      price: z.number().min(0).max(1000000), retailer: text,
    })).max(100),
  }),
});

export const stylistPlanSchema = z.object({
  text: text,
  action: z.enum(["reply", "generate", "refine", "select"]),
  selected: z.number().int().min(-1).max(2),
  profile: profileSchema,
  updates: z.array(z.object({
    index: z.number().int().min(0).max(2),
    name: text, description: text, rationale: text, occasion: text, tags: labels,
    productIds: z.array(text).min(3).max(5),
    keepCategories: z.array(categorySchema).max(5),
  })).max(3),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type StylistPlan = z.infer<typeof stylistPlanSchema>;
