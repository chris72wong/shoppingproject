# Private LiDAR pilot

This repository now contains the web/API flow, PostgreSQL schema and queue, private object storage integration, reconstruction/measurement worker, offline cloth worker, and Swift capture app source. The pilot is disabled by default. No real participant scans, licensed garment patterns, physical samples, calibration reports, or cloud credentials are included. The existing catalog remains illustrative.

## Start the development services

1. Install Node dependencies with `npm install`. Install Docker with Compose separately.
2. Add the `BODY_*` and `AWS_*` variables from `.env.example` to `.env.local` without replacing your Gemini configuration. Generate independent random credentials. Use `BODY_PUBLIC_ORIGIN=http://localhost:3000` for desktop imports. Native pairing requires an HTTPS origin reachable from the phone.
3. Generate a session secret and individual invitations with Node's crypto API. Example: `node -e "const c=require('node:crypto'); const code=c.randomBytes(32).toString('base64url'); console.log(JSON.stringify({code,codeHash:c.createHash('sha256').update(code).digest('hex')}))"`. Keep the code private. Put only its hash in `BODY_PILOT_INVITES`, with a stable pseudonymous `userId` and role `user` or `operator`. Operators use distinct accounts.
4. Start storage/database: `docker compose --env-file .env.local -f infra/body/compose.yaml up -d postgres objects`.
5. Run `npm run body:setup` to apply the additive schema and configure bucket CORS. On MinIO use `BODY_S3_ENDPOINT=http://localhost:9000`, `BODY_S3_PATH_STYLE=true` and matching root credentials. Use separate limited application and worker credentials for production.
6. Start workers: `docker compose --env-file .env.local -f infra/body/compose.yaml up -d --build worker`.
7. Set `BODY_PILOT_ENABLED=true`, restart Next.js with `npm run dev`, and open **Your body scan** above the outfit studio. Sign in with an invitation. A second operator login can review the capture in a separate browser profile.

Infrastructure is not automatically provisioned or deployed by the app. Production needs TLS, private database access, encrypted persistent volumes, an S3 bucket with no public policy, monitored workers, backup retention/deletion policies and restricted trusted garment authoring. Rotate invitations/session secrets to revoke sessions. Pilot sessions expire after eight hours; capture tokens after one hour. There is no public account registration.

## Import and data contracts

- GLB 2, with embedded binary buffers and embedded PNG/JPEG textures only. External URIs, extensions, nested resource bombs and oversized input are rejected before mesh import. PLY accepts ASCII and binary point clouds or meshes. Maximum uploaded size is 150 MiB; geometry is bounded to two million faces/vertices and processing to twenty minutes inside a container with a memory limit.
- Provide source app/version, export units (`m`, `cm`, `mm`), up axis (`y` or `z`) and independently measured height. Imports always remain `unverified-import`; a filename cannot prove LiDAR provenance. Height checks reject wrong units rather than rescale a body to match a typed height.
- Capture clothing must be close fitting. Extracted dimensions describe the captured surface, including clothing. The worker does not infer hidden unclothed anatomy, fill major holes, or turn an open section into a fabricated circumference. Point clouds use ball pivoting and require operator review.
- Output is metric, Y-up and grounded. Source display geometry/materials are retained where supported; a separate simplified mesh handles cloth collision. RGB-D produces vertex-colored surface geometry. The first pilot does not promise photographic facial detail or animation.

`BodyScan` versions advance on operator decisions and measurement corrections. Original measurements remain separate from corrections. Corrections are manual and unvalidated; old try-ons are cancelled. `FitAssessment` requires validated, non-clothing measurements and exact garment evidence, with the complete uncertainty interval inside exactly one size range. This worker deliberately never promotes its output to validated. A later calibrated algorithm version is required after the feasibility trial.

## Companion iOS app

The source is in `native/FormCapture`. On a Mac with Xcode and XcodeGen, run `xcodegen generate` in that directory, open the generated project, select your signing team, and build for a physical supported iPhone/iPad. Camera permission, deep links, portrait UI and the minimum OS target are declared in `project.yml`.

