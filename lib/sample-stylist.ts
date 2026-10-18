import type { ChatRequest } from "./chat-schema";
import type { ConversationResponse } from "./conversation";
import { capsuleLooks, capsuleProducts, nameCapsuleLook } from "./capsule-products";
import { assertCapsuleOutfits } from "./preview-capsule";

export const samplePrompts = ["Style a casual outfit under $60", "Keep the pants, switch to the black tee", "Add the blue overshirt"];

/** Explicit local examples for development and rehearsal. No provider calls. */
export function sampleStylist(message: string, state: ChatRequest["state"]): ConversationResponse {
  const text = message.toLowerCase();
  const named = /(?:outfit|look)\s*(one|two|three|1|2|3)/.exec(text)?.[1];
  const selected = named ? ({ one: 0, two: 1, three: 2, "1": 0, "2": 1, "3": 2 }[named] ?? 0) : Math.max(0, state.selected);
  const budget = /(?:under|budget|less than)\s*\$?(\d+)/.exec(text)?.[1];
  const profile = { ...state.profile, ...(budget ? { budget: Number(budget) } : {}), weights: {}, inspiration: [] };
  const base = { profile, selected, pending: "" };
  if (/\b(dress|skirt|suit|heels|shoes|red|pink|purple)\b/.test(text))
    return { ...base, text: "Sample mode uses two tees, two chinos and a blue overshirt. Try a sample prompt, or switch to Live AI for a conversation." };
  if (/\b(select|show|view)\b/.test(text) && named && !/\b(change|switch|swap|add|remove)\b/.test(text))
    return { ...base, text: `Showing look ${selected + 1}.` };
  const refining = /\b(keep|switch|swap|change|add|remove|replace)\b/.test(text);
  if (!refining || state.outfits.length !== 3) {
    const outfits = capsuleLooks();
    const over = outfits.some(o => o.items.reduce((sum, i) => sum + capsuleProducts.find(p => p.id === i.productId)!.price, 0) > profile.budget);
    return { ...base, selected: 0, outfits, text: `Three sample looks, ready to explore.${over ? " Some looks exceed your budget; the displayed totals show their estimated prices." : " Try changing a tee or adding the overshirt."}` };
  }
  const outfits = structuredClone(state.outfits);
  const current = outfits[selected];
  try { assertCapsuleOutfits(outfits); }
  catch { return { ...base, text: "Start with a casual sample outfit to use these examples." }; }
  const locked = new Set(current.lockedCategories ?? []);
  if (/keep (?:the )?(pants|trousers|bottom)/.test(text)) locked.add("bottom");
  if (/keep (?:the )?(tee|shirt|top)/.test(text)) locked.add("top");
  let changed = false;
  let blocked = false;
  current.items = current.items.map(item => {
    const p = capsuleProducts.find(p => p.id === item.productId)!;
    let id = item.productId;
    if (p.category === "top" && /\b(switch|swap|change|replace)\b[^,.]{0,50}\b(tee|top|t-shirt)\b/.test(text))
      id = /black/.test(text) ? "uq-493232-black" : /white/.test(text) ? "uq-489929-white" : p.id === "uq-489929-white" ? "uq-493232-black" : "uq-489929-white";
    if (p.category === "bottom" && /\b(switch|swap|change|replace)\b[^,.]{0,50}\b(pants|trousers|chinos)\b/.test(text))
      id = /olive/.test(text) ? "uq-482880-olive" : "uq-482880-navy";
    if (id !== p.id && (locked.has(p.category) || item.owned)) { blocked = true; return item; }
    changed ||= id !== p.id;
    return { ...item, productId: id };
  });
  if (/overshirt|layer/.test(text)) {
    const has = current.items.some(i => i.productId === "uq-482452-blue");
    if (locked.has("outerwear")) blocked = true;
    else if (/remove|without|take off/.test(text) && has) {
      if (current.items.find(i => i.productId === "uq-482452-blue")?.owned) blocked = true;
      else { current.items = current.items.filter(i => i.productId !== "uq-482452-blue"); changed = true; }
    } else if (!has) { current.items.push({ productId: "uq-482452-blue", owned: false }); changed = true; }
  }
  current.lockedCategories = [...locked];
  current.rationale = "A simple palette with balanced layers. Select each piece to explore its researched product.";
  outfits[selected] = nameCapsuleLook(current);
  assertCapsuleOutfits(outfits);
  const sum = current.items.reduce((n, i) => n + (i.owned ? 0 : capsuleProducts.find(p => p.id === i.productId)!.price), 0);
  return { ...base, outfits, text: `${changed ? `Updated look ${selected + 1}; your other looks are unchanged.` : blocked ? "Kept your protected pieces unchanged." : "Try switching to the black tee or adding the blue overshirt."}${sum > profile.budget ? " This look exceeds your budget; see its estimated total." : ""}` };
}
