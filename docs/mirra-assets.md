# Mirra runtime assets and reproducible authoring

Runtime: `public/models/mirra/model-1` and `model-2` each contain eight clothed combinations plus five individual previews. Every GLB embeds geometry, textures, skeletal skinning, and a twelve-second `FORM_Idle` clip. The historical clip identifier is retained for compatibility. `public/models/mirra-manifest.json` maps exact garment sets and model identity to SHA-256 cache identities.

These assets are appearance approximations. Product research does not provide retailer sewing patterns or physical fabric calibration. No personal fit is asserted. Clothing construction comes from independently retargeted CC0 MakeHuman templates, edited for the Mirra capsule; it is not a direct digital copy of the UNIQLO garments. Neutral studio footwear is not in the shopping catalog. The original measurement/research archive remains in `animated-capsule-research.json`.

## Pinned sources

- Blender 4.5.3 LTS: https://download.blender.org/release/Blender4.5/blender-4.5.3-windows-x64.zip
- MPFB revision `3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf`: https://codeload.github.com/makehumancommunity/mpfb2/zip/3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf
- MakeHuman CC0 system assets: https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Mika Suominen CC0 face units: https://files2.makehumancommunity.org/functional/faceunits01.zip

Keep downloads/extracted source in ignored `.avatar-source/`; distributable GLBs and provenance are committed. Extract the Blender archive under `.avatar-source/blender/`, MPFB under `.avatar-source/mpfb/`, the system pack to `.avatar-source/system/`, and face units to `.avatar-source/faceunits01/`. Download archives are named `mpfb.zip`, `system-assets.zip`, and `faceunits01.zip` for provenance hashing. The original asset notice is `public/models/NOTICE-MakeHuman.txt`.

## Regenerate on Windows

For each model, in order:

```powershell
$env:MIRRA_MODEL='model-1' # repeat separately with model-2
$blender='.avatar-source/blender/blender-4.5.3-windows-x64/blender.exe'
& $blender --background --factory-startup --python-exit-code 1 --python scripts/build-sample-human.py
& $blender --background --factory-startup --python-exit-code 1 --python scripts/build-mirra-wardrobe.py
& $blender --background --factory-startup --python-exit-code 1 --python scripts/build-lifelike-human.py
& $blender --background --factory-startup --python-exit-code 1 --python scripts/export-mirra-capsule.py
```

Check each process exit code before continuing. Stop on failure. Exports first write a complete workspace file, then replace the runtime GLB atomically. Do not run two authoring jobs for the same model at once. After both finish:

```sh
node scripts/index-mirra-assets.mjs
npx tsx scripts/check-lifelike-assets.ts public/models/mirra/model-1/look-0.glb --skeletal
npx tsx scripts/check-lifelike-assets.ts public/models/mirra/model-2/look-0.glb --skeletal
npm test
```

The skeletal check measures actual exported animation, blink, shoulder/hand pose, head motion, and foot drift. `--skeletal` explicitly permits stable skeletal garment deformation without baked cloth morphs. Unless `--collisions` is supplied, the report records collision checks as not run; visual review is mandatory. It does not establish physical fit.

## Structural repairs

Both bodies are generated separately using MPFB macro targets. Wardrobe templates are fitted independently to each body using original topology before subdivision. Preserve the original helper-body mask; removing it exposes nonhuman helper geometry. Separate connected garment components, retain skin weights, author ease and hem/cuff adjustments, bake covered-body masks with facial morphs intact, and clip hidden underlayers only beneath the overshirt. Feet use a stable anatomically aligned standing pose; subtle torso/head movement and facial morphs supply the idle without leg IK distortion.

The development review page exposes exact asset hashes, Front/Side/Back, face/hand/garment close-ups, fixed phases and live playback. Review all thirteen assets per model in the browser after any structural change. Record current hashes and concrete defects in `mirra-visual-review.md`; never inherit approval from an earlier export. Generated provenance starts with `visualReviewPassed: false` until that review is completed.
