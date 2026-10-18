# FORM — Personal Style Studio

A minimal, chat-first fashion shopping prototype built with Next.js, React, TypeScript, Three.js, React Three Fiber, and Drei. Describe an occasion, style, and budget; receive three outfit suggestions; inspect individual pieces; and refine the looks in the same conversation.

## Run

Requires Node.js 20.9 or newer and npm.

```sh
npm install
npm run dev
```

Open http://localhost:3000.

On Windows PowerShell, if script execution is disabled, use `npm.cmd install` and `npm.cmd run dev` instead. This does not require changing your execution policy.

For a production build:

```sh
npm run build
npm start
```

## Gemini setup

Copy `.env.example` to `.env.local`, then set `GEMINI_API_KEY` to a key from [Google AI Studio](https://aistudio.google.com/apikey). Restart the development server after changing it. The default model is `gemini-3.8-flash`; override `GEMINI_MODEL` if your project needs another compatible model. The key stays on the server and must never use a `NEXT_PUBLIC_` prefix. No database is required. Gemini usage is subject to your Google project's quota and billing.

The chat calls the [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/get-started?lang=javascript) through `POST /api/chat`. It includes the latest 24 transcript messages, the current style profile, selected outfits, wardrobe IDs, and catalog text metadata. Body scans, inspiration images, and product image data are excluded. Requests use `store: false` to disable Interactions conversation storage; Google's other applicable data handling terms still apply. Your browser retains the transcript locally.

Without a key, the chat shows a setup message. API failures preserve your outfits and restore your message for retry; they do not silently fall back to keyword matching.

## Try the conversation

1. Ask “Back to school under $100.” Three illustrated outfit cards appear directly beneath the stylist's response, with calculated USD purchase totals.
2. Open a card for an expanded outfit. Hover, tap, or keyboard-focus a piece to see its product information, retailer collection link when available, and fit limitations. Read the styling note to understand the combination.
3. Ask “Keep the pants in outfit two but replace the jacket.” The pants stay in place while an available jacket alternative changes the outfit and total.
4. Ask “Make all three more affordable.” The stylist looks for lower-priced pieces while preserving previously kept categories. If the available catalog cannot meet the budget, the reply explains that limitation.
5. Open a look and use its refinement action, or refer to an outfit number in chat. Ambiguous requests ask which outfit to update. The selected outfit appears above the composer and can be cleared.
6. Save a look from its expanded view. Saved looks are available in a collapsed section below the composer. Refresh to restore the conversation, outfit snapshots, and saved looks.

Press Enter to send a message or Shift+Enter for a new line. Start a new chat with the header action; saved looks remain available. The optional illustrative 3D preview is inside outfit details.

## Behavior and limitations

- **Gemini stylist:** understands natural-language requests and follow-ups using recent chat history and your style profile. It can ask clarifying questions, generate three looks, select a look, and refine catalog pieces. Structured replies are validated on the server; unknown products and changes to locked or owned pieces are rejected. Ownership and purchase totals are derived from catalog/session data. The original deterministic engine remains for initial demo data and regression tests.
- **Catalog:** thirty representative clothing concepts with local SVG illustrations and estimated USD prices. Totals exclude tax and shipping; previously owned pieces have zero purchase cost. These are not live inventory, discounts, or verified exact retailer SKUs.
- **Product links:** official collection pages are clearly labeled as browsing destinations, not exact product matches. Category destinations were checked on October 17, 2026. Concepts without an appropriate destination have no shopping link. Supplied external links are unverified and restricted to HTTPS without embedded credentials.
- **Product evidence:** materials, exact size guides, garment measurements, and customer fit reviews are unavailable for these demo items. Names and illustrations do not establish those facts. Confirm exact product details with the retailer before buying.
- **Fit and 3D:** the default mannequin illustrates proportions and colors. An optional, disabled-by-default private LiDAR pilot adds scan imports, companion iOS depth-capture source, operator review, measurements and background garment simulation. It requires configured storage/workers and actual authored garment assets. No physical accuracy trial or validated garment assets are included. See the [LiDAR pilot setup and limitations](docs/lidar-pilot.md).
- **Garment fitting workflow:** exact-product research records, versioned pattern/fabric evidence, size-specific authoring checks, rigid arrangement, individual/layered simulation and physical-validation gates are described in [garment fitting](docs/garment-fitting.md). Initial products remain research-only until measurements, authored assets and real trials are supplied.
- **Persistence:** browser-local storage with no account or device sync. Existing profile, wardrobe, custom products, saved looks, and scan settings are preserved from older sessions. Only the latest outfit set can be recovered into an older conversation that did not store historical outfit snapshots. The current interface focuses on chat and outfit inspection rather than separate wardrobe/profile/scan screens.
- **Shopping:** browsing only; no checkout, purchases, retailer API, or Pinterest integration. The small catalog emphasizes casual trouser-based silhouettes and cannot satisfy every budget or styling request.

Loading and error feedback stay within the conversation. Outfit details support keyboard interaction, Escape dismissal, and returning focus to the invoking control. Reduced-motion preferences are respected.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover styling and budget arithmetic, conversational outfit targeting and refinements, preserved items and historical snapshots, defensive persistence, product disclosure, category destinations, and unsafe link rejection. Browser verification should exercise generation, expanded details, hover/tap/keyboard inspection, refinement, saving, refresh persistence, and desktop/mobile layouts.

## Code map

- `app/page.tsx`: chat interface, conversation state, local persistence, and saved looks.
- `app/api/chat/route.ts`: bounded, validated server endpoint with safe API errors.
- `lib/gemini.ts`, `lib/chat-schema.ts`: Gemini context, structured replies, and catalog-backed outfit validation.
- `lib/conversation.ts`: conversational targeting, clarification, and refinement rules.
- `lib/agent.ts`: outfit generation, alternatives, and price arithmetic.
- `lib/catalog.ts`, `lib/types.ts`, `lib/product-info.ts`: catalog data, types, and honest product/fit disclosures.
- `lib/storage.ts`: defensive session restore and older conversation recovery.
- `components/OutfitCard.tsx`, `components/OutfitDetail.tsx`: inline cards and expanded outfit inspection.
- `components/Avatar.tsx`, `components/FlatAvatar.tsx`: illustrative 3D view and illustrated fallback.
- `app/globals.css`, `components/outfits.css`: responsive styling.
- `generate-assets.cjs`: rebuild local garment SVGs with `node generate-assets.cjs`.

## Live voice stylist

ElevenAgents voice controls share the Gemini shopping flow and outfit updates. See [voice setup](docs/voice-setup.md) for agent configuration, environment variables, trial verification, and live-call checks.
