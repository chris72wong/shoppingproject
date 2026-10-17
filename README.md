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

No environment variables, credentials, accounts, database, or paid services are required.

## Try the conversation

1. Ask “Back to school under $100.” Three illustrated outfit cards appear directly beneath the stylist's response, with calculated USD purchase totals.
2. Open a card for an expanded outfit. Hover, tap, or keyboard-focus a piece to see its product information, retailer collection link when available, and fit limitations. Read the styling note to understand the combination.
3. Ask “Keep the pants in outfit two but replace the jacket.” The pants stay in place while an available jacket alternative changes the outfit and total.
4. Ask “Make all three more affordable.” The stylist looks for lower-priced pieces while preserving previously kept categories. If the available catalog cannot meet the budget, the reply explains that limitation.
5. Open a look and use its refinement action, or refer to an outfit number in chat. Ambiguous requests ask which outfit to update. The selected outfit appears above the composer and can be cleared.
6. Save a look from its expanded view. Saved looks are available in a collapsed section below the composer. Refresh to restore the conversation, outfit snapshots, and saved looks.

Press Enter to send a message or Shift+Enter for a new line. Start a new chat with the header action; saved looks remain available. The optional illustrative 3D preview is inside outfit details.

## Behavior and limitations

- **Local stylist:** a deterministic rule engine, not an LLM or image-understanding model. It supports selected occasion/style phrases, budgets, item replacements, kept categories, lower-priced alternatives, and styling explanations. Unsupported changes receive a limitation message. Responses and recommendations are computed locally without external model calls.
- **Catalog:** thirty representative clothing concepts with local SVG illustrations and estimated USD prices. Totals exclude tax and shipping; previously owned pieces have zero purchase cost. These are not live inventory, discounts, or verified exact retailer SKUs.
- **Product links:** official collection pages are clearly labeled as browsing destinations, not exact product matches. Category destinations were checked on October 17, 2026. Concepts without an appropriate destination have no shopping link. Supplied external links are unverified and restricted to HTTPS without embedded credentials.
- **Product evidence:** materials, exact size guides, garment measurements, and customer fit reviews are unavailable for these demo items. Names and illustrations do not establish those facts. Confirm exact product details with the retailer before buying.
- **Fit and 3D:** the optional mannequin illustrates proportions and colors. It does not simulate cloth, capture a body, infer size, or predict how clothing fits a person. There is no real camera, LiDAR, or depth-sensing flow. See the [real garment fit roadmap](docs/fit-roadmap.md) for the required capture, SKU evidence, validation, and privacy work.
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
- `lib/conversation.ts`: conversational targeting, clarification, and refinement rules.
- `lib/agent.ts`: outfit generation, alternatives, and price arithmetic.
- `lib/catalog.ts`, `lib/types.ts`, `lib/product-info.ts`: catalog data, types, and honest product/fit disclosures.
- `lib/storage.ts`: defensive session restore and older conversation recovery.
- `components/OutfitCard.tsx`, `components/OutfitDetail.tsx`: inline cards and expanded outfit inspection.
- `components/Avatar.tsx`, `components/FlatAvatar.tsx`: illustrative 3D view and illustrated fallback.
- `app/globals.css`, `components/outfits.css`: responsive styling.
- `generate-assets.cjs`: rebuild local garment SVGs with `node generate-assets.cjs`.
