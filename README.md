# Mirra — Your personal style, reflected

A voice and text styling studio: three capsule looks, two animated human models, local garment swaps, conversational refinements, and researched product pages.

## Run the demo

Requires Node.js 20.9+ and npm. All runtime model assets are committed; Blender and ignored authoring downloads are **not** required to run the app.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000. For development use `npm run dev`. In PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`; no policy change is necessary.

Fresh sessions start in **Sample** mode, which works without credentials and makes no Gemini requests. Use the example buttons for supported scripted interactions. Selecting looks, inspecting pieces, model switching, and button-based swaps are local in either mode. Sample is explicitly scripted, not unrestricted AI.

For live styling copy `.env.example` to `.env.local` and configure `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default `gemini-3.5-flash-lite`). Select **Live AI**. This small capsule uses low thinking and a validated structured response; see [Google thinking controls](https://ai.google.dev/gemini-api/docs/thinking). The previously configured 3.8 Flash repeatedly timed out during overnight checks; 3.5 Flash Lite returned three validated looks in 2.6 seconds in the diagnostic. Existing environment overrides take precedence, so update GEMINI_MODEL when using an older local configuration. Keys remain server-side. Local worktrees can initialize a missing `.env.local` from the primary checkout with `npm run dev`; existing settings are preserved. Deployments must set their own environment variables.

Voice always uses live ElevenLabs, including in Sample mode. Configure `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`, allow microphone access, and follow [voice setup](docs/voice-setup.md). Voice and text share the same validated outfit-update path. Sample voice still consumes ElevenLabs usage; it does not consume Gemini usage. No billing changes are made by this app.

## Recording walkthrough

1. Open the production server at a desktop viewport, preferably 1440×1000. Show Mirra and the idle human.
2. Select Live AI and say or type “Create three casual outfits under $60.” For a predictable rehearsal select Sample and use its casual-outfit example instead.
3. Browse the three looks, then select Look 1.
4. Say or type “Keep the pants in look one, but switch its top to the black tee.”
5. Switch Model 1 / Model 2, rotate the human, and inspect a clothing piece.
6. Open **View entire researched outfit**. Show the estimated total and individual retailer links. **Open all product pages** attempts distinct HTTPS destinations; browsers can block multiple tabs, so individual links remain available.

Do not present a Sample rehearsal as a live AI demonstration. See [overnight progress](docs/mirra-overnight-progress.md) and [visual review](docs/mirra-visual-review.md) for exact verification and outstanding limits.

## Behavior and scope

- The demo supports five researched UNIQLO product/color variants, eight outfit combinations, and five individual previews on each independently generated model. Model selection is a visual preference and does not infer gender or change styling preferences.
- Gemini receives the latest eight turns, current preferences, selected outfits, and supported product metadata. Structured responses are validated against catalog identity, locked garments, ownership, and totals. Requests use `store: false`; provider terms still apply. Browser history stays in local storage without account/device sync.
- Quota failures preserve the current look. Only an explicit short provider retry delay permits one automatic retry; daily exhaustion is not retried. Retry and Sample mode remain available.
- Prices are estimates in USD, excluding tax/shipping. Retailer pages establish researched item/color identity, not current availability or guaranteed price. Some variants are sold out. No substitutions, purchases, checkout, new retailers, or search/discovery service are included.
- Both human appearances use CC0 MakeHuman assets, independently fitted CC0 clothing construction templates, a restrained skeletal idle, and facial morphs. Clothing is an **appearance approximation**, not an exact retailer sewing pattern, physical cloth simulation, personal body scan, or validated fit. Neutral studio sneakers are scenery and are not a researched shopping item. Sources, licenses, and hashes are retained alongside runtime assets and in [asset authoring](docs/mirra-assets.md).
- Reduced-motion preferences pause the idle. WebGL failure preserves product access. Model choice, mode, looks, and conversation restore locally; existing storage keys are retained for compatibility.
- The older private body/garment pilot remains in the repository but is removed from the main demo. Its infrastructure and validation requirements are described in [LiDAR pilot](docs/lidar-pilot.md) and [garment fitting](docs/garment-fitting.md).

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover structured styling, targeting and kept/owned items, budgets, history, safe links, quota handling, scripted Sample behavior, and complete self-contained runtime model assets. Visual acceptance additionally requires actual browser inspection; passing tests alone does not approve anatomy, clothing, or animation.

The development-only `/review-mirra` page provides exact-asset views and animation phase controls. It is unavailable in production.

## Code map

- `app/page.tsx`: studio, conversation, modes, local persistence.
- `components/OutfitStudio.tsx`: model selector, product inspection, swaps, outfit shopping.
- `components/Avatar.tsx`, `components/SampleHuman.tsx`: viewing orientation, animation clock, skinned model loading.
- `lib/avatar-models.ts`, `public/models/mirra-manifest.json`: model-specific preview identity and cache hashes.
- `lib/sample-stylist.ts`: scripted examples without provider requests.
- `lib/gemini.ts`, `lib/chat-schema.ts`, `lib/gemini-quota.ts`: bounded live generation, validation, safe quota diagnostics.
- `components/VoiceStylist.tsx`: ElevenLabs connection, shared styling tool, microphone/cancellation handling.
- `lib/capsule-products.ts`, `docs/animated-capsule-research.json`: supported catalog and original retailer evidence.
