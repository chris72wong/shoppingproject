"use client";

import { ArrowUpRight } from "lucide-react";
import { product } from "@/lib/catalog";
import { Outfit, Product } from "@/lib/types";
import "./outfits.css";

export function OutfitCard({
  outfit,
  index,
  extra = [],
  onOpen,
}: {
  outfit: Outfit;
  index: number;
  extra?: Product[];
  onOpen: () => void;
}) {
  const pieces = outfit.items.map((item) => product(item.productId, extra));
  const total = outfit.items.reduce(
    (sum, item, i) => sum + (item.owned ? 0 : pieces[i].price),
    0,
  );
  return (
    <button
      type="button"
      className="outfit-card"
      onClick={onOpen}
      aria-label={`Explore outfit ${index + 1}: ${outfit.name}`}
    >
      <div className="outfit-collage" aria-hidden="true">
        <span className="outfit-number">0{index + 1}</span>
        {pieces.map((piece, i) => (
          <img
            key={`${piece.id}-${i}`}
            className={`outfit-garment outfit-garment-${piece.category}`}
            src={piece.image}
            alt=""
            loading="lazy"
          />
        ))}
        <span className="outfit-open">
          <ArrowUpRight size={18} />
        </span>
      </div>
      <div className="outfit-card-copy">
        <h3>{outfit.name}</h3>
        <p>{outfit.description}</p>
        <span className="outfit-price">
          ${total.toFixed(0)} USD <span>estimated · new pieces</span>
        </span>
      </div>
    </button>
  );
}

export default OutfitCard;
