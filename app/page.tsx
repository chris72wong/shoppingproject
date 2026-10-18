"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, History, Pencil, Plus, Sparkles, X } from "lucide-react";
import { generate } from "@/lib/agent";
import type { ConversationResponse } from "@/lib/conversation";
import { restore, serializeStore, Store } from "@/lib/storage";
import { ConversationMessage, Outfit, Product } from "@/lib/types";
import { swapItem } from "@/lib/swaps";
import OutfitStudio from "@/components/OutfitStudio";
import BodyPanel from "@/components/BodyPanel";
import type { BodyPreview } from "@/components/BodyMesh";
const profile: Store["profile"] = {
  styles: ["minimalist", "casual elevated"],
  colors: ["Stone", "Olive", "Black"],
  avoid: "",
  fit: "Regular",
  budget: 250,
  occasion: "Everyday",
  weights: {},
  inspiration: [],
};
const initial: Store = {
  profile,
  scan: {
    complete: false,
    height: 175,
    chest: 96,
    waist: 80,
    hip: 98,
    shoulder: 44,
    fit: "Regular",
  },
  outfits: generate("Everyday outfits under $250", profile),
  saved: [],
  wardrobe: ["u-tee", "jeans", "stan"].map((productId) => ({
    id: "owned-" + productId,
    productId,
  })),
  custom: [],
  messages: [],
  selected: 0,
};
type Selection = { outfits: Outfit[]; index: number };
const snapshot = (outfits: Outfit[]) =>
  JSON.parse(JSON.stringify(outfits)) as Outfit[];
