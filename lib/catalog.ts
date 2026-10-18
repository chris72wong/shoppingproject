import { Product, Category } from "./types";
import { capsuleProducts } from "./capsule-products";
const uq = "https://www.uniqlo.com/us/en/men/tops?tagDesign=crew-neck";
const lv =
  "https://www.levi.com/US/en_US/jeans-by-fit-number/men/jeans/501/c/levi_jeans_by_fit_number_men_jeans_501";
const ad = "https://www.adidas.com/us/stan_smith";
const rows: [string, string, Category, string, string, number, string][] = [
  ["u-tee", "U crew neck tee", "top", "Chalk", "#e8e3d8", 20, "minimalist"],
  [
    "air-tee",
    "AIRism relaxed tee",
    "top",
    "Black",
    "#282828",
    25,
    "streetwear",
  ],
  ["stripe", "Striped cotton tee", "top", "Navy", "#394354", 25, "preppy"],
  ["knit", "Soft touch knit", "top", "Oat", "#b9a58e", 40, "smart casual"],
  ["oxford", "Oxford button-down", "top", "Blue", "#9cadb9", 40, "preppy"],
  ["polo", "Textured knit polo", "top", "Espresso", "#554539", 35, "night out"],
  ["sage-tee", "Cotton crew tee", "top", "Sage", "#8b9781", 15, "minimalist"],
  ["hoodie", "Relaxed sweatshirt", "top", "Grey", "#95948f", 35, "streetwear"],
  [
    "trousers",
    "Pleated wide trousers",
    "bottom",
    "Stone",
    "#b3a58b",
    50,
    "minimalist",
  ],
  ["jeans", "501 Original jeans", "bottom", "Indigo", "#40526b", 65, "vintage"],
  [
    "cargo",
    "Relaxed cargo trousers",
    "bottom",
    "Olive",
    "#65705c",
    45,
    "streetwear",
  ],
  ["chino", "Straight-leg chinos", "bottom", "Sand", "#c2ae8c", 40, "preppy"],
  [
    "black-pants",
    "Tailored ankle trousers",
    "bottom",
    "Black",
    "#303231",
    40,
    "night out",
  ],
  [
    "easy-pants",
    "Easy cotton trousers",
    "bottom",
    "Sand",
    "#c0b095",
    22,
    "minimalist",
  ],
  [
    "washed-jeans",
    "Relaxed denim",
    "bottom",
    "Washed blue",
    "#7b93a4",
    45,
    "casual elevated",
  ],
  [
    "stan",
    "Stan Smith sneakers",
    "shoes",
    "Cloud white",
    "#e5e3d9",
    75,
    "minimalist",
  ],
  ["canvas", "Canvas low tops", "shoes", "Black", "#343435", 25, "streetwear"],
  [
    "white-canvas",
    "Canvas low tops",
    "shoes",
    "White",
    "#dddcd5",
    30,
    "preppy",
  ],
  ["loafers", "Penny loafers", "shoes", "Brown", "#624738", 65, "night out"],
  [
    "runners",
    "Retro running sneakers",
    "shoes",
    "Grey",
    "#a5a6a2",
    60,
    "sporty",
  ],
  [
    "overshirt",
    "Utility overshirt",
    "outerwear",
    "Olive",
    "#66715b",
    50,
    "casual elevated",
  ],
  [
    "blazer",
    "Unstructured blazer",
    "outerwear",
    "Charcoal",
    "#4b4b47",
    80,
    "smart casual",
  ],
  [
    "denim-jacket",
    "Denim trucker jacket",
    "outerwear",
    "Indigo",
    "#51667a",
    65,
    "vintage",
  ],
  [
    "rain-shell",
    "Lightweight hooded shell",
    "outerwear",
    "Black",
    "#333b3a",
    45,
    "streetwear",
  ],
  [
    "cardigan",
    "Cotton V-neck cardigan",
    "outerwear",
    "Oat",
    "#bcae93",
    35,
    "preppy",
  ],
  [
    "light-jacket",
    "Cotton work jacket",
    "outerwear",
    "Sand",
    "#a89578",
    30,
    "minimalist",
  ],
  [
    "tote",
    "Canvas everyday tote",
    "accessory",
    "Natural",
    "#d2c7ad",
    15,
    "minimalist",
  ],
  [
    "cap",
    "Cotton six-panel cap",
    "accessory",
    "Forest",
    "#425543",
    15,
    "streetwear",
  ],
  ["belt", "Leather belt", "accessory", "Brown", "#644938", 20, "smart casual"],
  ["scarf", "Soft woven scarf", "accessory", "Grey", "#8b8b84", 18, "vintage"],
];
export const catalog: Product[] = rows.map(
  ([id, name, category, color, hex, price, style]) => ({
    id,
    name,
    category,
    color,
    hex,
    price,
    tags: [style, ...(category === "shoes" ? ["casual elevated"] : [])],
    brand:
      id === "jeans"
        ? "Levi’s"
        : id === "stan"
          ? "adidas"
          : id === "canvas" || id === "white-canvas"
            ? "FORM essentials"
            : "UNIQLO-inspired",
    retailer: id === "jeans" ? "Levi’s" : id === "stan" ? "adidas" : "UNIQLO",
    url: id === "jeans" ? lv : id === "stan" ? ad : category === "bottom" ? "https://www.uniqlo.com/us/en/men/bottoms" : uq,
    image: `/garments/${id}.svg`,
    linkType: "collection",
  }),
);
export const product = (id: string, extra: Product[] = []): Product =>
  capsuleProducts.find((p) => p.id === id) ||
  extra.find((p) => p.id === id) ||
  catalog.find((p) => p.id === id) ||
  catalog[0];
