# Lifelike preview authoring

The new standing-idle work is staged under ignored `.avatar-source/lifelike/`. The active preview manifest changes only after all five individual garments and eight combinations pass review. Successful exports, an intersection test or an FPS reading do not approve the release.

## Reproducible stages

Use the pinned Blender 4.5.3 and original MakeHuman sources described in `avatar-integration.md`. Run each Blender script with `--background --factory-startup --python-exit-code 1 --python SCRIPT`.

1. `scripts/build-lifelike-human.py` creates `human.blend`, the self-contained `human.glb` and source/version hashes. It retains CC0 facial units, authored breathing/gaze keys, relaxed arm/finger poses and planted-foot controls. Facial units come from Mika Suominen's official CC0 `faceunits01` pack. The archive hash is recorded in `human.json`.
2. `scripts/author-lifelike-panels.py` creates editable assembled front/back panels with seam markings, revised leg sampling and fixed product dimension targets. It removes artificial intersecting folds and the earlier body-dependent clearance projection. Missing construction remains estimated, and operator pattern approval remains outstanding.
3. `scripts/check-garment-panels.py` rejects nonadjacent rest-triangle intersections after seam welding. Its report explicitly limits coplanar coverage.
4. `scripts/bake-lifelike-capsule.py -- --case N` runs the garment or layered combination separately under gravity with animated body, self and inner-layer contact. It records estimated per-vertex mass derived from target area density. These are draft solver coefficients, never calibrated material evidence. Raw caches are source-hash bound. Keys store inverse-skinned deformation to avoid double-applying skeletal movement.
5. `npx tsx scripts/check-lifelike-assets.ts PATH --collisions --report PATH` evaluates the actual exported GLB. It checks clip timing, relaxed hands, planted feet, head movement, blink closure and bound cloth morph tracks. Signed vertex clearance sampling is a diagnostic with explicit limits; it is not a complete triangle collision proof.
6. `scripts/render-lifelike-review.py -- PATH.blend --views` renders front/side/back phase samples. `--movie` renders the full loop; `--face` selects the facial close-up. Review full animation as well as stills.
7. `scripts/publish-lifelike-capsule.py` requires all thirteen asset-hash-bound `review.json` approvals, loop checks and exported diagnostics before changing the active manifest. Reviews must cover front, side, back and the complete loop. Physical fit always remains unvalidated in this workflow.

`/review-lifelike` is a development-only inspection page. Its local review assets are ignored and unavailable in production. It supports seeking, open-eye/blink inspection and measured foreground-browser FPS. The main app retains its existing persistent camera/clock, offscreen/background pausing and reduced motion. Personal scans retain their fixed-pose path.

## Evidence and limits

The staged human GLB was evaluated with Three.js: 12-second clip, both blink keys reach 1, maximum sampled foot drift below 0.001 mm and head movement about 9.4 mm. Browser inspection confirmed visible pupils and closed eyelids. These are animation checks, not anatomical or personal-fit validation.

Development human-only review measured approximately 60 FPS at a 1280×720 viewport on an Intel Core i5-1135G7 / Intel Iris Xe desktop browser. This is an initial observation, not an approved complete-capsule performance benchmark. Physical mobile hardware testing remains outstanding.

Failed cloth candidates are retained locally for diagnosis and must not be published. In particular, the initial first-outfit bake had large stretch, penetration and an unclosed loop. No review approval is inferred from its file existing. Garment samples, fabric tests and wearer trials are separate release gates for personal fit.

See `clothtransformer-assessment.md` for the researched learned-simulator option. No ClothTransformer checkpoint or generic dataset garment is substituted for these exact products.
