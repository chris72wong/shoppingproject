"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Sparkles,
  ScanLine,
  Compass,
  Shirt,
  Heart,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  RotateCcw,
  ZoomIn,
  Minus,
  ExternalLink,
  RefreshCw,
  Menu,
  Send,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { catalog, product } from "@/lib/catalog";
import {
  generate,
  total,
  budgetFrom,
  alternatives,
  replacementCategory,
} from "@/lib/agent";
import {
  Category,
  Product,
  Outfit,
  UserStyleProfile,
  ScanProfile,
  ConversationMessage,
  WardrobeItem,
} from "@/lib/types";
import { FlatAvatar } from "@/components/FlatAvatar";
import { restore, Store } from "@/lib/storage";
const Avatar = dynamic(() => import("@/components/Avatar"), {
  ssr: false,
  loading: () => (
    <div className="avatar-loading">Opening your fitting studio…</div>
  ),
});
type Page =
  | "Discover"
  | "Virtual Studio"
  | "My Wardrobe"
  | "Saved Outfits"
  | "Style Profile";
const seedProfile: UserStyleProfile = {
  styles: ["minimalist", "casual elevated"],
  colors: ["Stone", "Olive", "Black"],
  avoid: "",
  fit: "Regular",
  budget: 250,
  occasion: "Everyday",
  weights: {},
  inspiration: [
    {
      id: "sample-1",
      image: "/garments/overshirt.svg",
      tag: "casual elevated",
    },
    { id: "sample-2", image: "/garments/trousers.svg", tag: "minimalist" },
  ],
};
const seedScan: ScanProfile = {
  complete: false,
  height: 175,
  chest: 96,
  waist: 80,
  hip: 98,
  shoulder: 44,
  fit: "Regular",
};
const seedOutfits = generate("Everyday outfits under $250", seedProfile);
const initial: Store = {
  profile: seedProfile,
  scan: seedScan,
  outfits: seedOutfits,
  saved: [],
  wardrobe: ["u-tee", "jeans", "stan"].map((id) => ({
    id: "owned-" + id,
    productId: id,
  })),
  custom: [],
  messages: [],
  selected: 0,
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const fashion =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85";
export default function App() {
  const [s, setS] = useState<Store>(initial),
    [ready, setReady] = useState(false),
    [page, setPage] = useState<Page>("Discover"),
    [started, setStarted] = useState(false),
    [input, setInput] = useState(""),
    [typing, setTyping] = useState(false),
    [toast, setToast] = useState(""),
    [replacement, setReplacement] = useState<Category | null>(null),
    [scanProgress, setScanProgress] = useState<number | null>(null),
    [angle, setAngle] = useState(0),
    [zoom, setZoom] = useState(1),
    [adding, setAdding] = useState(false),
    [menu, setMenu] = useState(false),
    [imageFailed, setImageFailed] = useState(false),
    [feedback, setFeedback] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    category: "top" as Category,
    color: "Stone",
    brand: "",
    price: "0",
    image: "",
  });
  const chatEnd = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      setS(restore(localStorage.getItem("form-studio-v1"), initial));
    } catch {
      setToast(
        "Your saved session could not be loaded. A fresh demo is ready.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("form-studio-v1", JSON.stringify(s));
      } catch {
        setToast(
          "Storage is full or unavailable. Changes will last for this session.",
        );
      }
  }, [s, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!replacement && !adding) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>("button,input,select,[href]") ||
          [],
      ).filter(
        (e) => !e.hasAttribute("disabled") && e.getClientRects().length > 0,
      );
    controls()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReplacement(null);
        setAdding(false);
      }
      if (e.key === "Tab") {
        const list = controls();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [replacement, adding]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [s.messages, typing]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (scanProgress === null || scanProgress >= 100) return;
    const id = setInterval(
      () => setScanProgress((v) => (v === null ? null : Math.min(100, v + 2))),
      100,
    );
    return () => clearInterval(id);
  }, [scanProgress === null, scanProgress === 100]);
  useEffect(() => {
    if (scanProgress === 100) {
      setS((v) => ({ ...v, scan: { ...v.scan, complete: true } }));
      setToast("Your digital twin is ready. Demo measurements are adjustable.");
    }
  }, [scanProgress]);
  const current = s.outfits[s.selected] || s.outfits[0];
  function nav(p: Page) {
    setPage(p);
    setMenu(false);
    setReplacement(null);
  }
  function notify(t: string) {
    setToast(t);
  }
  function save(o: Outfit) {
    setS((v) => ({
      ...v,
      saved: v.saved.some((x) => x.id === o.id)
        ? v.saved.filter((x) => x.id !== o.id)
        : [...v.saved, o],
    }));
    notify(
      s.saved.some((x) => x.id === o.id)
        ? "Outfit removed from saved looks."
        : "Outfit saved to your collection.",
    );
  }
  function updateOutfit(next: Outfit) {
    setS((v) => ({
      ...v,
      outfits: v.outfits.map((o) => (o.id === next.id ? next : o)),
      saved: v.saved.map((o) => (o.id === next.id ? next : o)),
    }));
  }
  function replace(p: Product) {
    const before = total(current, s.custom);
    const next = {
      ...current,
      items: current.items.some(
        (i) => product(i.productId, s.custom).category === p.category,
      )
        ? current.items.map((i) =>
            product(i.productId, s.custom).category === p.category
              ? {
                  productId: p.id,
                  owned: s.wardrobe.some((w) => w.productId === p.id),
                }
              : i,
          )
        : [
            ...current.items,
            {
              productId: p.id,
              owned: s.wardrobe.some((w) => w.productId === p.id),
            },
          ],
    };
    updateOutfit(next);
    setReplacement(null);
    const saving = before - total(next, s.custom);
    notify(
      `${p.name} added.${saving > 0 ? " You saved " + money(saving) + "." : ""}`,
    );
  }
  function send(text = input) {
    if (!text.trim() || typing) return;
    setStarted(true);
    setInput("");
    setTyping(true);
    const lower = text.toLowerCase();
    setS((v) => ({
      ...v,
      messages: [
        ...v.messages,
        { id: crypto.randomUUID(), role: "user", text },
      ],
    }));
    timer.current = setTimeout(() => {
      setS((v) => {
        const budget = budgetFrom(text, v.profile.budget),
          style = /streetwear/.test(lower)
            ? "streetwear"
            : /preppy/.test(lower) && !/less preppy/.test(lower)
              ? "preppy"
              : /minimal/.test(lower)
                ? "minimalist"
                : null;
        const profile = {
          ...v.profile,
          budget,
          occasion: /dinner|birthday|date|night out/.test(lower)
            ? "Dinner"
            : /school|campus|semester/.test(lower)
              ? "Campus"
              : /office|work/.test(lower) && !/wardrobe/.test(lower)
                ? "Work"
                : /weekend/.test(lower)
                  ? "Weekend"
                  : v.profile.occasion,
          styles: style
            ? [style, ...v.profile.styles.filter((x) => x !== style)]
            : v.profile.styles,
        };
        let outfits = v.outfits,
          reply = "";
        const cat = replacementCategory(lower);
        const replacing =
          /replace|swap|hate|except|different|cheaper|less expensive/.test(
            lower,
          );
        if (replacing && cat) {
          const active = outfits[v.selected];
          const options = alternatives(
            active,
            cat,
            v.custom,
            /cheaper|less expensive/.test(lower),
          );
          if (options.length) {
            const old = total(active, v.custom),
              p =
                options.find(
                  (p) =>
                    !profile.avoid
                      .toLowerCase()
                      .includes(p.color.toLowerCase()),
                ) || options[0];
            const revised = {
              ...active,
              items: active.items.some(
                (i) => product(i.productId, v.custom).category === cat,
              )
                ? active.items.map((i) =>
                    product(i.productId, v.custom).category === cat
                      ? {
                          productId: p.id,
                          owned: v.wardrobe.some((w) => w.productId === p.id),
                        }
                      : i,
                  )
                : [...active.items, { productId: p.id, owned: false }],
            };
            outfits = outfits.map((o) => (o.id === active.id ? revised : o));
            reply = `Swapped in the ${p.name.toLowerCase()} and kept the rest of your look. ${old > total(revised, v.custom) ? "That saves " + money(old - total(revised, v.custom)) + ". " : ""}Your new total is ${money(total(revised, v.custom))}.`;
          } else
            reply =
              "This is already the lowest-priced option in our demo catalog for that category. Try “find something cheaper” to optimize the full look.";
        } else {
          const context = [
            text,
            style ? "" : profile.styles[0] || "minimalist",
            /cheaper|less expensive/.test(lower)
              ? `under $${Math.floor(total(v.outfits[v.selected], v.custom) * 0.8)}`
              : "",
          ].join(" ");
          outfits = generate(
            context,
            profile,
            v.wardrobe.map((w) => w.productId),
            v.custom,
          );
          const over = outfits.filter((o) => total(o, v.custom) > budget);
          reply = `I put together three ${style || profile.styles[0]} directions for you${/wardrobe|own|already/.test(lower) ? ", starting with your own pieces" : ""}. ${over.length ? `Our catalog can’t get every complete look below ${money(budget)}; the totals show the difference.` : `Each look stays within your ${money(budget)} budget.`} Select a look to explore the pieces or see it on your digital twin.`;
        }
        return {
          ...v,
          profile,
          outfits,
          selected: replacing && cat ? v.selected : 0,
          saved: v.saved.map((o) => outfits.find((n) => n.id === o.id) || o),
          messages: [
            ...v.messages,
            { id: crypto.randomUUID(), role: "agent", text: reply },
          ],
        };
      });
      setTyping(false);
    }, 650);
  }
  function upload(file: File | undefined, callback: (url: string) => void) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      notify("Choose a JPG, PNG, or WebP under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result));
    reader.readAsDataURL(file);
  }
  function addOwned(e: React.FormEvent) {
    e.preventDefault();
    const id = "custom-" + crypto.randomUUID();
    const p: Product = {
      id,
      name: form.name.trim(),
      category: form.category,
      color: form.color,
      hex:
        (
          {
            Black: "#303030",
            Stone: "#b9ac93",
            Olive: "#6a755d",
            White: "#ece9de",
            Blue: "#607b92",
          } as Record<string, string>
        )[form.color] || "#999",
      brand: form.brand || "My wardrobe",
      price: Math.max(0, Number(form.price) || 0),
      retailer: "Owned",
      url: "",
      image:
        form.image || catalog.find((p) => p.category === form.category)!.image,
      tags: s.profile.styles,
      linkType: "collection",
    };
    setS((v) => ({
      ...v,
      custom: [...v.custom, p],
      wardrobe: [...v.wardrobe, { id, productId: id }],
    }));
    setAdding(false);
    setForm({
      name: "",
      category: "top",
      color: "Stone",
      brand: "",
      price: "0",
      image: "",
    });
    notify("Added to your wardrobe.");
  }
  function vote(like: boolean) {
    setFeedback((v) => ({ ...v, [current.id]: like ? "liked" : "disliked" }));
    setS((v) => ({
      ...v,
      profile: {
        ...v.profile,
        weights: {
          ...v.profile.weights,
          [current.tags[0]]:
            (v.profile.weights[current.tags[0]] || 0) + (like ? 1 : -1),
        },
        styles: like
          ? [
              current.tags[0],
              ...v.profile.styles.filter((x) => x !== current.tags[0]),
            ]
          : v.profile.styles.filter((x) => x !== current.tags[0]),
      },
    }));
    notify(
      like
        ? "More of this. Your local preferences are updated."
        : "Got it. This style will have lower priority.",
    );
  }
  const productList = (o: Outfit) => (
    <div className="product-list">
      {o.items.map((i) => {
        const p = product(i.productId, s.custom);
        return (
          <div className="product-row" key={i.productId}>
            <img
              src={p.image}
              alt={p.name}
              onError={(e) => {
                e.currentTarget.src = "/garments/u-tee.svg";
              }}
            />
            <div>
              <small>
                {p.brand} · {p.category}
              </small>
              <strong>{p.name}</strong>
              <span>
                {p.color} · {i.owned ? "In your wardrobe" : p.retailer}
              </span>
              {!i.owned && (
                <a href={p.url} target="_blank" rel="noreferrer">
                  Browse retailer <ExternalLink size={10} />
                </a>
              )}
            </div>
            <div className="product-price">
              <b>{i.owned ? "Owned" : money(p.price)}</b>
              <button
                onClick={() => setReplacement(p.category)}
                aria-label={"Replace " + p.name}
              >
                <RefreshCw size={13} /> Swap
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("Discover");
            setStarted(false);
          }}
        >
          FORM<span>®</span>
        </a>
        <div className="sidebar-label">THE PERSONAL STYLE STUDIO</div>
        <nav>
          {(
            [
              { name: "Discover", icon: Compass },
              { name: "Virtual Studio", icon: ScanLine },
              { name: "My Wardrobe", icon: Shirt },
              { name: "Saved Outfits", icon: Heart },
              { name: "Style Profile", icon: SlidersHorizontal },
            ] as const
          ).map((n) => (
            <button
              className={page === n.name ? "active" : ""}
              key={n.name}
              onClick={() => nav(n.name)}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Saved Outfits" && s.saved.length > 0 && (
                <span className="nav-count">{s.saved.length}</span>
              )}
              {page === n.name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="twin-invite">
            <span className="mini-star">✳</span>
            <h3>A little more you.</h3>
            <p>
              Meet your digital twin.
              <br />
              See the look come to life.
            </p>
            <button
              onClick={() => {
                nav("Virtual Studio");
                setScanProgress(0);
              }}
            >
              Create my digital twin <ArrowUpRight size={16} />
            </button>
          </div>
          <button
            className="profile-switch"
            onClick={() => nav("Style Profile")}
          >
            <span className="profile-avatar">A</span>
            <span>
              Alex’s style space<small>YOUR PERSONAL EDIT</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Your space <ChevronRight size={12} /> <b>{page}</b>
            </span>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <i /> INTERACTIVE DEMO
            </span>
            <button
              className="icon-button"
              onClick={() => nav("Saved Outfits")}
              aria-label="Saved outfits"
            >
              <Heart size={18} />
            </button>
            <button
              className="profile-avatar"
              onClick={() => nav("Style Profile")}
              aria-label="Style profile"
            >
              A
            </button>
          </div>
        </header>
        {page === "Discover" && (
          <div className="discover page-enter">
            {!started ? (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <div className="eyebrow">
                      <span /> GOOD STYLE STARTS WITH YOU
                    </div>
                    <h1>
                      Your style.
                      <br />
                      <em>Imagined, fitted,</em>
                      <br />
                      figured out.
                    </h1>
                    <p>
                      Tell us where you’re going and how you want to feel.
                      <br className="desktop-break" /> Your personal AI stylist
                      takes care of the rest.
                    </p>
                    <div className="hero-actions">
                      <button
                        className="button primary"
                        onClick={() => {
                          setStarted(true);
                          document.getElementById("stylist-input")?.focus();
                        }}
                      >
                        Build my first look <ArrowUpRight size={18} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => nav("Virtual Studio")}
                      >
                        Meet your digital twin <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="hero-caption">
                      <div className="stack-dots">
                        <span>A</span>
                        <span>M</span>
                        <span>J</span>
                      </div>
                      <span>A fresh perspective on getting dressed.</span>
                    </div>
                  </div>
                  <div className="hero-art">
                    <div className="editorial-image">
                      {!imageFailed ? (
                        <img
                          src={fashion}
                          onError={() => setImageFailed(true)}
                          alt="Editorial fashion inspiration: a considered personal wardrobe"
                        />
                      ) : (
                        <FlatAvatar outfit={current} />
                      )}
                      <div className="image-shade" />
                      <div className="photo-label">
                        THE EVERYDAY, REIMAGINED.<span>FORM / EDIT 001</span>
                      </div>
                      <span className="image-corner">01 — 03</span>
                    </div>
                    <div className="floating-fit">
                      <div className="fit-icon">
                        <ScanLine size={23} />
                      </div>
                      <div>
                        <b>Made for your point of view.</b>
                        <span>Your style. Your proportions. Your rules.</span>
                      </div>
                      <span className="lime-dot" />
                    </div>
                    <div className="floating-product">
                      <img
                        src="/garments/overshirt.svg"
                        alt="Olive utility overshirt"
                      />
                      <div>
                        <small>THE FINISHING TOUCH</small>
                        <b>Utility overshirt</b>
                        <span>Olive · {money(50)}</span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Try the utility overshirt"
                        onClick={() => {
                          setStarted(true);
                          nav("Virtual Studio");
                        }}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </div>
                </section>
                <div className="value-strip">
                  <span>
                    <Sparkles size={17} /> Intent, meet outfit.
                  </span>
                  <span>
                    <ScanLine size={17} /> See it on your digital twin.
                  </span>
                  <span>
                    <Shirt size={17} /> More from what you own.
                  </span>
                  <span className="strip-note">LESS SCROLLING. MORE YOU.</span>
                </div>
              </>
            ) : (
              <div className="section-title">
                <div>
                  <div className="eyebrow">YOUR PERSONAL STYLE STUDIO</div>
                  <h1 className="small-headline">
                    Let’s find your next <em>feeling.</em>
                  </h1>
                </div>
                <button
                  className="text-button"
                  onClick={() => setStarted(false)}
                >
                  Back to the edit <ArrowUpRight size={16} />
                </button>
              </div>
            )}
            <section className="stylist-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    A CONVERSATION, NOT A SEARCH BAR
                  </div>
                  <h2>What are we dressing for?</h2>
                </div>
                <span className="agent-status">
                  <span /> Your stylist is here
                </span>
              </div>
              <div className="stylist-box">
                {s.messages.length > 0 && (
                  <div className="conversation" aria-live="polite">
                    {s.messages.map((m) => (
                      <div key={m.id} className={"message " + m.role}>
                        <span>
                          {m.role === "agent" ? <Sparkles size={15} /> : "A"}
                        </span>
                        <p>{m.text}</p>
                      </div>
                    ))}
                    {typing && (
                      <div className="message agent">
                        <span>
                          <Sparkles size={15} />
                        </span>
                        <p className="typing">
                          Considering the possibilities<span>…</span>
                        </p>
                      </div>
                    )}
                    <div ref={chatEnd} />
                  </div>
                )}
                <form
                  className="prompt-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <Sparkles size={21} />
                  <input
                    id="stylist-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="A new semester. A first date. A little more confidence. Tell me about it…"
                    aria-label="Ask your personal stylist"
                  />
                  <button
                    type="submit"
                    disabled={typing || !input.trim()}
                    aria-label="Generate outfits"
                  >
                    <ArrowUp size={21} />
                  </button>
                </form>
                <div className="prompt-bottom">
                  <div className="suggestions">
                    {[
                      "Back to school, under $250",
                      "A birthday dinner",
                      "More streetwear",
                      "Style my wardrobe",
                    ].map((p) => (
                      <button key={p} disabled={typing} onClick={() => send(p)}>
                        {p}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  <span>
                    LOCAL DEMO STYLIST <span className="tiny-star">✳</span>
                  </span>
                </div>
              </div>
            </section>
            <section className="looks-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    {started ? "YOUR NEXT CHAPTER" : "A LITTLE INSPIRATION"}
                  </div>
                  <h2>
                    {started
                      ? "Three ways to show up."
                      : "Good looks, great possibilities."}
                  </h2>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    send(
                      "Give me three fresh " +
                        s.profile.styles.join(" ") +
                        " outfits under $" +
                        s.profile.budget,
                    )
                  }
                >
                  Refresh the edit <RefreshCw size={14} />
                </button>
              </div>
              <div className="outfit-grid">
                {s.outfits.map((o, index) => (
                  <article
                    className={
                      "outfit-card " +
                      (started && index === s.selected ? "selected" : "")
                    }
                    key={o.id}
                  >
                    <div className={"outfit-visual visual-" + index}>
                      <button
                        className={
                          "save-float " +
                          (s.saved.some((x) => x.id === o.id) ? "saved" : "")
                        }
                        aria-label={
                          (s.saved.some((x) => x.id === o.id)
                            ? "Unsave "
                            : "Save ") + o.name
                        }
                        onClick={() => save(o)}
                      >
                        <Heart
                          size={18}
                          fill={
                            s.saved.some((x) => x.id === o.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                      <span className="look-number">LOOK 0{index + 1}</span>
                      <div className="flatlay">
                        {o.items.map((i) => (
                          <img
                            key={i.productId}
                            className={
                              "garment-" +
                              product(i.productId, s.custom).category
                            }
                            src={product(i.productId, s.custom).image}
                            alt={product(i.productId, s.custom).name}
                          />
                        ))}
                      </div>
                      <button
                        className="try-on"
                        onClick={() => {
                          setS((v) => ({ ...v, selected: index }));
                          nav("Virtual Studio");
                        }}
                      >
                        <ScanLine size={15} /> Try it on{" "}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="outfit-info">
                      <div>
                        <small>{o.tags.join(" / ").toUpperCase()}</small>
                        <button
                          className="outfit-title"
                          onClick={() => {
                            setS((v) => ({ ...v, selected: index }));
                            setStarted(true);
                          }}
                        >
                          {o.name} <ArrowUpRight size={17} />
                        </button>
                        <p>{o.description}</p>
                      </div>
                      <div className="outfit-price">
                        <b>{money(total(o, s.custom))}</b>
                        <span>{o.items.length} pieces</span>
                      </div>
                    </div>
                    {started && (
                      <div className="outfit-budget">
                        <span
                          className={
                            total(o, s.custom) > s.profile.budget ? "over" : ""
                          }
                        >
                          {total(o, s.custom) <= s.profile.budget
                            ? money(s.profile.budget - total(o, s.custom)) +
                              " under budget"
                            : money(total(o, s.custom) - s.profile.budget) +
                              " over budget"}
                        </span>
                        <button
                          onClick={() => {
                            setS((v) => ({ ...v, selected: index }));
                            nav("Virtual Studio");
                          }}
                        >
                          Customize <SlidersHorizontal size={12} />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
            {started && (
              <section className="selected-detail">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">THE DETAILS / SELECTED LOOK</div>
                    <h2>{current.name}</h2>
                    <p>{current.rationale}</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => nav("Virtual Studio")}
                  >
                    Open fitting studio <ArrowUpRight size={16} />
                  </button>
                </div>
                {productList(current)}
                <div className="feedback">
                  <span>Does this feel like you?</span>
                  <button
                    onClick={() => vote(true)}
                    aria-pressed={feedback[current.id] === "liked"}
                  >
                    <ThumbsUp size={15} /> More like this
                  </button>
                  <button
                    onClick={() => vote(false)}
                    aria-pressed={feedback[current.id] === "disliked"}
                  >
                    <ThumbsDown size={15} /> Less like this
                  </button>
                </div>
              </section>
            )}
            <div className="bottom-note">
              <span>THOUGHTFULLY PUT TOGETHER. ENTIRELY YOURS.</span>
              <p>
                Curated demo catalog · USD estimates · Tax and shipping excluded
                · Retailer links open collections; verify current products and
                prices.
              </p>
            </div>
          </div>
        )}
        {page === "Virtual Studio" && (
          <div className="studio-page page-enter">
            <div className="section-title">
              <div>
                <div className="eyebrow">A NEW PERSPECTIVE ON YOU</div>
                <h1 className="small-headline">
                  The fitting <em>studio.</em>
                </h1>
              </div>
              <span className="studio-disclaimer">
                Visual preview, not verified garment fit.
              </span>
            </div>
            <div className="studio-layout">
              <div
                className={
                  "studio-viewport " +
                  (scanProgress !== null && scanProgress < 100
                    ? "scanning"
                    : "")
                }
              >
                <div className="viewport-label">
                  <span className="lime-dot" />
                  {scanProgress !== null && scanProgress < 100
                    ? "SIMULATED BODY MAPPING"
                    : "YOUR DIGITAL TWIN / 01"}
                </div>
                <Avatar
                  outfit={current}
                  profile={s.scan}
                  extra={s.custom}
                  angle={angle}
                  zoom={zoom}
                />
                {scanProgress !== null && scanProgress < 100 && (
                  <div className="scan-overlay">
                    <div className="scan-grid" />
                    <div
                      className="scan-beam"
                      style={{ top: scanProgress + "%" }}
                    />
                    <div className="scan-status">
                      <div
                        className="progress-circle"
                        style={{
                          background: `conic-gradient(#d2eb76 ${scanProgress}%, #ffffff22 0)`,
                        }}
                      >
                        <b>{scanProgress}%</b>
                      </div>
                      <h2>
                        {
                          [
                            "Preparing scan…",
                            "Mapping body silhouette…",
                            "Estimating proportions…",
                            "Building your digital twin…",
                            "Finalizing fit profile…",
                          ][Math.min(4, Math.floor(scanProgress / 20))]
                        }
                      </h2>
                      <p>Simulated scan · No camera or depth data collected</p>
                      <div>
                        <button
                          className="button light"
                          onClick={() => setScanProgress(100)}
                        >
                          Skip to reveal <ArrowRight size={15} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setScanProgress(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <span className="scan-measure measure-left">
                      SHOULDERS — {s.scan.shoulder} CM
                    </span>
                    <span className="scan-measure measure-right">
                      HEIGHT — {s.scan.height} CM
                    </span>
                  </div>
                )}
                {(scanProgress === null || scanProgress === 100) && (
                  <>
                    <div className="viewport-bottom">
                      <span>DRAG TO ROTATE · SCROLL TO ZOOM</span>
                      <div>
                        <button
                          aria-label="Rotate avatar"
                          onClick={() => setAngle((v) => v + Math.PI / 4)}
                        >
                          <RotateCcw size={17} />
                        </button>
                        <button
                          aria-label="Zoom in"
                          onClick={() => setZoom((v) => Math.min(1.3, v + 0.1))}
                        >
                          <ZoomIn size={17} />
                        </button>
                        <button
                          aria-label="Zoom out"
                          onClick={() => setZoom((v) => Math.max(0.7, v - 0.1))}
                        >
                          <Minus size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="outfit-switch">
                      <button
                        aria-label="Previous outfit"
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            selected: (v.selected + 2) % 3,
                          }))
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>LOOK 0{s.selected + 1} / 03</span>
                      <button
                        aria-label="Next outfit"
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            selected: (v.selected + 1) % 3,
                          }))
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <aside className="studio-details">
                {!s.scan.complete ? (
                  <div className="scan-invite">
                    <span className="eyebrow">MEET YOUR DIGITAL TWIN</span>
                    <h2>
                      A fitting room
                      <br />
                      with your name on it.
                    </h2>
                    <p>
                      Explore your proportions with an adjustable, stylized 3D
                      mannequin.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setScanProgress(0)}
                    >
                      <ScanLine size={17} /> Create my digital twin
                    </button>
                    <small>
                      A simulated experience. No hardware scan or accurate body
                      measurements.
                    </small>
                  </div>
                ) : (
                  <div className="twin-ready">
                    <span>
                      <Check size={14} /> YOUR DIGITAL TWIN IS READY
                    </span>
                    <button onClick={() => setScanProgress(0)}>
                      <RotateCcw size={12} /> Replay scan
                    </button>
                  </div>
                )}
                <div className="studio-outfit-heading">
                  <div className="eyebrow">YOUR SELECTED LOOK</div>
                  <h2>{current.name}</h2>
                  <p>{current.rationale}</p>
                </div>
                {productList(current)}
                <div className="total-row">
                  <span>
                    To make it yours
                    <small>
                      {current.items.filter((i) => i.owned).length} pieces
                      already owned
                    </small>
                  </span>
                  <b>{money(total(current, s.custom))}</b>
                </div>
                <span
                  className={
                    "budget-note " +
                    (total(current, s.custom) > s.profile.budget ? "over" : "")
                  }
                >
                  {total(current, s.custom) <= s.profile.budget
                    ? money(s.profile.budget - total(current, s.custom)) +
                      " under your budget"
                    : money(total(current, s.custom) - s.profile.budget) +
                      " over your budget"}
                </span>
                <div className="studio-buttons">
                  <button
                    className="button primary"
                    onClick={() => save(current)}
                  >
                    <Heart size={16} />
                    {s.saved.some((o) => o.id === current.id)
                      ? "Unsave look"
                      : "Save this look"}
                  </button>
                  <button
                    className="button outline"
                    onClick={() => {
                      const pricey = current.items
                        .filter((i) => !i.owned)
                        .map((i) => product(i.productId, s.custom))
                        .sort((a, b) => b.price - a.price)
                        .find(
                          (p) =>
                            alternatives(current, p.category, s.custom, true)
                              .length,
                        );
                      if (pricey) setReplacement(pricey.category);
                      else
                        notify(
                          "You already have the lowest-priced complete look in this catalog.",
                        );
                    }}
                  >
                    Find a better deal <ArrowUpRight size={15} />
                  </button>
                </div>
                <p className="fineprint">
                  Demo catalog prices in USD. Retailer collection links do not
                  guarantee an exact match, stock, or price.
                </p>
              </aside>
            </div>
            <div className="avatar-settings">
              <div>
                <div className="eyebrow">
                  YOUR PROPORTIONS, YOUR PREFERENCES
                </div>
                <h2>Make it feel like you.</h2>
                <p>Adjustable demo measurements. Changes save automatically.</p>
              </div>
              <div className="measurement-grid">
                {(["height", "shoulder", "chest", "waist", "hip"] as const).map(
                  (key) => (
                    <label key={key}>
                      {key}
                      <span>{s.scan[key]} cm</span>
                      <input
                        aria-label={key + " in centimeters"}
                        type="range"
                        min={
                          key === "height" ? 140 : key === "shoulder" ? 32 : 60
                        }
                        max={
                          key === "height" ? 205 : key === "shoulder" ? 60 : 140
                        }
                        value={s.scan[key]}
                        onChange={(e) =>
                          setS((v) => ({
                            ...v,
                            scan: { ...v.scan, [key]: Number(e.target.value) },
                          }))
                        }
                      />
                    </label>
                  ),
                )}
                <label>
                  Preferred fit
                  <select
                    value={s.scan.fit}
                    onChange={(e) =>
                      setS((v) => ({
                        ...v,
                        scan: { ...v.scan, fit: e.target.value },
                        profile: { ...v.profile, fit: e.target.value },
                      }))
                    }
                  >
                    {["Fitted", "Regular", "Oversized"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <form
              className="studio-chat"
              onSubmit={(e) => {
                e.preventDefault();
                send();
                nav("Discover");
                setStarted(true);
              }}
            >
              <Sparkles size={18} />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Love the pants, but swap the jacket…"
                aria-label="Refine this outfit"
              />
              <button
                className="button primary"
                disabled={!input.trim() || typing}
              >
                Ask your stylist <ArrowUp size={16} />
              </button>
            </form>
          </div>
        )}
        {page === "My Wardrobe" && (
          <div className="standard-page page-enter">
            <div className="section-title">
              <div>
                <div className="eyebrow">
                  THE BEST PIECES MIGHT ALREADY BE YOURS
                </div>
                <h1 className="small-headline">
                  Your wardrobe.
                  <br />
                  <em>New possibilities.</em>
                </h1>
                <p>
                  {s.wardrobe.length} pieces, endless ways to make them yours.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setAdding(true)}
              >
                <Plus size={17} /> Add a piece
              </button>
            </div>
            <div className="wardrobe-banner">
              <div>
                <Sparkles size={23} />
                <h3>Fresh looks. Familiar favorites.</h3>
                <p>Let your stylist start with what you already own.</p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  nav("Discover");
                  send(
                    "Style my wardrobe. I want to buy as little as possible.",
                  );
                }}
              >
                Style my wardrobe <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="wardrobe-grid">
              {s.wardrobe.map((w) => {
                const p = product(w.productId, s.custom);
                return (
                  <article className="wardrobe-card" key={w.id}>
                    <div>
                      <img src={p.image} alt={p.name} />
                      <button
                        aria-label={"Remove " + p.name}
                        onClick={() => {
                          setS((v) => ({
                            ...v,
                            wardrobe: v.wardrobe.filter((x) => x.id !== w.id),
                          }));
                          notify("Piece removed from your wardrobe.");
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                      <span>OWNED</span>
                    </div>
                    <small>
                      {p.brand} / {p.category}
                    </small>
                    <h3>{p.name}</h3>
                    <p>{p.color}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        nav("Discover");
                        send("Make outfits using my wardrobe " + p.name);
                      }}
                    >
                      Style this piece <ArrowUpRight size={14} />
                    </button>
                  </article>
                );
              })}
              <button
                className="add-piece-card"
                onClick={() => setAdding(true)}
              >
                <Plus size={28} />
                <span>Something else in your closet?</span>
                <small>Add a piece you love.</small>
              </button>
            </div>
            <div className="gap-note">
              <span className="mini-star">✳</span>
              <div>
                <h3>Your next considered addition</h3>
                <p>
                  {(() => {
                    const cats = s.wardrobe.map(
                      (w) => product(w.productId, s.custom).category,
                    );
                    return !cats.includes("outerwear")
                      ? "An olive overshirt adds a layer to your existing tops and bottoms, giving your everyday pieces another way to work together."
                      : !cats.includes("shoes")
                        ? "A pair of white sneakers can connect casual and more polished pieces across your wardrobe."
                        : "A neutral knit adds texture and pairs with your existing bottoms. Try it before buying more.";
                  })()}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  nav("Discover");
                  send("Suggest three outfits using my wardrobe");
                }}
              >
                Explore combinations <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
        {page === "Saved Outfits" && (
          <div className="standard-page page-enter">
            <div className="section-title">
              <div>
                <div className="eyebrow">GOOD TASTE, KEPT CLOSE</div>
                <h1 className="small-headline">
                  Your personal <em>edit.</em>
                </h1>
                <p>
                  {s.saved.length} saved{" "}
                  {s.saved.length === 1 ? "look" : "looks"} for whatever comes
                  next.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  nav("Discover");
                  setStarted(true);
                }}
              >
                Find another look <ArrowUpRight size={16} />
              </button>
            </div>
            {s.saved.length === 0 ? (
              <div className="empty-state">
                <Heart size={40} />
                <h2>A little room for inspiration.</h2>
                <p>
                  Save a look from Discover or the fitting studio.
                  <br />
                  Your favorites will be waiting here.
                </p>
                <button
                  className="button primary"
                  onClick={() => nav("Discover")}
                >
                  Explore the edit <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="outfit-grid">
                {s.saved.map((o) => (
                  <article className="outfit-card" key={o.id}>
                    <div className="outfit-visual">
                      <div className="flatlay">
                        {o.items.map((i) => (
                          <img
                            key={i.productId}
                            className={
                              "garment-" +
                              product(i.productId, s.custom).category
                            }
                            src={product(i.productId, s.custom).image}
                            alt={product(i.productId, s.custom).name}
                          />
                        ))}
                      </div>
                      <button
                        className="save-float saved"
                        aria-label={"Unsave " + o.name}
                        onClick={() => save(o)}
                      >
                        <Heart size={18} fill="currentColor" />
                      </button>
                      <button
                        className="try-on"
                        onClick={() => {
                          setS((v) => ({
                            ...v,
                            outfits: [
                              o,
                              ...v.outfits.filter((x) => x.id !== o.id),
                            ].slice(0, 3),
                            selected: 0,
                          }));
                          nav("Virtual Studio");
                        }}
                      >
                        Try it on <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="outfit-info">
                      <div>
                        <small>{o.tags.join(" / ")}</small>
                        <h3>{o.name}</h3>
                      </div>
                      <b>{money(total(o, s.custom))}</b>
                    </div>
                    <button
                      className="text-button inspiration-save"
                      onClick={() => {
                        setS((v) => ({
                          ...v,
                          profile: {
                            ...v.profile,
                            inspiration: [
                              ...v.profile.inspiration,
                              {
                                id: crypto.randomUUID(),
                                image: product(o.items[0].productId, v.custom)
                                  .image,
                                tag: o.tags[0],
                              },
                            ],
                          },
                        }));
                        notify("Added to your inspiration board.");
                      }}
                    >
                      Save as inspiration <Plus size={13} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
        {page === "Style Profile" && (
          <div className="standard-page page-enter">
            <div className="section-title">
              <div>
                <div className="eyebrow">
                  NO LABELS. JUST YOUR POINT OF VIEW.
                </div>
                <h1 className="small-headline">
                  A little more <em>you.</em>
                </h1>
                <p>
                  Your preferences guide every new edit. Everything saves
                  automatically.
                </p>
              </div>
              <span className="saved-status">
                <Check size={14} /> Saved on this device
              </span>
            </div>
            <div className="profile-layout">
              <div className="profile-form">
                <section>
                  <small>01 / YOUR STYLE LANGUAGE</small>
                  <h2>What feels like you?</h2>
                  <div className="style-tags">
                    {[
                      "minimalist",
                      "casual elevated",
                      "streetwear",
                      "preppy",
                      "smart casual",
                      "sporty",
                      "night out",
                      "vintage",
                    ].map((tag) => (
                      <button
                        key={tag}
                        className={
                          s.profile.styles.includes(tag) ? "chosen" : ""
                        }
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            profile: {
                              ...v.profile,
                              styles: v.profile.styles.includes(tag)
                                ? v.profile.styles.filter((x) => x !== tag)
                                : [...v.profile.styles, tag],
                            },
                          }))
                        }
                      >
                        {tag}
                        {s.profile.styles.includes(tag) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <small>02 / YOUR PALETTE</small>
                  <h2>Colors you come back to.</h2>
                  <div className="color-options">
                    {[
                      ["Stone", "#bcad94"],
                      ["Olive", "#69745d"],
                      ["Black", "#292c29"],
                      ["White", "#f7f5eb"],
                      ["Blue", "#6d859b"],
                      ["Brown", "#725847"],
                    ].map(([name, hex]) => (
                      <button
                        key={name}
                        className={
                          s.profile.colors.includes(name) ? "chosen" : ""
                        }
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            profile: {
                              ...v.profile,
                              colors: v.profile.colors.includes(name)
                                ? v.profile.colors.filter((x) => x !== name)
                                : [...v.profile.colors, name],
                            },
                          }))
                        }
                      >
                        <span style={{ background: hex }}>
                          {s.profile.colors.includes(name) && (
                            <Check
                              size={14}
                              color={name === "White" ? "#222" : "#fff"}
                            />
                          )}
                        </span>
                        {name}
                      </button>
                    ))}
                  </div>
                  <label>
                    Colors or styles to avoid
                    <input
                      value={s.profile.avoid}
                      onChange={(e) =>
                        setS((v) => ({
                          ...v,
                          profile: { ...v.profile, avoid: e.target.value },
                        }))
                      }
                      placeholder="e.g. red, neon, very fitted"
                    />
                  </label>
                </section>
                <section>
                  <small>03 / THE EVERYDAY DETAILS</small>
                  <div className="form-grid">
                    <label>
                      Outfit budget (USD)
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={s.profile.budget}
                        onChange={(e) =>
                          setS((v) => ({
                            ...v,
                            profile: {
                              ...v.profile,
                              budget: Math.max(0, Number(e.target.value) || 0),
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Preferred fit
                      <select
                        value={s.profile.fit}
                        onChange={(e) =>
                          setS((v) => ({
                            ...v,
                            profile: { ...v.profile, fit: e.target.value },
                            scan: { ...v.scan, fit: e.target.value },
                          }))
                        }
                      >
                        {["Fitted", "Regular", "Oversized"].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Typical occasion
                      <select
                        value={s.profile.occasion}
                        onChange={(e) =>
                          setS((v) => ({
                            ...v,
                            profile: { ...v.profile, occasion: e.target.value },
                          }))
                        }
                      >
                        {[
                          "Everyday",
                          "Campus",
                          "Work",
                          "Dinner",
                          "Weekend",
                        ].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
                <button
                  className="button primary"
                  onClick={() => {
                    nav("Discover");
                    send(
                      "Create three " +
                        s.profile.styles.join(" ") +
                        " outfits for " +
                        s.profile.occasion +
                        " under $" +
                        s.profile.budget,
                    );
                  }}
                >
                  Put my style to work <ArrowUpRight size={17} />
                </button>
              </div>
              <aside className="inspiration-board">
                <div className="eyebrow">YOUR VISUAL VOCABULARY</div>
                <h2>The inspiration board.</h2>
                <p>
                  Save a mood. Tag it your way.
                  <br />
                  Image tags guide your style; images aren’t analyzed.
                </p>
                <div className="inspiration-grid">
                  {s.profile.inspiration.map((i) => (
                    <div key={i.id}>
                      <img src={i.image} alt={i.tag + " inspiration"} />
                      <button
                        className="remove-inspiration"
                        aria-label="Remove inspiration"
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            profile: {
                              ...v.profile,
                              inspiration: v.profile.inspiration.filter(
                                (x) => x.id !== i.id,
                              ),
                            },
                          }))
                        }
                      >
                        <X size={13} />
                      </button>
                      <select
                        aria-label="Inspiration style tag"
                        value={i.tag}
                        onChange={(e) => {
                          const tag = e.target.value;
                          setS((v) => ({
                            ...v,
                            profile: {
                              ...v.profile,
                              styles: [
                                tag,
                                ...v.profile.styles.filter((x) => x !== tag),
                              ],
                              inspiration: v.profile.inspiration.map((x) =>
                                x.id === i.id ? { ...x, tag } : x,
                              ),
                            },
                          }));
                        }}
                      >
                        {[
                          "minimalist",
                          "casual elevated",
                          "streetwear",
                          "preppy",
                          "night out",
                          "vintage",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <label className="upload-button">
                  <Plus size={17} /> Add inspiration
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) =>
                      upload(e.target.files?.[0], (image) =>
                        setS((v) => ({
                          ...v,
                          profile: {
                            ...v.profile,
                            inspiration: [
                              ...v.profile.inspiration,
                              {
                                id: crypto.randomUUID(),
                                image,
                                tag: "minimalist",
                              },
                            ],
                          },
                        })),
                      )
                    }
                  />
                </label>
                <small>JPG, PNG, or WebP · Up to 2 MB each</small>
              </aside>
            </div>
          </div>
        )}
        <footer>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              nav("Discover");
            }}
          >
            FORM<span>®</span>
          </a>
          <span>LESS SEARCHING. MORE SHOWING UP.</span>
          <span>A considered shopping prototype / 2026</span>
        </footer>
      </main>
      {replacement && (
        <div className="modal-backdrop" onClick={() => setReplacement(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Replace a piece"
            className="replacement-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">SAME LOOK. NEW POSSIBILITIES.</div>
                <h2>Rethink the {replacement}.</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setReplacement(null)}
                aria-label="Close replacements"
              >
                <X size={22} />
              </button>
            </div>
            <p>
              The rest of your outfit stays just as you like it. Prices are demo
              estimates.
            </p>
            <div className="replacement-grid">
              {alternatives(current, replacement, s.custom).map((p) => {
                const old = current.items.find(
                  (i) =>
                    product(i.productId, s.custom).category === replacement,
                );
                const diff =
                  (old && !old.owned
                    ? product(old.productId, s.custom).price
                    : 0) -
                  (s.wardrobe.some((w) => w.productId === p.id) ? 0 : p.price);
                return (
                  <button
                    className="replacement-option"
                    key={p.id}
                    onClick={() => replace(p)}
                  >
                    <img src={p.image} alt={p.name} />
                    <small>
                      {p.brand} · {p.color}
                    </small>
                    <b>{p.name}</b>
                    <span>
                      {s.wardrobe.some((w) => w.productId === p.id)
                        ? "Already owned"
                        : money(p.price)}{" "}
                      <em>
                        {diff > 0
                          ? "Save " + money(diff)
                          : diff < 0
                            ? "+" + money(-diff)
                            : "Same price"}
                      </em>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Add a wardrobe piece"
            className="add-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={addOwned}
          >
            <div className="modal-heading">
              <h2>Already yours.</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close add item"
                onClick={() => setAdding(false)}
              >
                <X size={22} />
              </button>
            </div>
            <p>Add a favorite to your personal wardrobe.</p>
            <label>
              Piece name
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) =>
                  setForm((v) => ({ ...v, name: e.target.value }))
                }
                placeholder="My favorite linen shirt"
              />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      category: e.target.value as Category,
                    }))
                  }
                >
                  {["top", "bottom", "shoes", "outerwear", "accessory"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Color
                <select
                  value={form.color}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, color: e.target.value }))
                  }
                >
                  {["Stone", "Olive", "Black", "White", "Blue"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Brand (optional)
                <input
                  value={form.brand}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, brand: e.target.value }))
                  }
                />
              </label>
              <label>
                Original price (USD)
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, price: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className="upload-button">
              <Plus size={15} />
              {form.image
                ? "Image added · choose another"
                : "Add photo (optional)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) =>
                  upload(e.target.files?.[0], (image) =>
                    setForm((v) => ({ ...v, image })),
                  )
                }
              />
            </label>
            <small>No photo? We’ll use a local garment illustration.</small>
            <button className="button primary" type="submit">
              Add to my wardrobe <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
