# Accurate garment fitting workflow

The software supports a fixed-pose research → authored pattern → simulation → physical-validation workflow. **No physically validated garments, reconstructed product patterns, participant scans or trial results ship with this repository.** Research records cannot be used as simulation assets. They deliberately contain no invented finished dimensions.

## Current research and first milestone

Run `npm run body:research` to inspect `infra/body/research/products.json`. The initial US candidates are UNIQLO Crew Neck T-Shirt (displayed SKU 489929, white 00), Chino Pants (482880, navy 69), and Chambray Overshirt (482452, blue 67). Sources were retrieved on October 17, 2026, Vancouver time. Their product pages supplied composition, construction descriptions, images and size labels, but the retrieved pages did not expose verifiable finished measurement tables for all sizes. These are candidates awaiting sample availability and identity confirmation, not stocked or fitted product promises.

The [T-shirt's legacy URL](https://www.uniqlo.com/us/en/products/E422992-000/00?colorDisplayCode=00&sizeDisplayCode=002) now displays several newer IDs. Check the actual sample label before adopting its data. The [trousers](https://www.uniqlo.com/us/en/products/E482880-000/00?colorDisplayCode=69) and [overshirt](https://www.uniqlo.com/us/en/products/E482452-000/00) also need size-specific sample confirmation. Do not substitute another region, color, season or product revision without a new evidence record.

The initial trial targets S/M/L tops and overshirts, and 30inch/32inch/34inch trousers; these are experimental targets, not validated supported sizes. Edit the coverage declaration before recruiting if samples are unavailable. Broader online size-label lists do not automatically expand validated coverage.

## Evidence and garment manifests

`lib/body/garment.ts` is the authoritative version-2 schema. `npm run body:garment-schema` regenerates the JSON schema; cross-field checks still run in Zod during registration.

For every supported size, record finished dimensions with a value, uncertainty, unit, convention, origin, method and source index. `flat-width` is doubled only when converting to a circumference; arbitrary lengths cannot become girths. Body charts, physically validated body ranges, garment dimensions and preferred dimensional ease have separate fields. Do not copy a nominal 32-inch size label into a finished waistband measurement.

Tops require chest, shoulder, sleeve, upper-arm and length dimensions. Trousers require waist, hip, thigh, inseam and rise dimensions. Front/back garment rise and body crotch length use different paths: record the method explicitly, and do not compare vertical waist-to-crotch height with a curved seam measurement. `rise` is available for independently measured values but is not automatically extracted from the scan.

Authoring also requires exact product/variant identity, sources, reviewed editable patterns, calibration records, arrangement version and validation coverage. Estimated manifests must use both `evidence.validated=false` and `validation.status="estimated"`. Missing critical dimensions block registration. Legacy version-1 records remain readable for appearance previews, but cannot produce validated recommendations.

Obtain samples and authoring rights outside this application. Research-only records do not purchase samples or license images/patterns. [UNIQLO's guide](https://faq-us.uniqlo.com/articles/en_US/FAQ/How-to-Measure) distinguishes body from product measurements. Fabric composition is an initial clue; [CLO's fabric workflow](https://support.clo3d.com/hc/en-us/articles/360041074334-Fabric-Kit-Manual) measures mechanical properties separately.

## Editable pattern and fabric authoring

The operator reconstructs actual panels and seams from licensed patterns or measured samples. This implementation does not claim to recover unseen sewing patterns from catalog photos automatically.

Store one editable JSON bundle per pattern version: `{ "version": 1, "sku": "actual SKU", "sizes": { "actual size label": { ...pattern... } } }`. Each size pattern contains:

- `version`, `sku`, `size`, `units:"m"`, `upAxis:"y"`, `referenceAnchor:[x,y,z]`, and an optional RGBA `color`.
- `vertices` as metric XYZ coordinates in an initial A-pose arrangement, and triangular or quad `faces`. Refine the actual panel topology before calibration; the importer does not invent a tessellation.
- `seams:[{a:[vertex indices],b:[vertex indices],approvedEaseM:0}]`. Corresponding paths must have matching counts and lengths within declared tolerance/easing. Loose connecting edges become Blender sewing springs.
- `grainDirection`, `constructionNotes`, `closure:"open"|"closed"`, and `dimensionChecks:[{dimension:"chest",paths:[[vertex indices]],circumference:true}]`. Paths sum to the measured dimension after unit/convention conversion. Cover every critical dimension. Author the intended collar, cuffs, pockets, openings and closure geometry in the mesh.

The reference arrangement uses +X toward the reviewed right shoulder, +Y upward and +Z forward. The torso anchor is chest center for tops/overshirts and waist center for trousers. The worker rotates/translates this arrangement rigidly into the reviewed body frame. It never changes garment size. Substantially different arm poses or difficult anatomy require a revised operator arrangement or a new capture.

The calibration JSON contains `calibrationId`, `version`, and `blenderCloth` with `tension_stiffness`, `compression_stiffness`, `shear_stiffness`, `bending_stiffness`, `mass`, `sewing_force_max`. These are **Blender coefficients calibrated for this topology**, not a direct conversion of fiber percentages into physical accuracy. In particular, Blender mass is per vertex; retessellation requires recalibration. Preserve fabric measurements and calibration observations in this record.

Manifest `fabric.properties` stores positive lower/upper intervals: warp/weft measured stretch ratios at the recorded test load, bending response, density in kg/m², thickness in meters and calibrated Blender friction. Record test loads/methods in the calibration source. The sensitivity runs perturb nominal solver coefficients relative to these intervals; their lower/nominal/upper combinations are exploratory estimates, not exhaustive uncertainty bounds or a validated anisotropic textile model. Material shading remains operator-authored; the simple importer provides a base color and does not reconstruct photographic textures.

Create a library with the worker's Blender environment:

```sh
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python workers/body/author.py -- manifest.json M patterns.json calibration.json m.blend
```

Authoring checks identity, dimensions, seam lengths, metric units, and fabric version before saving. Libraries include pattern/calibration/arrangement stamps checked again during simulation. Upload size libraries and JSON evidence under immutable private `garments/` keys, then run:

```sh
npm run body:register-garment -- path/to/manifest.json
```

Registration checks source bundles, calibration identity, required objects and physical trial reports when claiming validation. Bump the garment version for every evidence/asset change, and independently bump changed pattern, fabric or arrangement versions. Existing version keys must never be overwritten in object storage. Registration of a new version does not erase old objects; apply the existing private-storage retention policy.

## Scan review, simulation and user results

Apply the additive schema with `npm run body:setup` before deploying the new worker/API. It adds nullable try-on diagnostics. Existing records remain readable. Owners can request garment landmark review of a ready scan; this clears extracted/corrected measurements and invalidates prior results while retaining the display mesh for operator review.

Operators select front/back torso points at matching section heights, confirm scale, A-pose, coverage and close-fitting capture clothing. Version-2 simulation requires this review and the relevant torso anchor pair. Optional left elbow/wrist, upper-arm and thigh surface points support additional measurements. All automatically extracted measurements remain unvalidated and over capture clothing. Manual user corrections also remain unvalidated.

For independently checked, non-clothing tape measurements, an authorized local operator can use `npm run body:validate-measurements -- private-report.json`. The report contains `scanId`, `bodyVersion`, `operator`, `source:"independent-tape"`, `measuredAt`, an immutable private `studyKey`, and `values` keyed by measurement name, each `{value,uncertainty,overClothing:false}` in meters. The referenced study must contain a passing measurement gate with at least 12 participants and pass every supplied dimension. The command preserves scan-derived originals, records validated values separately with an audit event, increments body version and invalidates old jobs. It does not promote the scan algorithm itself to validated. Store the report outside Git and keep operator database/storage credentials private.

The worker solves every selected garment independently and the complete outfit, each at lower/nominal/upper fabric scenarios, within one shared 20-minute task budget. Every solve checks settling, body penetration and triangle intersections; layered runs check garment intersections. A failed scenario prevents publication. The published GLB is the nominal layered result.

Diagnostics record movement, edge strain and nearest-section clearance in coarse chest/waist/hip bands. These are geometric signals, not anatomical pressure maps or comfort predictions. The app labels all simulated images estimated and compares candidate sizes using validated body coverage and declared ease intervals. Unknown, over-clothing, ambiguous or out-of-coverage evidence withholds recommendations. No geometry/diagnostics enter localStorage or stylist prompts. Invalidation/deletion clears database diagnostics alongside result references.

## Physical trial and release

Recruit at least 12 consenting adults spanning supported proportions. Collect repeated scans and independent measurements; perform blinded individual and layered fittings with front/side/back assessment. Cover every size with at least three distinct participants; all required configurations need at least 12 participants per garment. Keep consent records, imagery and observations outside Git.

The CSV includes `participant,repeat,dimension,predicted_m,reference_m,predicted_size,reference_size,garment_id,configuration,front,side,back,blinded`. Use exact SKU as `garment_id`, `individual` or `layered` configuration, `pass`/`fail` appearance cells and `true` for blinded observations. A fitting copied beside several dimensions is counted once. Run:

```sh
python workers/body/evaluate.py pilot-data/trial.csv infra/body/research/trial-coverage.json
```

The report checks median absolute error ≤1 cm and 95th percentile ≤2 cm for every required dimension, ≥90% size agreement, missing garments/sizes/configurations and appearance outcomes. A passing report is evidence for operator review, not an automatic release or generalization guarantee. Registration of validated assets additionally requires sample-calibrated fabric, measured critical dimensions, sample IDs, explicit body-range coverage and subgroup review. Device performance and subgroup/repeatability review remain external release gates.

Run `npm test`, `npm run typecheck`, `npm run build`, and `python -m unittest discover -s workers/body -p 'test_*.py'`. Geometry tests skip explicitly when Open3D/trimesh are absent. Blender authoring/simulation, licensed real garment patterns, storage/worker deployment, real participant trials and browser/device visual checks require their actual environments; passing synthetic tests cannot replace them.
