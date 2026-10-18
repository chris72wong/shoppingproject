"use client";

import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { product } from "@/lib/catalog";
import { Outfit, Product, ScanProfile } from "@/lib/types";
import "./outfits.css";
const Avatar = dynamic(() => import("./Avatar"), { ssr: false });

export function OutfitCard({
  outfit,
  index,
  extra = [],
  onOpen,
  scan,
}: {
  outfit: Outfit;
  index: number;
  extra?: Product[];
  onOpen: () => void;
  scan: ScanProfile;
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
      <div className="outfit-card-avatar" aria-hidden="true">
        <span className="outfit-number">0{index + 1}</span>
        <Avatar outfit={outfit} profile={scan} extra={extra} interactive={false} />
        <span className="avatar-preview-label">3D sample body</span>
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
