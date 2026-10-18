# Animated sample human and product-specific drafts

The studio renders a textured MakeHuman CC0 male body with separate garment meshes, one 53-joint game_engine skeleton and an eight-second `FORM_Idle` loop. Personal scans keep their existing fixed-pose workflow. The body export uses opaque skin/eyes, cutout hair/brows, higher-resolution skin, subdivision smoothing, teeth and tongue. Viewer shadow bias avoids the diagonal shadow acne visible in the previous version.

Source: [MakeHuman system CC0 assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), [output licensing](https://static.makehumancommunity.org/makehuman/faq/can_i_sell_models_created_with_makehuman.html). Pinned MPFB revision, source/archive hashes and body output hash are in `public/models/sample-human.provenance.json`. The CC0 redistribution notice is beside the asset. The old Rocketbox binary is retained for historical compatibility but is not rendered.

## Drafts explicitly authorized

The user authorized clearly labeled product-specific drafts after the earlier verified-model-only requirement. The manifest now has separate `blocked`, `draft` and `ready` states. **Draft does not mean validated fit.** Ready status still requires verified dimensions and full collision/visual approvals. All current dimensionsVerified, idleCollisionChecked and visualReviewPassed flags remain false.

Five draft entries cover UNIQLO US white crew tee 489929/00/M, black AIRism tee 493232/09/M, navy and olive chinos 482880/69 and /57 in 32inch with published 79 cm inseam, and blue chambray overshirt 482452/67/M. The research JSON records sources, retrieval date, product-ID revision warnings, material evidence and missing dimensions. Legacy retailer URLs can display newer IDs. Prices are estimates and inventory is not promised.

`scripts/build-draft-capsule.py` authors fixed-size garment geometry from the published dimension targets. Missing armscye, cuff, hem sweep, rise, crotch, collar and pocket patterns are estimated. Shirts use front/back panels and sleeve lofts; trousers have a continuous hip/crotch surface and two leg tubes. Weight transfer attaches all garments to the same body rig. The authoring report records estimates and rest-pose clearance corrections. Render-only body and hidden-garment masks prevent skin, waistband and undershirt poke-through under clothes; those masks do not prove physical fit or collision freedom. No offline cloth simulation or fabric calibration is claimed.

Thirteen self-contained GLBs provide five individual previews and eight combinations: two tops × two bottoms × optional overshirt. Every product set has a hash and matching avatar/rig version. Product names, source links and fixed sizes remain available in shopping details. Unknown historical looks show an unavailable state instead of unrelated garments. History is retained when first introducing capsule starter looks.

Generation/refinement is restricted to the five capsule IDs on the live server. Swaps stay within the capsule. Individual inspection and optional overshirt controls select the corresponding meshes. The persistent camera and shared elapsed clock survive outfit changes. Reduced motion, offscreen/background pausing, Play/Pause and Reset view remain available. No runtime garment scaling is used to force a fit.

## Rebuild and validation

Run Blender 4.5.3 with `--background --factory-startup --python-exit-code 1 --python scripts/build-sample-human.py`, followed by `scripts/build-draft-capsule.py` using the same arguments. The scripts read the pinned MPFB and system asset sources under ignored `.avatar-source/`. Editable `sample-human.blend` and `draft-capsule.blend` are saved there locally; tooling and Blend sources are not distributed in Git. Exported GLBs, manifests and authoring report are distributed.

Run `npm test`, `npm run typecheck` and `npm run build` after exports finish. Tests cover source hashes, separate body/garments, shared skin, embedded resources, seamless idle with stationary lower-body transforms, exact garment node mappings, capsule-only generation/swaps and rejection of drafts marked as validated.

Physical samples, missing pattern measurements, fabric tests, full-loop collision review, blinded fittings and documented desktop/mobile FPS benchmarks remain outstanding. The drafts communicate estimated appearance on this one sample body. They establish neither personal sizing nor comfort/pressure accuracy.
