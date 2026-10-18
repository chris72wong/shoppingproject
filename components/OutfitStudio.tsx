"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, RefreshCw, ShoppingBag, X } from "lucide-react";
import { product } from "@/lib/catalog";
import { total } from "@/lib/agent";
import { similarItems } from "@/lib/swaps";
import { getProductInfo } from "@/lib/product-info";
import type { AvatarModelId, Outfit, Product, ScanProfile } from "@/lib/types";
import { previewManifest } from "@/lib/preview-capsule";
import "./outfits.css";
const Avatar = dynamic(() => import("./Avatar"), { ssr: false });

export default function OutfitStudio({ outfits, index, scan, extra, budget, wardrobe, disabled, onSelect, onSwap, onFeedback, onToggleOuter, modelId, onModelChange }: {
  outfits: Outfit[]; index: number; scan: ScanProfile; extra: Product[];
  budget: number; wardrobe: string[]; disabled: boolean;
  modelId: AvatarModelId; onModelChange: (id: AvatarModelId) => void;
  onSelect: (index: number) => void; onSwap: (id: string, replacement: Product) => void;
  onFeedback: (text: string) => void; onToggleOuter?: () => void;
}) {
  const outfit = outfits[index];
  const pieces = outfit.items.map(item => product(item.productId, extra));
  const [selected, setSelected] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [swapNotice, setSwapNotice] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const shopDialog = useRef<HTMLDialogElement>(null);
  const shopButton = useRef<HTMLButtonElement>(null);
  const piece = pieces.find(p => p.id === selected);
  const info = piece ? getProductInfo(piece) : null;
  const cost = total(outfit, extra);
  const choices = piece ? similarItems(outfit, piece, extra, budget, wardrobe).filter(candidate =>
    cost - (outfit.items.find(i => i.productId === piece.id)?.owned ? 0 : piece.price)
      + (wardrobe.includes(candidate.id) || candidate.retailer === "Owned" ? 0 : candidate.price) <= budget
  ).slice(0, 4) : [];
  useEffect(() => {
    if (selected && !pieces.some(p => p.id === selected)) setSelected(null);
    if (inspectionId && !pieces.some(p => p.id === inspectionId)) setInspectionId(null);
  }, [outfit, selected, inspectionId]);
  function navigate(next: number) {
    setSelected(null); setInspectionId(null); setSwapNotice("");
    onSelect((next + outfits.length) % outfits.length);
  }
  function replaceItem(replacement: Product) {
    if (!piece || disabled) return;
    onSwap(piece.id, replacement); setInspectionId(null); setSelected(replacement.id);
    setSwapNotice(`Selected ${replacement.name}. Other pieces are unchanged.`);
  }
  function openAll() {
    const urls = [...new Set(pieces.map(p => getProductInfo(p).href).filter((url): url is string => {
      if (!url) return false;
      try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; }
    }))];
    urls.forEach(url => window.open(url, "_blank", "noopener,noreferrer"));
    setBulkNotice("If your browser blocks extra tabs, use the individual product links below.");
  }
  return <section className="outfit-studio" aria-label="Outfit studio">
    <div className="studio-toolbar">
      <div className="look-title"><span className="outfit-eyebrow">THE PERSONAL STYLE STUDIO</span><h1>{outfit.name}</h1></div>
      <div className="model-switch"><span>Switch model</span><div role="group" aria-label="Switch model">{(["model-1", "model-2"] as const).map((id, i) => <button key={id} aria-pressed={modelId === id} onClick={() => onModelChange(id)}>Model {i + 1}</button>)}</div></div>
    </div>
    <div className="mirra-studio-grid">
      <div className="look-overview">
        <span className="look-number">0{index + 1}<small> / 0{outfits.length}</small></span>
        <p className="look-rationale">{/pattern|dimensions|unvalidated|draft/i.test(outfit.rationale || outfit.description) ? "A considered palette, simple layers, and pieces that work together. Make this look your own." : outfit.rationale || outfit.description}</p>
        <div className="look-tags">{outfit.tags.filter(t => !/draft|capsule/i.test(t)).slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="look-price"><strong>${cost.toFixed(2)}</strong><span>USD · estimated total</span></div>
        <button className="shop-outfit-button" ref={shopButton} onClick={() => { setBulkNotice(""); shopDialog.current?.showModal(); }}><ShoppingBag size={16} />View entire researched outfit<ArrowUpRight size={15} /></button>
      </div>
      <div className="studio-stage">
        <div className="stage-halo" aria-hidden="true" />
        <span className="stage-model-label">{modelId === "model-1" ? "MODEL 1" : "MODEL 2"}</span>
        <button className="studio-arrow studio-previous" disabled={disabled || outfits.length < 2} onClick={() => navigate(index - 1)} aria-label="Previous outfit"><ArrowLeft size={19} /></button>
        <div className="studio-avatar"><Avatar outfit={outfit} profile={scan} extra={extra} modelId={modelId} onSelectItem={setSelected} previewProductIds={inspectionId && pieces.some(p => p.id === inspectionId) ? [inspectionId] : undefined} /></div>
        <button className="studio-arrow studio-next" disabled={disabled || outfits.length < 2} onClick={() => navigate(index + 1)} aria-label="Next outfit"><ArrowRight size={19} /></button>
        <span className="stage-hint">Drag to discover every angle</span>
      </div>
      <div className="studio-details-slot">
        <div className="pieces-heading"><span className="outfit-eyebrow">THE PIECES</span><span>{pieces.length} items</span></div>
        <div className="studio-product-picker" aria-label="Outfit products">{pieces.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(selected === item.id ? null : item.id); setInspectionId(null); }}><img src={item.image} alt="" /><span><strong>{item.name}</strong><small>{item.color} · ${item.price.toFixed(2)}</small></span>{selected === item.id ? <Check size={15} /> : <ArrowUpRight size={15} />}</button>)}</div>
        {piece && info && <aside className="studio-item-card" aria-label="Clothing item details">
          <button className="studio-card-close" aria-label="Close item details" onClick={() => { setSelected(null); setInspectionId(null); }}><X size={16} /></button>
          <span className="outfit-eyebrow">{piece.brand}</span><h3>{piece.name}</h3><p>{piece.color} · ${piece.price.toFixed(2)} USD estimated</p>
          {info.href && <a className="studio-retailer" href={info.href} target="_blank" rel="noopener noreferrer">View researched product <ArrowUpRight size={14} /></a>}
          <div className="avatar-item-controls"><button aria-pressed={inspectionId === piece.id} onClick={() => setInspectionId(inspectionId ? null : piece.id)}>{inspectionId ? "Show full outfit" : "Inspect this piece"}</button></div>
          {choices.length > 0 && <><h4>Try another piece</h4>{choices.map(candidate => <button className="swap-choice" key={candidate.id} disabled={disabled} onClick={() => replaceItem(candidate)}><img src={candidate.image} alt="" /><span>{candidate.name}<small>{candidate.color} · ${candidate.price.toFixed(2)}</small></span><ArrowRight size={14} /></button>)}</>}
          {outfit.lockedCategories?.includes(piece.category) && <p className="outfit-data-note">You asked to keep this piece.</p>}
        </aside>}
        {onToggleOuter && pieces.every(p => previewManifest.products.some(product => product.productId === p.id)) && <button className="layer-toggle" disabled={disabled || outfit.lockedCategories?.includes("outerwear") || outfit.items.some(item => item.owned && product(item.productId, extra).category === "outerwear")} onClick={() => { setInspectionId(null); onToggleOuter(); }}>{pieces.some(p => p.category === "outerwear") ? "− Remove overshirt" : "+ Add blue overshirt"}</button>}
      </div>
    </div>
    <div className="studio-bottom-bar"><div className="look-pagination" aria-label="Select outfit">{outfits.map((o, i) => <button key={`${o.id}-${i}`} disabled={disabled} aria-label={`Show look ${i + 1}`} aria-pressed={i === index} onClick={() => navigate(i)}><span />Look {i + 1}</button>)}</div><button className="new-look-button" disabled={disabled || previewManifest.status === "blocked"} onClick={() => onFeedback(`Create three new casual outfits under $${budget}.`)}><RefreshCw size={13} />New looks</button></div>
    <p className="swap-notice sr-only" role="status">{swapNotice}</p>
    <dialog className="outfit-shop-dialog" ref={shopDialog} onClick={event => { if (event.target === event.currentTarget) shopDialog.current?.close(); }} onClose={() => shopButton.current?.focus()} aria-labelledby="outfit-shop-title"><div className="outfit-shop-content"><button className="shop-close" aria-label="Close outfit products" onClick={() => shopDialog.current?.close()}><X size={22} /></button><span className="outfit-eyebrow">YOUR LOOK, PIECE BY PIECE</span><h2 id="outfit-shop-title">{outfit.name}</h2><p className="shop-price">${cost.toFixed(2)} USD · estimated total</p><div className="shop-product-list">{pieces.map(item => {
      const details = getProductInfo(item);
      return <article key={item.id}><img src={item.image} alt={item.name} /><div><span>{item.brand}</span><h3>{item.name}</h3><p>{item.color} · ${item.price.toFixed(2)} USD estimated</p>{details.href ? <a href={details.href} target="_blank" rel="noopener noreferrer">View researched product <ArrowUpRight size={14} /></a> : <p>Product link unavailable</p>}</div></article>;
    })}</div><button className="shop-open-all" onClick={openAll}>Open all product pages <ArrowUpRight size={16} /></button><p className="shop-note" role="status">{bulkNotice || "Confirm current prices and availability with the retailer."}</p></div></dialog>
  </section>;
}
