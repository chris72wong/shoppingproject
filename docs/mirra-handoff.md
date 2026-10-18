# Mirra demo handoff

## Start

```sh
npm ci
npm run build
npm start
```

Use http://localhost:3000 in a fresh checkout. This overnight workspace also runs a production preview at http://127.0.0.1:3001. All 26 runtime assets are committed; no Blender/source downloads are needed to run the demo. Sample mode needs no credentials. Live AI needs the ignored server environment; voice additionally needs ElevenLabs credentials, a configured blocking consult_stylist client tool, and microphone permission.

## Suggested 60–90 second recording

1. **0–10s:** show the Mirra wordmark and animated Model 1, full body in frame. At 1440×1000, model, outfit, products and composer fit together.
2. **10–25s:** select Live AI, click Talk to your stylist, allow microphone, request “Create three casual outfits under $60.” Wait for actual generated looks and concise spoken confirmation. For rehearsal, use Sample plus its first example button; clearly distinguish this from live AI.
3. **25–40s:** browse Look 2 and Look 3, return to Look 1, then request “Keep the pants in look one, but switch its top to the black tee.” Show unchanged navy pants and updated total.
4. **40–55s:** switch Model 1/Model 2 and rotate the human. Both appearances preserve outfit identity. Add blue overshirt locally if desired.
5. **55–70s:** select a piece, inspect it, return to the full look, then open View entire researched outfit.
6. **70–90s:** show item links and the estimated total; open a researched product page. Open-all is browser-dependent, with individual links always available.

If voice permission is unavailable, type the same request. Do not claim that a Sample rehearsal or typed Live AI request verifies live microphone audio.

## Verification evidence

- Independent visual review: [mirra-visual-review.md](mirra-visual-review.md).
- Independent production interaction/code review: [mirra-integration-review.md](mirra-integration-review.md).
- Actual Three.js animation measurements for all 26 hashes: [mirra-animation-verification.json](mirra-animation-verification.json).
- Desktop and narrow screenshots: [mirra-evidence](mirra-evidence/).
- Sources and regeneration: [mirra-assets.md](mirra-assets.md).

## Verified integrations and remaining limits

- Final production Gemini 3.5 Flash Lite generation and refinement pass: three looks, then unchanged olive pants with a black tee and correct $44.80 total. The lighter model with low thinking replaced repeatedly timing-out 3.8 Flash; update an older GEMINI_MODEL override before recording.
- ElevenLabs token service returned 200. Hosted agent has the blocking consult_stylist client tool with a message parameter. Its prompt was renamed to Mirra while preserving tools and greeting. A live text-only conversation called that tool, generated three outfits through the production Gemini endpoint, and accurately confirmed the result. See mirra-voice-transport-verification.json.
- Live spoken microphone round-trip is **unverified** in the automated browser: permission remained pending. The app times out cleanly and keeps typed styling usable. Perform a short microphone/voice check on the recording browser before recording.
- Sample generation/refinement, both models, individual inspection, shopping, kept garments, history and refresh were rehearsed against the production build. Sample does not call Gemini. Provider failure and quota handling are covered with mocked requests; no intentional live quota exhaustion was attempted.
- Product destinations match the five researched item/color variants. Prices remain estimates; some items/sizes are sold out, including blue overshirt M. The app does not substitute another product silently.
- Clothing is an appearance approximation fitted to each sample body; no exact retailer patterns, personal sizing or physical fit are verified. Neutral sneakers are not a shopping item.
- Browser-local history is shared across tabs on the same origin. Mode/model are also local preferences, with no account sync.
- A quiet continuation heartbeat could not be created because automatic review rejected it as a duplicate. No duplicate was created. Active implementation continued directly.

## Publication

Final tested commit and remote verification are recorded in the completion message and overnight progress log. Publication uses a normal push to origin/master after fetching and integrating teammates' changes; no force push is used. No secrets, caches, Blender executable, or source archives belong in the commit.

## Completion checklist

- [x] Mirra branding and requested UI simplification; Sample/Live modes; entire-outfit shopping.
- [x] Both independent models, all 26 exact previews and full-cycle playback samples accepted; no P1/P2 visible asset defect.
- [x] 81 tests, TypeScript and production build pass; desktop/narrow production rehearsal, camera direction, rapid model switching and live typed refinement pass.
- [x] Live ElevenLabs styling-tool -> Gemini -> accurate confirmation verified through text-only transport.
- [ ] Microphone audio/spoken round-trip: recording-browser verification still required because permission remained pending in automated browser.
- [ ] Continuation heartbeat: automatic approval rejected creation as a duplicate; no duplicate was created. Implementation proceeded directly and does not need another worker.

Minor close-up neck/material polish and unvalidated physical fit are documented. No further automatic provider testing is needed after delivery.