Choose **Pair iPhone / iPad** in the web panel and scan the QR with the iOS Camera app after installing FORM Capture. The deep link contains the HTTPS origin and a one-use pairing token valid for five minutes. The app exchanges it for a memory-only capture token. Capture tokens can create/finalize uploads, but cannot list scans, read assets, review or delete another session's data.

The assistant walks around a stationary user in an A-pose. Capture records 20–100 frames, at most twice per second, using scene depth and person segmentation rather than the environment mesh. Vision hips projected into world coordinates provide a motion check; full-body landmarks and four angular sectors guide coverage. These heuristics require physical-device validation and may reject drift or occluded poses. The cloud independently checks motion, coverage, depth confidence and scale. The UI's four-sector indicator is guidance, not an accuracy guarantee.

The ZIP contract has `manifest.json` with `schemaVersion:1`, `units:"m"`, `upAxis:"y"` and `frames`. Each frame references a JPEG RGB image, PNG person mask, row-packed little-endian float32 depth in meters, uint8 ARKit confidence, depth width/height, column-major depth-resolution 3×3 intrinsics, column-major ARKit camera-to-world 4×4 transform, world-space hip center and timestamp. Camera image/mask resize preserves their coordinate alignment. Temporary files use complete iOS file protection; they are deleted after success or next launch. Failed capture data can be discarded by starting a new scan.

This Windows environment cannot compile or run ARKit. Xcode build, real-device testing and TestFlight distribution remain deployment prerequisites.

## Operator review and garment authoring

The [garment fitting workflow](garment-fitting.md) defines the current version-2 authoring, registration, additional landmarks, independent measurement validation and physical-trial requirements. Version-1 garment records are migration inputs and cannot establish verified sizing.

Review the complete body surface, scale, capture pose and clothing. Choose a landmark, then click the mesh for chest/waist/hip section heights, both shoulders and crotch. Approve only a correctly segmented body. Reject unsuitable captures and request a rescan. The worker rejects open/ambiguous torso sections and landmarks away from the surface. The web review UI intentionally has no automatic quality approval.

The physical garment milestone needs three real garments—T-shirt, trousers, open overshirt—in S/M/L. Buy/obtain samples outside this application, obtain authoring rights, digitize actual panels and seam construction, and calibrate stretch/bending/density/friction against those samples. No sample purchase or licensing has been performed.

Each private `.blend` library must contain unscaled `panel:` mesh objects with configured Cloth modifiers, seam/rest-shape settings, fabric calibration and material/texture data packed into the file. Version-2 objects also carry product/size, pattern, arrangement and calibration stamps plus the reference origin and dimensional checks supplied by `workers/body/author.py`. Arrangement rotates/translates panels using reviewed torso and shoulder landmarks; it never scales garment dimensions to force a fit. Use the same A-pose and metric conventions as the pilot. Garment libraries are trusted operator-authored assets, never user uploads.

Upload libraries under `garments/` in private storage, create a version-2 manifest using `infra/body/garment.schema.json`, and run `npm run body:register-garment -- path/to/manifest.json`. Registration supports product-specific size labels and requires editable sources, calibration records and existing libraries. Bump versions for every pattern, fabric, texture, or size-range change; asset keys must be immutable. Body ranges refer to physically validated body dimensions in meters, not raw garment circumferences. Keep `evidence.validated=false` and `validation.status="estimated"` until physical fitting succeeds.

Simulation handles all selected layers in one collision world, runs sequential frames, rejects unsettled cloth and obvious penetration, and exports a settled self-contained GLB with `garment:<productId>` object names. It is a fixed-pose appearance preview. Physical fittings are required to validate ease, tightness or size claims. Difficult geometry/materials may fail and require an operator-authored arrangement revision. Cached failures remain visible; request a new job after correcting the body or garment version.

## API and privacy

