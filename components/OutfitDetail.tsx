"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, Bookmark, Check, MessageCircle, X } from "lucide-react";
import { product } from "@/lib/catalog";
import { getProductInfo } from "@/lib/product-info";
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
}: {
  outfit: Outfit;
  index: number;
  extra?: Product[];
  scan: ScanProfile;
  onClose: () => void;
  onRefine: (text: string) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const [selected, setSelected] = useState(0);
  const [showModel, setShowModel] = useState(false);
  const pieces = outfit.items.map((item) => product(item.productId, extra));
  const selectedIndex = Math.min(selected, Math.max(0, pieces.length - 1));
  const piece = pieces[selectedIndex];
  const info = piece ? getProductInfo(piece) : null;
  const total = outfit.items.reduce(
    (sum, item, i) => sum + (item.owned ? 0 : pieces[i].price),
    0,
  );

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
            <div
              className="outfit-collage outfit-collage-large"
              aria-label="Select an item to view its details"
            >
              {pieces.map((item, i) => (
                <button
                  type="button"
                  key={`${item.id}-${i}`}
                  className={`outfit-piece outfit-garment-${item.category}${selectedIndex === i ? " outfit-piece-selected" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                  aria-pressed={selectedIndex === i}
                  aria-label={`View ${item.name}`}
                >
                  <img src={item.image} alt={item.name} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <p className="outfit-caption">
              Hover, tap, or focus a piece to explore it.
            </p>
            <button
              type="button"
              className="outfit-text-button"
              aria-expanded={showModel}
              onClick={() => setShowModel(!showModel)}
            >
              {showModel ? "Hide" : "Show"} illustrative 3D preview
            </button>
            {showModel && (
              <div className="outfit-model-section">
                <p>
                  Illustration only. This mannequin shows colors and
                  proportions; it does not simulate garments, LiDAR scanning, or
                  predict fit on your body.
                </p>
                <div className="outfit-model">
                  <Avatar outfit={outfit} profile={scan} extra={extra} />
                </div>
              </div>
            )}
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
