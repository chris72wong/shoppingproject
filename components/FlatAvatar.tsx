import { Outfit, Product } from "@/lib/types";
import { product } from "@/lib/catalog";
export function FlatAvatar({
  outfit,
  extra = [],
  onItem,
  onSelectItem,
}: {
  outfit: Outfit;
  extra?: Product[];
  onItem?: (id: string | null) => void;
  onSelectItem?: (id: string) => void;
}) {
  return (
    <div className="flat-avatar" aria-label="Illustrated outfit preview">
      <div className="flat-head" />
      {[...outfit.items]
        .sort(
          (a, b) =>
            ["outerwear", "top", "bottom", "shoes", "accessory"].indexOf(
              product(a.productId, extra).category,
            ) -
            ["outerwear", "top", "bottom", "shoes", "accessory"].indexOf(
              product(b.productId, extra).category,
            ),
        )
        .map((i) => (
          <img
            onMouseEnter={() => onItem?.(i.productId)}
            onMouseLeave={() => onItem?.(null)}
            onClick={() => onSelectItem?.(i.productId)}
            role={onSelectItem ? "button" : undefined}
            tabIndex={onSelectItem ? 0 : undefined}
            onFocus={() => onItem?.(i.productId)}
            onBlur={() => onItem?.(null)}
            onKeyDown={(event) => {
              if (onSelectItem && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelectItem(i.productId);
              }
            }}
            key={i.productId}
            className={"flat-" + product(i.productId, extra).category +
              (product(i.productId, extra).category === "top" && outfit.items.some((item) => product(item.productId, extra).category === "outerwear") ? " flat-layered-top" : "")}
            src={product(i.productId, extra).image}
            alt={product(i.productId, extra).name}
          />
        ))}
    </div>
  );
}
