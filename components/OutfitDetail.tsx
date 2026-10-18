"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, Bookmark, Check, MessageCircle, X } from "lucide-react";
import { product } from "@/lib/catalog";
import { getProductInfo } from "@/lib/product-info";
import { similarItems } from "@/lib/swaps";
import { Outfit, Product, ScanProfile } from "@/lib/types";
import "./outfits.css";

const Avatar = dynamic(() => import("./Avatar"), {
  ssr: false,
  loading: () => (
    <p className="outfit-preview-loading">Loading illustrative preview…</p>
  ),
});

export default function OutfitDetail({
  outfit,
  index,
  extra = [],
  scan,
  onClose,
  onRefine,
  onSave,
  saved,
  onSwap,
  budget,
  wardrobe,
}: {
  outfit: Outfit;
  index: number;
  extra?: Product[];
  scan: ScanProfile;
  onClose: () => void;
  onRefine: (text: string) => void;
  onSave: () => void;
  saved: boolean;
  onSwap: (productId: string, replacement: Product) => void;
  budget: number;
  wardrobe: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pieces = outfit.items.map((item) => product(item.productId, extra));
  const selectedIndex = pieces.findIndex((p) => p.id === selected);
  const piece = pieces[selectedIndex];
  const info = piece ? getProductInfo(piece) : null;
  const total = outfit.items.reduce(
    (sum, item, i) => sum + (item.owned ? 0 : pieces[i].price),
    0,
  );
  const locked = piece && outfit.lockedCategories?.includes(piece.category);
  const choices = piece ? similarItems(outfit, piece, extra, budget, wardrobe) : [];
  function inspect(id: string | null) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (swapping) return;
    if (id) setSelected(id);
    else hoverTimer.current = setTimeout(() => setSelected(null), 250);
  }
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const node = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="outfit-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input, textarea, select, [tabindex="0"]',
          ) ?? [],
        ).filter((node) => node.getClientRects().length > 0);
        const first = targets[0],
          last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="outfit-dialog-inner">
        <header className="outfit-detail-header">
          <div>
            <span className="outfit-eyebrow">THE EDIT / 0{index + 1}</span>
            <h2 id={titleId}>{outfit.name}</h2>
            <p>{outfit.description}</p>
          </div>
          <button
            type="button"
            className="outfit-icon-button"
            onClick={onClose}
            aria-label="Close outfit details"
            autoFocus
          >
            <X size={21} />
          </button>
        </header>
        <div className="outfit-detail-grid">
          <div className="outfit-detail-visual">
            <div className="outfit-model outfit-model-main" onMouseLeave={() => inspect(null)}>
              <Avatar outfit={outfit} profile={scan} extra={extra} onItem={inspect} />
            </div>
            <p className="outfit-caption">Drag to rotate. Hover a garment to see its details.</p>
            <div className="avatar-item-controls" aria-label="Explore worn pieces">
              {pieces.map((item) => (
                <button type="button" key={item.id}
                  onMouseEnter={() => inspect(item.id)} onMouseLeave={() => inspect(null)}
                  onFocus={() => inspect(item.id)} onBlur={(event) => {
                    if (!event.relatedTarget || !(event.relatedTarget as HTMLElement).closest(".outfit-product")) inspect(null);
                  }}
                  onClick={() => { setSelected(item.id); setSwapping(!outfit.lockedCategories?.includes(item.category)); }}>
                  {item.category}
                </button>
              ))}
            </div>
            <p className="outfit-data-note">Microsoft Rocketbox sample human with original clothing. Shopping garments are illustrated separately; body matching and garment fitting are not connected.</p>
          </div>
          <div className="outfit-detail-copy">
            <section className="outfit-reason">
              <span className="outfit-eyebrow">THE STYLIST’S NOTE</span>
              <h3>Why this works</h3>
              <p>{outfit.rationale || outfit.description}</p>
              <div className="outfit-tags">
                {outfit.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </section>
            {piece && info && (
              <section
                className="outfit-product"
                aria-label="Selected product details"
                onMouseEnter={() => inspect(piece.id)}
                onMouseLeave={() => inspect(null)}
              >
                <span className="outfit-eyebrow">{piece.brand}</span>
                <h3>{piece.name}</h3>
                <p className="outfit-product-meta">
                  {piece.color} · ${piece.price.toFixed(2)} USD{" "}
                  {outfit.items[selectedIndex].owned && "· Already owned"}
                </p>
                <span className="outfit-source">{info.sourceLabel}</span>
                <p className="outfit-data-note">
                  Catalog price estimate. Confirm current price, sizes, and
                  availability with the retailer.
                </p>
                {info.href ? (
                  <a
                    className="outfit-retailer-link"
                    href={info.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {info.linkLabel}
                    <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <p className="outfit-data-note">
                    No verified product link is available for this piece.
                  </p>
                )}
                <button type="button" className="outfit-secondary" disabled={locked}
                  onClick={() => setSwapping(!swapping)} aria-expanded={swapping}>
                  {locked ? "This category is kept" : swapping ? "Close similar items" : "Swap for a similar item"}
                </button>
                {swapping && !locked && (
                  <div className="swap-choices" aria-label="Similar items">
                    <p className="outfit-data-note">Same category, ranked by style, color and budget. Preview updates immediately.</p>
                    {choices.length === 0 && <p>No alternatives in the catalog.</p>}
                    {choices.map((candidate) => (
                      <button type="button" className="swap-choice" key={candidate.id}
                        onClick={() => { onSwap(piece.id, candidate); setSelected(candidate.id); }}>
                        <img src={candidate.image} alt={candidate.name} loading="lazy" />
                        <span>{candidate.name}<small>{candidate.color} · {wardrobe.includes(candidate.id) ? "Owned" : "$" + candidate.price + " USD"}</small></span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="outfit-fit">
                  <h4>Fit & fabric</h4>
                  <p>{info.fitSummary}</p>
                  <dl>
                    <div>
                      <dt>Materials</dt>
                      <dd>{info.materials || "Not verified for this item"}</dd>
                    </div>
                    <div>
                      <dt>Customer fit reviews</dt>
                      <dd>
                        {info.reviewsSummary || "No verified reviews available"}
                      </dd>
                    </div>
                  </dl>
                  {info.sizeGuideUrl ? (
                    <a
                      href={info.sizeGuideUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View brand size guide <ArrowUpRight size={13} />
                    </a>
                  ) : (
                    <p className="outfit-data-note">
                      An item-specific size guide is not available. Check
                      garment measurements before choosing a size.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
        <footer className="outfit-detail-footer">
          <div>
            <strong>${total.toFixed(2)} USD</strong>
            <span>Estimated total for new pieces</span>
          </div>
          <div className="outfit-detail-actions">
            <button
              type="button"
              className="outfit-secondary"
              onClick={onSave}
              aria-pressed={saved}
            >
              {saved ? <Check size={16} /> : <Bookmark size={16} />}
              {saved ? "Saved" : "Save outfit"}
            </button>
            <button
              type="button"
              className="outfit-primary"
              onClick={() =>
                onRefine(`For outfit ${index + 1}, ${outfit.name}, `)
              }
            >
              <MessageCircle size={16} />
              Refine in chat
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
