# FORM — Personal Style Studio

A local, API-key-free fashion shopping prototype built with Next.js, React, TypeScript, Three.js, React Three Fiber, and Drei.

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

## Demo journey

1. Select **Build my first look**, then ask for “Back to school under $250.”
2. Try “Keep everything under $100.” Three complete looks update with calculated totals.
3. Select **Try it on**, then **Create my digital twin**. The scan runs for five seconds; skip, cancel, and replay are available.
4. Drag the mannequin to rotate it, scroll to zoom, and switch outfits to change garment colors and layers.
5. Swap an item or ask “I like the pants, but replace the jacket.” Other items stay in place and totals recalculate.
6. Save a look. Add a wardrobe piece, then use **Style this piece** or **Style my wardrobe**. Owned pieces have zero purchase cost.
7. Change your style profile, upload and tag inspiration, and refresh. The profile, scan settings, conversation, wardrobe, current looks, and saved looks persist.

## What works

- Responsive editorial landing page and five navigable areas.
- Thirty seeded catalog items, local SVG garment illustrations, three outfit suggestions, actual price arithmetic, feasible budget optimization, per-item alternatives, and seeded price comparisons.
- Deterministic natural-language rules for budgets, several occasions/styles, weather layering, item replacement, cheaper alternatives, and owned-item reuse.
- Interactive, locally constructed 3D mannequin, approximate proportions and fit controls, scan progress, outfit changes, and illustrated fallback for unsupported WebGL.
- Saved looks, editable wardrobe with optional image upload, inspiration uploads and manual tags, style feedback weighting, and local persistence with malformed-data recovery.
- Keyboard-accessible forms, modal focus management and Escape, reduced-motion styling, and notifications.

## Honest boundaries

- **Scan:** entirely simulated. No camera, LiDAR, depth sensing, body capture, or accurate measurements. Editable measurements are demo values.
- **Try-on:** stylized local mannequin with simplified colored garment geometry. It does not simulate cloth, infer size, or predict actual fit. Custom clothing photos do not become 3D garments.
- **Stylist:** a local rule engine, not an LLM or image-understanding model. It recognizes supported phrases and retains a style profile; unconstrained requests can fall back to curated templates.
- **Catalog:** USD demo prices, not live inventory or discounts. Most pieces are representative concepts, not verified exact retailer SKUs. Product cards link to verified retailer collections and clearly say “Browse retailer.” Garment images are local illustrations, not retailer product photography. Taxes and shipping are excluded.
- **Shopping:** browsing only; no checkout, carts, purchases, retailer API, or Pinterest integration.
- **Persistence:** browser-local, no account or device sync. Images use local storage; large collections can exceed browser storage limits and will show an error.
- **Assets:** optional Google Fonts and Unsplash hero image need internet. System fonts and an illustrated hero fallback keep the experience usable without them. Garment illustrations and the mannequin are local.
- The catalog currently centers on a small range of casual trouser-based silhouettes. Wardrobe gap advice is heuristic.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Logic tests cover catalog validity, budget parsing and feasibility, distinct complete looks, owned-item costs, style changes, replacement arithmetic, malformed persistence, category detection, color exclusions, and weather layers. Browser checks cover the main demo path, wardrobe add/remove and refresh persistence, and desktop/mobile layout.

## Code map

- `lib/catalog.ts`, `lib/types.ts`: typed product and application data.
- `lib/agent.ts`: deterministic styling and price logic.
- `lib/storage.ts`: defensive local-session restore.
- `components/Avatar.tsx`: isolated local 3D viewport and WebGL fallback.
- `components/FlatAvatar.tsx`: asset-independent illustrated outfit fallback.
- `app/page.tsx`: shared application state and interactive screens.
- `app/globals.css`: responsive visual system.
- `generate-assets.cjs`: rebuild the local garment SVGs with `node generate-assets.cjs`.