All routes are under `/api/body` and fail closed when the feature is disabled. JSON bodies are bounded to 32 KiB; scan files go directly to the private bucket through five-minute write-once signed PUTs. Cookies are HttpOnly and SameSite=Strict, Secure in production. Mutations reject foreign origins. Metadata and mesh reads check ownership; review routes require operator role and create audit events. Assets stream through authenticated, no-store endpoints rather than exposing signed read URLs.

| Route | Method | Purpose |
|---|---|---|
| `/config` | GET | Feature availability |
| `/session` | POST / GET / DELETE | Invitation sign-in, identity, sign-out |
| `/pairings`, `/pairings/consume` | POST | Issue and atomically exchange pairing code |
| `/scans` | POST / GET | Create upload / list owned scans |
| `/scans/:id` | GET / DELETE | Status / revoke and queue erasure |
| `/scans/:id/finalize` | POST | Check object size and enqueue reconstruction |
| `/scans/:id/corrections` | PATCH | Versioned manual corrections |
| `/scans/:id/consent` | PATCH | Separate fit-summary consent |
| `/scans/:id/assets/display` | GET | Owned ready mesh |
| `/review`, `/review/:id` | GET / POST | Operator queue / decision |
| `/review/:id/assets/display` | GET | Audited operator mesh access |
| `/garments` | GET | Available pilot assets |
| `/garment-research` | GET | Research candidates and missing evidence; never simulation assets |
| `/scans/:id/fit-review` | POST | Versioned request for additional operator review |
| `/tryons`, `/tryons/:id`, `/tryons/:id/asset` | POST / GET / GET | Simulation, progress, private result |

Raw inputs are deleted on reconstruction success; the worker sweeps expired raw data every 30 seconds. Derived assets expire after 30 inactive days. Deletion immediately revokes new API reads and cancels jobs, with background object erasure and a second purge after outstanding upload URLs expire. Already downloaded meshes cannot be recalled. Retention depends on a healthy worker and object store: monitor queue age, raw age and purge failures, and alert before the 24-hour deadline. Do not claim an unconditional storage deletion SLA while services are down. Object versioning/backups need matching deletion policies.

Scan geometry, body measurements, textures and signed upload URLs stay outside localStorage and analytics. The optional chat field contains only a server-authorized product/size summary after separate consent; scan IDs are used only for authorization and never forwarded to Gemini. Plaintext typed voluntarily into chat follows the normal chat data policy.

## Validation and release

Run `npm test`, `npm run typecheck`, and `npm run build`. Body tests use embedded PostgreSQL to exercise the actual schema/queries, ownership isolation, atomic pairing, stale versions, cancellation, purge scheduling, sizing abstention, signed upload constraints, GLB safety and Gemini isolation. Python checks: `python -m unittest discover -s workers/body -p 'test_*.py'`. With worker requirements installed, these also exercise metric mesh conversion, transformed scene nodes, collision export and circumference extraction on synthetic geometry. Synthetic geometry does not establish human measurement accuracy. Blender simulation, the complete storage/worker deployment and the iOS build still require their actual deployment environments.

For the physical trial, collect repeated scans from at least 12 consenting adults across supported body shapes. Keep de-identified observations outside Git (the `pilot-data/` directory is ignored). Run `python workers/body/evaluate.py pilot-data/trial.csv`. CSV columns: `participant,repeat,dimension,predicted_m,reference_m,predicted_size,reference_size`. Use independent tape measurements and blinded physical fitting. The report does not automatically unlock validated measurements.

Release gates remain: median absolute error ≤1 cm and 95th percentile ≤2 cm for every dimension; sizing agreement ≥90% with adequate participant/garment coverage; subgroup/repeatability review; front/side/back physical comparison without visible penetration/floating; ≥30 FPS rotation and cached previews within five seconds on documented devices/networks. Browser/device testing, licensed garment authoring and the real participant study cannot be replaced by synthetic fixtures or passing unit tests.