export default function App() {
  const [bodyPreview, setBodyPreview] = useState<BodyPreview>();
  const [s, setS] = useState<Store>(initial),
    [ready, setReady] = useState(false),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null),
    [viewIndex, setViewIndex] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function openHistory() { historyDialog.current?.showModal(); }
  function closeHistory() { historyDialog.current?.close(); }
  function editPrompt(message: ConversationMessage) {
    setEditing(message.id);
    setInput(message.text);
    closeHistory();
    requestAnimationFrame(() => composer.current?.focus());
  }
  const [locationStatus, setLocationStatus] = useState("Requesting location for local weather…");
  const locationRequest = useRef<Promise<{ latitude: number; longitude: number } | undefined> | null>(null);
  const locationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function locate() {
    setLocationStatus("Requesting location for local weather…");
    locationRequest.current = new Promise((resolve) => {
      if (!navigator.geolocation || !window.isSecureContext) {
        setLocationStatus("Location unavailable. Styling without local weather.");
        resolve(undefined); return;
      }
      // Permission prompts can remain open beyond geolocation's own timeout.
      locationTimer.current = setTimeout(() => {
        setLocationStatus("Location not available yet. Styling without local weather.");
        resolve(undefined);
      }, 12000);
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (locationTimer.current) clearTimeout(locationTimer.current);
        const location = { latitude: Math.round(coords.latitude * 100) / 100, longitude: Math.round(coords.longitude * 100) / 100 };
        locationRequest.current = Promise.resolve(location);
        setLocationStatus("Location connected · Local weather included in your requests");
        resolve(location);
      }, (cause) => {
        if (locationTimer.current) clearTimeout(locationTimer.current);
        setLocationStatus(cause.code === 1 ? "Location permission denied. Styling without local weather." : "Couldn’t find your location. Styling without local weather.");
        resolve(undefined);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
  }
  useEffect(() => {
    if (!locationRequest.current) locate();
  }, []);
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    controller = useRef<AbortController | null>(null),
    submitting = useRef(false);
  useEffect(() => {
    try {
      setS(restore(localStorage.getItem("form-studio-v1"), initial));
    } catch {
      setNotice("Your saved conversation could not be loaded.");
    }
    setReady(true);
    return () => {
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("form-studio-v1", serializeStore(s));
    } catch {
      setNotice(
        "Storage is unavailable. Your conversation will last for this session.",
      );
    }
  }, [s, ready]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "end",
    });
  }, [s.messages.length, busy]);
  async function send(text: string, context = selection, editId?: string) {
    const request = text.trim();
    if (!request || submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setInput("");
    setEditing(null);
    const originalMessages = s.messages;
    const editIndex = editId ? s.messages.findIndex((m) => m.id === editId && m.role === "user") : -1;
    const history = editIndex >= 0 ? s.messages.slice(0, editIndex) : s.messages;
    const requestProfile = editIndex >= 0 ? history.findLast((m) => m.profile)?.profile ?? initial.profile : s.profile;
    if (editIndex >= 0) {
      const prior = history.findLast((m) => m.outfits?.length)?.outfits;
      context = prior ? { outfits: prior, index: -1 } : null;
      setSelection(null);
      setPending("");
      setEditing(null);
    }
    const user: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: request,
    };
    setS((v) => ({ ...v, messages: [...history, user] }));
    const abort = new AbortController();
    controller.current = abort;
    try {
      const hasLooks = history.some((m) => m.outfits?.length);
      const location = await locationRequest.current;
      if (abort.signal.aborted) return;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
        body: JSON.stringify({
          bodyScanId: bodyPreview?.scanId,
          message: request,
          location,
          history: history.slice(-24).map(({ role, text }) => ({
            role, text: text.slice(0, 2000),
          })),
          state: {
            profile: {
              styles: requestProfile.styles, colors: requestProfile.colors, avoid: requestProfile.avoid,
              fit: requestProfile.fit, budget: requestProfile.budget, occasion: requestProfile.occasion,
            },
            outfits: context?.outfits || (hasLooks ? s.outfits : []),
            selected: context?.index ?? -1,
            custom: s.custom.map(({ id, name, brand, category, tags, color, hex, price, retailer }) =>
              ({ id, name, brand, category, tags, color, hex, price, retailer })),
            wardrobe: s.wardrobe,
            pending: editIndex >= 0 ? "" : pending,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "That request could not be completed. Please try again.");
      const result = payload as ConversationResponse;
      const message: ConversationMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        text: result.text,
        weather: result.weather,
        profile: result.profile ?? requestProfile,
        ...(result.outfits ? { outfits: snapshot(result.outfits) } : {}),
      };
      setS((v) => ({
        ...v,
        profile: result.profile
          ? { ...v.profile, ...result.profile, weights: v.profile.weights, inspiration: v.profile.inspiration }
          : requestProfile,
        outfits: result.outfits || context?.outfits || (editIndex >= 0 ? initial.outfits : v.outfits),
        selected: Math.max(0, result.selected ?? v.selected),
        messages: [...v.messages, message],
      }));
      setPending(result.pending || "");
      if (result.weatherError) setNotice("Weather could not be checked: " + result.weatherError);
      else setNotice("");
      if (result.outfits) setViewIndex(Math.max(0, result.selected ?? context?.index ?? 0));
      if (result.outfits)
        setSelection(
          result.selected !== undefined && result.selected >= 0
            ? { outfits: result.outfits, index: result.selected }
            : null,
        );
      else if (result.selected !== undefined && result.selected >= 0)
        setSelection({
          outfits: context?.outfits || s.outfits,
          index: result.selected,
        });
      else if (result.selected === -1) setSelection(null);
    } catch (cause) {
      if (abort.signal.aborted) return;
      // Remove this failed turn so retrying does not duplicate it in the transcript.
      setS((v) => ({ ...v, messages: originalMessages }));
      if (editIndex >= 0) {
        setEditing(editId!);

        setSelection(selection);
        setPending(pending);
      }
      setError(
        cause instanceof Error && cause.name !== "TimeoutError"
          ? cause.message
          : "Gemini took too long to reply. Please try again.",
      );
      setInput(request);
    } finally {
      setBusy(false);
      submitting.current = false;
      controller.current = null;
      composer.current?.focus();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    send(input, selection ?? visible, editing ?? undefined);
  }
  function newConversation() {
    if (submitting.current) return;
    setS((v) => ({ ...v, messages: [] }));
    setSelection(null);
    setViewIndex(0);
    setPending("");
    setError("");
    setInput("");
    setEditing(null);
    closeHistory();
    composer.current?.focus();
  }
  const visible = selection ?? { outfits: s.outfits, index: Math.min(viewIndex, s.outfits.length - 1) };
  function swap(oldId: string, replacement: Product) {
    const current = visible.outfits[visible.index];
    const updated = swapItem(current, oldId, replacement, s.wardrobe.map((i) => i.productId), s.custom);
    if (updated === current) return;
    const replace = (looks: Outfit[]) => looks.map((o) => o.id === current.id && JSON.stringify(o) === JSON.stringify(current) ? snapshot([updated])[0] : o);
    const context = { ...visible, outfits: replace(visible.outfits) };
    setSelection(context);
    setS((v) => ({ ...v, outfits: replace(v.outfits), saved: replace(v.saved), messages: v.messages.map((m) => m.outfits ? { ...m, outfits: replace(m.outfits) } : m) }));
  }
  const started = s.messages.length > 0;
  return (
    <div className="chat-app">
      <BodyPanel onPreview={setBodyPreview} />
      <div className="studio-workspace">
      <OutfitStudio outfits={visible.outfits} index={visible.index} scan={s.scan} extra={s.custom}
        bodyPreview={bodyPreview}
        budget={s.profile.budget} wardrobe={s.wardrobe.map((item) => item.productId)}
        disabled={busy || !ready}
        onSelect={(index) => { setViewIndex(index); setSelection({ outfits: visible.outfits, index }); }}
        onSwap={swap}
        onFeedback={(text) => send(text, visible)} />
      <main
        className={"conversation " + (started ? "has-messages" : "is-empty")}
        id="main-content"
      >
        <dialog ref={historyDialog} id="prompt-history" className="history-dialog" aria-labelledby="history-title"
          onClick={(event) => { if (event.target === event.currentTarget) closeHistory(); }}
          onClose={() => historyButton.current?.focus()}>
          <div className="history-panel">
            <button className="history-new-chat" onClick={newConversation} disabled={busy || !ready}><Plus size={14} /> New chat</button>
            <header className="history-heading">
              <div><p className="eyebrow">YOUR STYLE JOURNEY</p><h2 id="history-title">Prompt history</h2></div>
              <button type="button" aria-label="Close prompt history" onClick={closeHistory}><X size={20} /></button>
            </header>
            <p className="history-intro">Revisit a look, or edit a prompt in the main box to take it in a new direction.</p>
            <div className="weather-location"><span role="status">{locationStatus}</span><button type="button" disabled={busy || locationStatus.startsWith("Requesting")} onClick={locate}>Refresh location</button></div>
            {!started && <p className="history-empty">Your prompts will appear here once you start a conversation.</p>}
          <section
            className="messages"
            aria-label="Conversation with your stylist"
          >
            {s.messages.map((message) => (
              <article
                key={message.id}
                className={"message message-" + message.role}
              >
                {message.role === "agent" && (
                  <div className="message-author">
                    <Sparkles size={14} /> FORM STYLIST
                  </div>
                )}
                <p className="message-text">{message.text}</p>
                {message.role === "user" && (
                  <button className="edit-prompt-button" disabled={busy} aria-label={"Edit prompt: " + message.text} onClick={() => editPrompt(message)}><Pencil size={12} /> Edit in prompt box</button>
                )}
                {message.weather && <p className="weather-summary">{message.weather.location} · {message.weather.temperature}°C, feels like {message.weather.feelsLike}°C · Today {message.weather.low}–{message.weather.high}°C · Rain {message.weather.rainChance}%<br /><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather by Open-Meteo</a> · Local observation {message.weather.observedAt.replace("T", " ")}</p>}
                {!!message.outfits?.length && <button className="revisit-looks" disabled={busy} onClick={() => { setSelection({ outfits: message.outfits!, index: 0 }); setViewIndex(0); closeHistory(); }}>View these {message.outfits.length} looks ↗</button>}
              </article>
            ))}
            {busy && (
              <div className="thinking" role="status">
                <Sparkles size={14} />
                <span>Putting it together</span>
                <span className="thinking-dots">···</span>
              </div>
            )}
            <div ref={bottom} />
          </section>
            <button className="history-return" type="button" onClick={() => { closeHistory(); requestAnimationFrame(() => composer.current?.focus()); }}>Back to your look</button>
          </div>
        </dialog>
        <div className="composer-area"
          onTouchCancel={() => { swipeStart.current = null; }}
          onTouchStart={(event) => { const touch = event.touches[0]; swipeStart.current = { x: touch.clientX, y: touch.clientY }; }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            const touch = event.changedTouches[0];
            if (start && touch.clientY - start.y > 55 && Math.abs(touch.clientX - start.x) < 45) openHistory();
          }}>
          {busy && <div className="composer-status" role="status"><Sparkles size={13} /> Styling…</div>}
          {editing && <div className="editing-context"><Pencil size={12} /><span>Editing a past prompt · Sending replaces the conversation from here.</span><button type="button" disabled={busy} onClick={() => { setEditing(null); setInput(""); }}>Cancel</button></div>}
          {selection && (
            <div className="selection-context">
              <Check size={13} /> Look {selection.index + 1}
              <button
                aria-label="Clear selected outfit"
                onClick={() => setSelection(null)}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="style-prompt">
              Message your stylist
            </label>
            <textarea
              id="style-prompt"
              ref={composer}
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                started
                  ? "What would you like to change?"
                  : "Style a look…"
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send(input, selection ?? visible, editing ?? undefined);
                }
              }}
            />
            <div className="composer-bottom">
              <button
                type="submit"
                className="send-button"
                aria-label="Send message"
                disabled={!ready || !input.trim() || busy}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </form>
          <button ref={historyButton} type="button" className="history-toggle" aria-haspopup="dialog" aria-controls="prompt-history" onClick={openHistory}>
            <span className="history-handle" aria-hidden="true" />
            <span><History size={13} /> Prompt history{started ? ` · ${s.messages.filter((message) => message.role === "user").length}` : ""}<ChevronDown size={13} /></span>
          </button>
          {notice && (
            <p className="storage-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
