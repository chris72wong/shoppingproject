"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Bookmark, Check, RefreshCw, X } from "lucide-react";
import { product } from "@/lib/catalog";
import { total } from "@/lib/agent";
import { similarItems } from "@/lib/swaps";
import { getProductInfo } from "@/lib/product-info";
import type { Outfit, Product, ScanProfile } from "@/lib/types";
import "./outfits.css";

const Avatar = dynamic(() => import("./Avatar"), { ssr: false });

export default function OutfitStudio({ outfits, index, scan, extra, budget, wardrobe, saved, disabled, onSelect, onSwap, onSave, onFeedback }: {
  outfits: Outfit[]; index: number; scan: ScanProfile; extra: Product[];
  budget: number; wardrobe: string[]; saved: boolean; disabled: boolean;
  onSelect: (index: number) => void; onSwap: (id: string, replacement: Product) => void;
  onSave: () => void; onFeedback: (text: string) => void;
}) {
  const outfit = outfits[index];
  const title = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const signature = outfit.items.map((item) => item.productId).join("/");
  useEffect(() => {
    const animation = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? preview.current?.animate([{ opacity: 0.25, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }], { duration: 420, easing: "ease-out" }) : null;
    return () => animation?.cancel();
  }, [outfit.id, signature, index]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pieces = outfit.items.map((item) => product(item.productId, extra));
  const piece = pieces.find((p) => p.id === selected);
  const info = piece ? getProductInfo(piece) : null;
  const choices = piece ? similarItems(outfit, piece, extra, budget, wardrobe).filter((candidate) =>
    total(outfit, extra) - (outfit.items.find((item) => item.productId === piece.id)?.owned ? 0 : piece.price)
      + (wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? 0 : candidate.price) <= budget
  ).slice(0, 4) : [];
  function inspect(id: string | null) {
    if (timer.current) clearTimeout(timer.current);
    if (pinned) return;
    if (id) setSelected(id);
    else timer.current = setTimeout(() => setSelected(null), 220);
  }
  function navigate(next: number) {
    if (timer.current) clearTimeout(timer.current);
    setSelected(null); setPinned(false);
    onSelect((next + outfits.length) % outfits.length);
  }
  return (
    <section className="outfit-studio" aria-labelledby={title}>
      <header className="studio-heading" aria-live="polite">
        <span className="outfit-eyebrow">YOUR EDIT · {index + 1} / {outfits.length}</span>
        <h2 id={title}>{outfit.name}</h2>
        <p>{outfit.description}</p>
      </header>
      <div className="studio-stage">
        <button className="studio-arrow studio-previous" disabled={disabled || outfits.length < 2} onClick={() => navigate(index - 1)} aria-label="Previous outfit"><ArrowLeft size={20} /></button>
        <div className="studio-avatar" ref={preview}>
          <Avatar outfit={outfit} profile={scan} extra={extra} onItem={inspect} />
        </div>
        <button className="studio-arrow studio-next" disabled={disabled || outfits.length < 2} onClick={() => navigate(index + 1)} aria-label="Next outfit"><ArrowRight size={20} /></button>
        {piece && info && (
          <aside className="studio-item-card" aria-label="Clothing item details" onMouseEnter={() => inspect(piece.id)} onMouseLeave={() => inspect(null)} onFocusCapture={() => { if (timer.current) clearTimeout(timer.current); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) inspect(null); }} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setSelected(null); } }}>
            <button className="studio-card-close" aria-label="Close item details" onClick={() => { setSelected(null); setPinned(false); }}><X size={15} /></button>
            <span className="outfit-eyebrow">ON YOUR AVATAR</span>
            <h3>{piece.name}</h3>
            <p>{piece.brand} · {piece.color}</p>
            <strong>{outfit.items.find((item) => item.productId === piece.id)?.owned ? "Already owned" : `$${piece.price.toFixed(2)} USD`}</strong>
            <p className="outfit-data-note">{info.sourceLabel} · Estimated price</p>
            {info.href && <a className="studio-retailer" href={info.href} target="_blank" rel="noopener noreferrer">{info.linkLabel} ↗</a>}
            <h4>Affordable alternatives</h4>
            <p className="outfit-data-note">Keeps new pieces within your ${budget} budget.</p>
            {!choices.length && <p className="outfit-data-note">{outfit.lockedCategories?.includes(piece.category) ? "You asked to keep this category." : "No alternatives within this budget. Ask your stylist for more options."}</p>}
            {choices.map((candidate) => <button className="swap-choice" key={candidate.id} disabled={disabled} onClick={() => { onSwap(piece.id, candidate); setSelected(candidate.id); setPinned(true); }}>
              <img src={candidate.image} alt="" /><span>{candidate.name}<small>{wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? "Owned" : `$${candidate.price.toFixed(2)} USD`} · Swap in</small></span>
            </button>)}
          </aside>
        )}
      </div>
      <p className="outfit-caption">Hover a garment for details & swaps. Drag to rotate.</p>
      <div className="avatar-item-controls" aria-label="Explore worn pieces">
        {pieces.map((item) => <button key={item.id} disabled={disabled} aria-pressed={selected === item.id} onMouseEnter={() => inspect(item.id)} onMouseLeave={() => inspect(null)} onFocus={() => inspect(item.id)} onBlur={() => inspect(null)} onClick={() => { setSelected(item.id); setPinned(true); }}>{item.category}</button>)}
      </div>
      <div className="studio-summary"><span>${total(outfit, extra).toFixed(2)} USD <small>estimated new pieces</small></span><button disabled={disabled} onClick={onSave} aria-pressed={saved}>{saved ? <Check size={14} /> : <Bookmark size={14} />}{saved ? "Saved" : "Save look"}</button></div>
      <div className="studio-feedback" aria-label="Give your stylist feedback">
        <button disabled={disabled} onClick={() => onFeedback(`I want to pursue outfit ${index + 1}, ${outfit.name}. Help me refine this look.`)}><Check size={14} />Pursue this look</button>
        <button disabled={disabled} onClick={() => onFeedback(`I like outfit ${index + 1}, ${outfit.name}. Please give me more options in this direction.`)}>More like this</button>
        <button disabled={disabled} onClick={() => onFeedback(`I don't like the concept of outfit ${index + 1}, ${outfit.name}. Please regenerate with a different direction.`)}><RefreshCw size={14} />New direction</button>
      </div>
      <p className="studio-preview-note">Illustrative avatar · Catalog estimates, excluding tax & shipping</p>
    </section>
  );
}
