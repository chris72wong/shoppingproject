"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, Pencil, Plus, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { generate } from "@/lib/agent";
import type { ConversationResponse } from "@/lib/conversation";
import { restore, Store } from "@/lib/storage";
import { ConversationMessage, Outfit, Product } from "@/lib/types";
import { swapItem } from "@/lib/swaps";
import { OutfitCard } from "@/components/OutfitCard";
import OutfitDetail from "@/components/OutfitDetail";
const Avatar = dynamic(() => import("@/components/Avatar"), { ssr: false });
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
    [detail, setDetail] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [weatherCity, setWeatherCity] = useState("");
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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
        body: JSON.stringify({
          message: request,
          weatherCity: weatherCity.trim() || undefined,
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
    setDetail(null);
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
  function swap(oldId: string, replacement: Product) {
    if (!detail) return;
    const current = detail.outfits[detail.index];
    const updated = swapItem(current, oldId, replacement, s.wardrobe.map((i) => i.productId), s.custom);
    if (updated === current) return;
    const replace = (looks: Outfit[]) => looks.map((o) => o.id === current.id && JSON.stringify(o) === JSON.stringify(current) ? snapshot([updated])[0] : o);
    const context = { ...detail, outfits: replace(detail.outfits) };
    setDetail(context);
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
      <main
        className={"conversation " + (started ? "has-messages" : "is-empty")}
        id="main-content"
      >
        {!started ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-avatar">
              <Avatar outfit={s.outfits[0]} profile={s.scan} extra={s.custom} />
            </div>
            <p className="preview-note">Your body preview · illustrative until scan import is connected</p>
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
                {!!message.outfits?.length && (
                  <div className="chat-outfits" aria-label="Suggested outfits">
                    {message.outfits.map((outfit, index) => (
                      <OutfitCard
                        key={outfit.id + "-" + index}
                        outfit={outfit}
                        index={index}
                        extra={s.custom}
                        scan={s.scan}
                        onOpen={() => {
                          const context = { outfits: message.outfits!, index };
                          setDetail(context);
                          setSelection(context);
                        }}
                      />
                    ))}
                  </div>
                )}
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
          <div className="weather-location">
            <label htmlFor="weather-city">Dress for today’s weather</label>
            <input id="weather-city" value={weatherCity} maxLength={100} onChange={(e) => setWeatherCity(e.target.value)} placeholder="City (optional)" disabled={busy} />
          </div>
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
            <div className="chat-outfits">
              {s.saved.map((outfit, index) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  index={index}
                  extra={s.custom}
                  scan={s.scan}
                  onOpen={() => {
                    const context = {
                      outfits: [
                        outfit,
                        ...s.outfits.filter((o) => o.id !== outfit.id),
                      ].slice(0, 3),
                      index: 0,
                    };
                    setSelection(context);
                    setDetail(context);
                  }}
                />
              ))}
            </div>
          </details>
        )}
      </main>
      <footer className="app-footer">
        <span>LESS SEARCHING. MORE YOU.</span>
        <span>Considered looks, made together.</span>
      </footer>
      {detail && (
        <OutfitDetail
          outfit={detail.outfits[detail.index]}
          index={detail.index}
          extra={s.custom}
          scan={s.scan}
          saved={s.saved.some((o) => o.id === detail.outfits[detail.index].id)}
          onSwap={swap}
          budget={s.profile.budget}
          wardrobe={s.wardrobe.map((i) => i.productId)}
          onSave={() => toggleSave(detail.outfits[detail.index])}
          onClose={() => setDetail(null)}
          onRefine={(text) => {
            setSelection(detail);
            setDetail(null);
            setInput(text);
            requestAnimationFrame(() => composer.current?.focus());
          }}
        />
      )}
    </div>
  );
}
