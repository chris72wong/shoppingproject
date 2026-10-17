"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, Pencil, Plus, Sparkles, X } from "lucide-react";
import { generate } from "@/lib/agent";
import type { ConversationResponse } from "@/lib/conversation";
import { restore, Store } from "@/lib/storage";
import { ConversationMessage, Outfit, Product } from "@/lib/types";
import { swapItem } from "@/lib/swaps";
import OutfitStudio from "@/components/OutfitStudio";
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
const suggestions = [
  "Everyday outfits under $250",
  "Something for a dinner out",
  "Back to school under $100",
];
const snapshot = (outfits: Outfit[]) =>
  JSON.parse(JSON.stringify(outfits)) as Outfit[];
export default function App() {
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
  const [editText, setEditText] = useState("");
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
      localStorage.setItem("form-studio-v1", JSON.stringify(s));
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
      if (result.outfits) setViewIndex(Math.max(0, result.selected ?? 0));
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
        setEditText(request);
        setSelection(selection);
        setPending(pending);
      }
      setError(
        cause instanceof Error && cause.name !== "TimeoutError"
          ? cause.message
          : "Gemini took too long to reply. Please try again.",
      );
      setInput(editIndex >= 0 ? "" : request);
    } finally {
      setBusy(false);
      submitting.current = false;
      controller.current = null;
      composer.current?.focus();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    send(input);
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
    composer.current?.focus();
  }
  function toggleSave(outfit: Outfit) {
    setS((v) => ({
      ...v,
      saved: v.saved.some((o) => o.id === outfit.id)
        ? v.saved.filter((o) => o.id !== outfit.id)
        : [...v.saved, snapshot([outfit])[0]],
    }));
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
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="FORM home">
          FORM<span>®</span>
        </a>
        <span className="header-caption">
          A little direction. A style of your own.
        </span>
        <button
          className="new-chat"
          onClick={newConversation}
          disabled={busy || !ready}
          aria-label="Start a new conversation"
        >
          <Plus size={16} />
          <span>New chat</span>
        </button>
      </header>
      <div className="studio-workspace">
      <OutfitStudio outfits={visible.outfits} index={visible.index} scan={s.scan} extra={s.custom}
        budget={s.profile.budget} wardrobe={s.wardrobe.map((item) => item.productId)}
        saved={s.saved.some((outfit) => outfit.id === visible.outfits[visible.index].id)} disabled={busy || !ready}
        onSelect={(index) => { setViewIndex(index); setSelection({ outfits: visible.outfits, index }); }}
        onSwap={swap} onSave={() => toggleSave(visible.outfits[visible.index])}
        onFeedback={(text) => send(text, visible)} />
      <main
        className={"conversation " + (started ? "has-messages" : "is-empty")}
        id="main-content"
      >
        {!started ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <p className="eyebrow">YOUR PERSONAL STYLE, FIGURED OUT</p>
            <h1 id="welcome-title">
              Good style starts
              <br />
              with a <em>conversation.</em>
            </h1>
            <p className="welcome-description">
              Tell me what you’re dressing for.
              <br />
              We’ll find your look, one message at a time.
            </p>
            <div className="suggestions" aria-label="Ideas to get started">
              {suggestions.map((text) => (
                <button
                  key={text}
                  onClick={() => send(text)}
                  disabled={!ready || busy}
                >
                  {text}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </section>
        ) : (
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
                {editing === message.id ? (
                  <form className="prompt-edit" onSubmit={(event) => { event.preventDefault(); send(editText, null, message.id); }}>
                    <label className="sr-only" htmlFor={"edit-" + message.id}>Edit prompt</label>
                    <textarea id={"edit-" + message.id} value={editText} maxLength={2000} rows={3} autoFocus onChange={(e) => setEditText(e.target.value)} />
                    <p>Saving regenerates the conversation from this prompt.</p>
                    <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" disabled={busy || !editText.trim()}>Save & send</button>
                  </form>
                ) : <p className="message-text">{message.text}</p>}
                {message.role === "user" && editing !== message.id && (
                  <button className="edit-prompt-button" disabled={busy} aria-label={"Edit prompt: " + message.text} onClick={() => { setEditing(message.id); setEditText(message.text); }}><Pencil size={12} /> Edit</button>
                )}
                {message.weather && <p className="weather-summary">{message.weather.location} · {message.weather.temperature}°C, feels like {message.weather.feelsLike}°C · Today {message.weather.low}–{message.weather.high}°C · Rain {message.weather.rainChance}%<br /><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather by Open-Meteo</a> · Local observation {message.weather.observedAt.replace("T", " ")}</p>}
                {!!message.outfits?.length && <button className="revisit-looks" disabled={busy} onClick={() => { setSelection({ outfits: message.outfits!, index: 0 }); setViewIndex(0); }}>View these {message.outfits.length} looks ↗</button>}
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
        )}
        <div className="composer-area">
          <div className="weather-location"><span role="status">{locationStatus}</span><button type="button" disabled={busy || locationStatus.startsWith("Requesting")} onClick={locate}>Refresh location</button></div>
          {selection && (
            <div className="selection-context">
              <Check size={13} /> Refining outfit {selection.index + 1}:{" "}
              {selection.outfits[selection.index].name}
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
              rows={2}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                started
                  ? "What would you like to change?"
                  : "An occasion, a mood, a budget. Start anywhere…"
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div className="composer-bottom">
              <span>
                <Sparkles size={12} /> Your style. Your pace.
              </span>
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
          <p className="disclosure">
            Chats and style preferences are sent to Google Gemini · Illustrated
            pieces · USD estimates, excluding tax & shipping
          </p>
          {notice && (
            <p className="storage-notice" role="status">
              {notice}
            </p>
          )}
        </div>
        {s.saved.length > 0 && (
          <details className="saved-looks">
            <summary>Saved looks ({s.saved.length})</summary>
            <div className="saved-look-list">{s.saved.map((outfit) => <button key={outfit.id} disabled={busy} onClick={() => { setSelection({ outfits: [outfit, ...s.outfits.filter((o) => o.id !== outfit.id)].slice(0, 3), index: 0 }); setViewIndex(0); }}>{outfit.name} ↗</button>)}</div>
          </details>
        )}
      </main>
      </div>
      <footer className="app-footer">
        <span>LESS SEARCHING. MORE YOU.</span>
        <span>Considered looks, made together.</span>
      </footer>
    </div>
  );
}
