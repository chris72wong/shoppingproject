"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, RefreshCw, X } from "lucide-react";
import { product } from "@/lib/catalog";
import { total } from "@/lib/agent";
import { similarItems } from "@/lib/swaps";
import { getProductInfo } from "@/lib/product-info";
import type { Outfit, Product, ScanProfile } from "@/lib/types";
import "./outfits.css";
import type { BodyPreview } from "./BodyMesh";
import ShoppingTryOn from "./ShoppingTryOn";
import { outfitPreviewKey } from "@/lib/body/outfit-tryon";
import { previewManifest } from "@/lib/preview-capsule";

const Avatar = dynamic(() => import("./Avatar"), { ssr: false });

export default function OutfitStudio({ outfits, index, scan, extra, budget, wardrobe, disabled, onSelect, onSwap, onFeedback, bodyPreview, onToggleOuter }: {
  outfits: Outfit[]; index: number; scan: ScanProfile; extra: Product[];
  budget: number; wardrobe: string[]; disabled: boolean;
  onSelect: (index: number) => void; onSwap: (id: string, replacement: Product) => void;
  onFeedback: (text: string) => void;
  bodyPreview?: BodyPreview;
  onToggleOuter?: () => void;
}) {
  const outfit = outfits[index];
  const [selected, setSelected] = useState<string | null>(null);
  const [swapNotice, setSwapNotice] = useState("");
  const [pinned, setPinned] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pieces = outfit.items.map((item) => product(item.productId, extra));
  const contextKey = outfitPreviewKey(bodyPreview?.scanId, bodyPreview?.version, pieces, {});
  const [shoppingPreview, setShoppingPreview] = useState<{ key: string; preview?: BodyPreview }>();
  const handleShoppingPreview = useCallback((preview: BodyPreview | undefined) => {
    setShoppingPreview({ key: contextKey, preview });
  }, [contextKey]);
  const fittedPreview = shoppingPreview?.key === contextKey ? shoppingPreview.preview : undefined;
  // A separately selected pilot outfit must not masquerade as this shopping look.
  const basePreview = bodyPreview?.baseUrl ? { ...bodyPreview, url: bodyPreview.baseUrl, simulated: false } : bodyPreview?.simulated ? undefined : bodyPreview;
  const displayedPreview = fittedPreview || basePreview;
  const piece = pieces.find((p) => p.id === selected);
  const info = piece ? getProductInfo(piece) : null;
  const choices = piece ? similarItems(outfit, piece, extra, budget, wardrobe).filter((candidate) =>
    total(outfit, extra) - (outfit.items.find((item) => item.productId === piece.id)?.owned ? 0 : piece.price)
      + (wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? 0 : candidate.price) <= budget
  ).slice(0, 4) : [];
  function inspect(id: string | null) {
    if (timer.current) clearTimeout(timer.current);
    if (id) {
      if (id !== selected) setPinned(false);
      setSelected(id);
    } else if (!pinned) timer.current = setTimeout(() => setSelected(null), 220);
  }
  function navigate(next: number) {
    if (timer.current) clearTimeout(timer.current);
    setSelected(null); setPinned(false); setInspectionId(null);
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
    setInspectionId(null);
    setSwapNotice(`Selected ${replacement.name}. Your other pieces are unchanged.`);
    selectItem(replacement.id);
  }
  return (
    <section className="outfit-studio" aria-label="Outfit studio">
      <span className="sr-only" aria-live="polite">Look {index + 1} of {outfits.length}: {outfit.name}</span>
      <div className="studio-toolbar">
        <div><h1>{outfit.name}</h1><p>Look {index + 1} of {outfits.length} · Select an item for shopping details</p></div>
      </div>
      <div className="studio-product-picker" aria-label="Outfit products">
        {pieces.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => selectItem(item.id)}>
          <img src={item.image} alt="" /><span>{item.name}</span>
        </button>)}
      </div>
      <div className="avatar-item-controls" aria-label="Clothing preview">
        <button aria-pressed={!inspectionId} onClick={() => setInspectionId(null)}>Full outfit</button>
        <button aria-pressed={!!inspectionId} disabled={!selected} onClick={() => setInspectionId(selected)}>Inspect selected piece</button>
        {onToggleOuter && pieces.every(piece => previewManifest.products.some(p => p.productId === piece.id)) && <button disabled={disabled || outfit.lockedCategories?.includes("outerwear")} onClick={() => { setInspectionId(null); onToggleOuter(); }}>{pieces.some(piece => piece.category === "outerwear") ? "Remove overshirt" : "Add blue overshirt"}</button>}
      </div>
      {previewManifest.status === "draft" && <p className="outfit-caption" role="status">Product-specific 3D draft · estimated appearance, not validated fit. M tops / 32inch trousers, 79 cm inseam.</p>}
      <ShoppingTryOn key={contextKey} products={pieces} selectedId={selected} body={basePreview} onPreview={handleShoppingPreview} />
      <div className="studio-preview-layout">
      <div className="studio-stage">
        <button className="studio-arrow studio-previous" disabled={disabled || outfits.length < 2} onClick={() => navigate(index - 1)} aria-label="Previous outfit"><ArrowLeft size={20} /></button>
        <div className="studio-avatar">
          <Avatar outfit={outfit} profile={scan} extra={extra} onItem={inspect} onSelectItem={selectItem} bodyPreview={displayedPreview} previewProductIds={inspectionId && pieces.some(p => p.id === inspectionId) ? [inspectionId] : undefined} />
        </div>
        <button className="studio-arrow studio-next" disabled={disabled || outfits.length < 2} onClick={() => navigate(index + 1)} aria-label="Next outfit"><ArrowRight size={20} /></button>
      </div>
      <div className="studio-details-slot">
        {piece && info && (
          <aside className="studio-item-card" aria-label="Clothing item details" onMouseEnter={() => inspect(piece.id)} onMouseLeave={() => inspect(null)} onFocusCapture={() => { if (timer.current) clearTimeout(timer.current); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) inspect(null); }} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setSelected(null); } }}>
            <button className="studio-card-close" aria-label="Close item details" onClick={() => { setSelected(null); setPinned(false); }}><X size={15} /></button>
            <span className="outfit-eyebrow">SHOPPING ITEM</span>
            <img className="studio-worn-image" src={piece.image} alt={piece.name} />
            {previewManifest.products.some(p => p.productId === piece.id) && <p className="outfit-data-note">Schematic thumbnail · use the retailer link for product photography.</p>}
            <h3>{piece.name}</h3>
            <p>{piece.brand} · {piece.color}</p>
            <strong>{outfit.items.find((item) => item.productId === piece.id)?.owned ? "Already owned" : `$${piece.price.toFixed(2)} USD`}</strong>
            <p className="outfit-data-note">{info.sourceLabel} · Estimated price</p>
            {previewManifest.products.find(p => p.productId === piece.id) && <p className="outfit-data-note">Size {previewManifest.products.find(p => p.productId === piece.id)!.size} · Published measurements guide the draft; missing construction dimensions are estimated. Samples and fit unvalidated.</p>}
            {info.href && <a className="studio-retailer" href={info.href} target="_blank" rel="noopener noreferrer">{info.linkLabel} ↗</a>}
            <h4>Affordable alternatives</h4>
            <p className="outfit-data-note">Choose an item to swap only this {piece.category}. New pieces stay within ${budget}.</p>
            {!choices.length && <p className="outfit-data-note">{outfit.lockedCategories?.includes(piece.category) ? "You asked to keep this category." : "No alternatives within this budget. Ask your stylist for more options."}</p>}
            {choices.map((candidate) => <button className="swap-choice" key={candidate.id} disabled={disabled} onClick={() => replaceItem(candidate)}>
              <img src={candidate.image} alt={candidate.name} loading="lazy" />
              <span>{candidate.name}<small>{wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? "Owned" : `$${candidate.price.toFixed(2)} USD`} · Swap in</small></span>
            </button>)}
          </aside>
        )}
      </div>
      </div>
      {!bodyPreview && <p className="outfit-caption">Sample body · physical fit on you requires a reviewed scan and validated garment evidence.</p>}
      {bodyPreview && <p className="outfit-caption">{fittedPreview ? "Selected product sizes on your scan · estimated appearance; physical fit assessed separately" : "Body scan · choose supported product sizes in Try selected clothes on your body"}</p>}
      <p className="swap-notice" role="status">{swapNotice}</p>
      <div className="studio-feedback" aria-label="Give your stylist feedback">
        <button disabled={disabled || previewManifest.status === "blocked"} onClick={() => onFeedback(`I don't like the concept of outfit ${index + 1}, ${outfit.name}. Please regenerate with a different direction.`)}><RefreshCw size={14} />New outfit</button>
      </div>
      {previewManifest.status === "blocked" && <p className="outfit-caption">New outfit generation is paused until all five measured garment models and their combinations pass review. Existing looks remain available as shopping references.</p>}
    </section>
  );
}
