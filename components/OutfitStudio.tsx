"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { product } from "@/lib/catalog";
import { total } from "@/lib/agent";
import { similarItems } from "@/lib/swaps";
import { getProductInfo } from "@/lib/product-info";
import type { Outfit, Product, ScanProfile } from "@/lib/types";
import "./outfits.css";
import type { BodyPreview } from "./BodyMesh";

const Avatar = dynamic(() => import("./Avatar"), { ssr: false });

export default function OutfitStudio({ outfits, index, scan, extra, budget, wardrobe, disabled, onSelect, onSwap, onFeedback, bodyPreview }: {
  outfits: Outfit[]; index: number; scan: ScanProfile; extra: Product[];
  budget: number; wardrobe: string[]; disabled: boolean;
  onSelect: (index: number) => void; onSwap: (id: string, replacement: Product) => void;
  onFeedback: (text: string) => void;
  bodyPreview?: BodyPreview;
}) {
  const outfit = outfits[index];
  const [selected, setSelected] = useState<string | null>(null);
  const [swapNotice, setSwapNotice] = useState("");
  const [pinned, setPinned] = useState(false);
  const [illustrated, setIllustrated] = useState(false);
  const [zoom, setZoom] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  function selectItem(id: string) {
    if (timer.current) clearTimeout(timer.current);
    setSelected(id);
    setPinned(true);
  }
  function replaceItem(replacement: Product) {
    if (!piece || disabled) return;
    onSwap(piece.id, replacement);
    setSwapNotice(`Selected ${replacement.name}. Your other pieces are unchanged.`);
    selectItem(replacement.id);
  }
  return (
    <section className="outfit-studio" aria-label="Outfit studio">
      <span className="sr-only" aria-live="polite">Look {index + 1} of {outfits.length}: {outfit.name}</span>
      <div className="studio-toolbar">
        <div><h1>{outfit.name}</h1><p>Look {index + 1} of {outfits.length} · Select a piece to explore alternatives</p></div>
      </div>
      <div className="avatar-item-controls" aria-label="Preview mode">
        <button aria-pressed={!illustrated} onClick={() => setIllustrated(false)}>{bodyPreview ? "Body scan" : "3D human"}</button>
        <button aria-pressed={illustrated} onClick={() => setIllustrated(true)}>Outfit illustration</button>
      </div>
      <div className="studio-preview-layout">
      <div className="studio-stage">
        <button className="studio-arrow studio-previous" disabled={disabled || outfits.length < 2} onClick={() => navigate(index - 1)} aria-label="Previous outfit"><ArrowLeft size={20} /></button>
        <div className="studio-avatar">
          <Avatar outfit={outfit} profile={scan} extra={extra} onItem={inspect} onSelectItem={selectItem} zoom={zoom} bodyPreview={bodyPreview} illustrated={illustrated} />
        </div>
        <button className="studio-arrow studio-next" disabled={disabled || outfits.length < 2} onClick={() => navigate(index + 1)} aria-label="Next outfit"><ArrowRight size={20} /></button>
      </div>
      <div className="studio-details-slot">
        {piece && info && (
          <aside className="studio-item-card" aria-label="Clothing item details" onMouseEnter={() => inspect(piece.id)} onMouseLeave={() => inspect(null)} onFocusCapture={() => { if (timer.current) clearTimeout(timer.current); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) inspect(null); }} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setSelected(null); } }}>
            <button className="studio-card-close" aria-label="Close item details" onClick={() => { setSelected(null); setPinned(false); }}><X size={15} /></button>
            <span className="outfit-eyebrow">ILLUSTRATED SHOPPING OUTFIT</span>
            <img className="studio-worn-image" src={piece.image} alt={piece.name} />
            <h3>{piece.name}</h3>
            <p>{piece.brand} · {piece.color}</p>
            <strong>{outfit.items.find((item) => item.productId === piece.id)?.owned ? "Already owned" : `$${piece.price.toFixed(2)} USD`}</strong>
            <p className="outfit-data-note">{info.sourceLabel} · Estimated price</p>
            {info.href && <a className="studio-retailer" href={info.href} target="_blank" rel="noopener noreferrer">{info.linkLabel} ↗</a>}
            <h4>Affordable alternatives</h4>
            <p className="outfit-data-note">Choose a photo to swap only this {piece.category}. New pieces stay within ${budget}.</p>
            {!choices.length && <p className="outfit-data-note">{outfit.lockedCategories?.includes(piece.category) ? "You asked to keep this category." : "No alternatives within this budget. Ask your stylist for more options."}</p>}
            {choices.map((candidate) => <button className="swap-choice" key={candidate.id} disabled={disabled} onClick={() => replaceItem(candidate)}>
              <img src={candidate.image} alt={candidate.name} loading="lazy" />
              <span>{candidate.name}<small>{wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? "Owned" : `$${candidate.price.toFixed(2)} USD`} · Swap in</small></span>
            </button>)}
          </aside>
        )}
      </div>
      </div>
      <div className="studio-zoom" aria-label="Avatar zoom controls">
        <button aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, +(value - 0.25).toFixed(2)))}><ZoomOut size={16} /></button>
        <button aria-label="Reset avatar zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button aria-label="Zoom in" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, +(value + 0.25).toFixed(2)))}><ZoomIn size={16} /></button>
      </div>
      <div className="avatar-item-controls" aria-label="Inspect a clothing item">
        {pieces.map((item) => <button key={item.id} aria-pressed={selected === item.id && pinned} onClick={() => selectItem(item.id)}>{item.name}</button>)}
      </div>
      {!bodyPreview && <p className="outfit-caption">Sample human · original clothing. Select Outfit illustration to preview your choices; garment fitting is not connected.</p>}
      {bodyPreview && <p className="outfit-caption">{bodyPreview.simulated ? "Pilot garments · separate from shopping outfit" : "Body scan · shopping clothes unavailable"}</p>}
      <p className="swap-notice" role="status">{swapNotice}</p>
      <div className="studio-feedback" aria-label="Give your stylist feedback">
        <button disabled={disabled} onClick={() => onFeedback(`I don't like the concept of outfit ${index + 1}, ${outfit.name}. Please regenerate with a different direction.`)}><RefreshCw size={14} />New outfit</button>
      </div>
    </section>
  );
}
