"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, Plus, Sparkles, X } from "lucide-react";
import { generate } from "@/lib/agent";
import { respond } from "@/lib/conversation";
import { restore, Store } from "@/lib/storage";
import { ConversationMessage, Outfit } from "@/lib/types";
import { OutfitCard } from "@/components/OutfitCard";
import OutfitDetail from "@/components/OutfitDetail";
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
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    submitting = useRef(false);
  useEffect(() => {
    try {
      setS(restore(localStorage.getItem("form-studio-v1"), initial));
    } catch {
      setNotice("Your saved conversation could not be loaded.");
    }
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
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
  function send(text: string, context = selection) {
    const request = text.trim();
    if (!request || submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setInput("");
    const user: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: request,
    };
    setS((v) => ({ ...v, messages: [...v.messages, user] }));
    timer.current = setTimeout(() => {
      try {
        const hasLooks = s.messages.some((m) => m.outfits?.length);
        const result = respond(request, {
          profile: s.profile,
          outfits: context?.outfits || (hasLooks ? s.outfits : []),
          selected: context?.index ?? -1,
          custom: s.custom,
          wardrobe: s.wardrobe,
          pending,
        });
        const message: ConversationMessage = {
          id: crypto.randomUUID(),
          role: "agent",
          text: result.text,
          ...(result.outfits ? { outfits: snapshot(result.outfits) } : {}),
        };
        setS((v) => ({
          ...v,
          profile: result.profile || v.profile,
          outfits: result.outfits || v.outfits,
          selected: Math.max(0, result.selected ?? v.selected),
          messages: [...v.messages, message],
        }));
        setPending(result.pending || "");
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
      } catch {
        setError(
          "That request could not be completed. Your previous outfits are still here. Try again.",
        );
        setInput(request);
      } finally {
        setBusy(false);
        submitting.current = false;
        composer.current?.focus();
      }
    }, 350);
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
            <div className="stylist-mark">
              <Sparkles size={22} strokeWidth={1.3} />
            </div>
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
                <p className="message-text">{message.text}</p>
                {!!message.outfits?.length && (
                  <div className="chat-outfits" aria-label="Suggested outfits">
                    {message.outfits.map((outfit, index) => (
                      <OutfitCard
                        key={outfit.id + "-" + index}
                        outfit={outfit}
                        index={index}
                        extra={s.custom}
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
            Local styling demo · Illustrated pieces · USD estimates, excluding
            tax & shipping
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
