export type Category = "top" | "bottom" | "shoes" | "outerwear" | "accessory";
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  tags: string[];
  color: string;
  hex: string;
  price: number;
  retailer: string;
  url: string;
  image: string;
  linkType: "product" | "collection";
};
export type OutfitItem = { productId: string; owned: boolean };
export type Outfit = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  occasion: string;
  items: OutfitItem[];
  rationale: string;
  lockedCategories?: Category[];
};
export type WardrobeItem = { id: string; productId: string };
export type InspirationImage = { id: string; image: string; tag: string };
export type UserStyleProfile = {
  styles: string[];
  colors: string[];
  avoid: string;
  fit: string;
  budget: number;
  occasion: string;
  weights: Record<string, number>;
  inspiration: InspirationImage[];
};
export type ConversationMessage = {
  id: string;
  role: "user" | "agent";
  outfits?: Outfit[];
  text: string;
  weather?: WeatherContext;
  profile?: UserStyleProfile;
};
export type WeatherContext = {
  location: string;
  observedAt: string;
  temperature: number;
  feelsLike: number;
  precipitation: number;
  wind: number;
  low: number;
  high: number;
  rainChance: number;
};
export type ScanProfile = {
  complete: boolean;
  height: number;
  chest: number;
  waist: number;
  hip: number;
  shoulder: number;
  fit: string;
};
