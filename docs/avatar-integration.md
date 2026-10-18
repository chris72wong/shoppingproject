# Sample human avatar

The default studio uses **Male_Adult_01 from Microsoft Rocketbox**, Copyright (c) 2020 Microsoft, under the **MIT License**. The full permission/copyright notice ships alongside the asset at `public/models/LICENSE-Rocketbox.txt`. MIT permits modification, redistribution and commercial demonstrations when that notice is retained. No account, source dataset download or third-party asset request is needed at runtime.

- Source: https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9/Assets/Avatars/Adults/Male_Adult_01
- Actual license checked before download: https://github.com/microsoft/Microsoft-Rocketbox/blob/0943055db6ec570bcef9f2c8b41c9e5467c808f9/LICENSE.md
- Library documentation: https://github.com/microsoft/Microsoft-Rocketbox
- Processed model: `public/models/avatar.glb`; source/output hashes and mesh statistics: `public/models/avatar.provenance.json`.

This is a realistic, authored human from a public avatar research library, **not a photogrammetric scan or a reconstruction of the user**. It replaces the procedural sphere/cylinder mannequin. It retains its original polo, shorts and shoes. A captured scan from one of the preferred datasets remains a possible replacement once suitable demo/redistribution rights and access are established.

## Dataset selection

| Candidate | License/access evidence | Decision |
| --- | --- | --- |
| TEXEL BodyScan | https://github.com/m-krivov/Texel-BodyScan-Dataset identifies dataset scans as CC BY-NC 4.0; separate commercial agreement required. The parser's MIT license does not license the scans. | Did not download. Avoid imposing a noncommercial restriction on a shopping app demonstration whose commercial status is unspecified. |
| 3DHumans | https://cvit.iiit.ac.in/research/projects/cvit-projects/3dhumans advertises a sample and signed access agreement. The page could not be retrieved reliably during implementation; actual asset redistribution permission could not be verified. | Did not download or infer rights from public availability. |
| THuman2.0/2.1 | https://github.com/ytrock/THuman2.0-Dataset explicitly limits use to noncommercial research, prohibits third-party redistribution without written permission and requires a signed request for access. | Incompatible with bundling an asset in this public-assets workflow without separate permission. |
| Microsoft Rocketbox | Current repository explicitly releases the avatar library under MIT; notice read in full. Includes rigged FBX and diffuse texture maps. | One adult avatar selected as a permissively licensed fallback. |

## Existing app and integration

`Avatar.tsx` already used React Three Fiber, Drei lighting/shadows and orbit controls, with `FlatAvatar.tsx` as an illustration fallback. The previous human and clothing were procedural geometry with colors taken from selected products. Catalog garments in `public/garments` are SVG illustrations, not skinned 3D garments. `BodyMesh.tsx` loads separately generated private body/pilot meshes; `BodyPanel.tsx`, review landmarks, measurement validation and that scan precedence remain in place.

`DatasetAvatar.tsx` now loads the local GLB using Drei's cached GLTF loader. SkeletonUtils clones its skeleton per viewer, while materials/textures are shared. Rendering is on demand, with DPR capped at 1.5. The sample keeps its own proportions rather than claiming that scaling by a profile produces a personal body. The viewer centers a 3-unit presentation of the 1.75 m asset, preserves orbit and existing zoom buttons, and provides loading, asset-load error and WebGL fallback states.

The studio defaults to **3D human**, or the existing private scan when available. **Outfit illustration** shows selected catalog pieces with the established selection, alternatives and swap workflow. Product buttons work in both modes. No arbitrary 3D garments are overlaid on the body. A source skeleton exists and its skin weights are retained, but no new animation or cloth simulation is claimed. Automatic rigging was unnecessary because the source was already rigged. Compatible garment geometry, skeleton binding, measurements, collision handling and cloth fitting remain future work.

## Asset preparation

Only one 521 KB FBX and its three diffuse TGAs were downloaded (about 43 MB of source data), not the full library. Meta's official FBX2glTF v0.9.7 Windows release converts the FBX. Its machine-local texture paths do not resolve on this machine; the preparation script explicitly replaces the converter's 1x1 image placeholders with the actual downloaded maps. It does not ship those placeholders.

The script embeds 1024px JPEG body/head diffuse maps and a 1024px PNG opacity map, uses alpha masking for hair/opacity surfaces, removes unresolved normal maps and sets nonmetallic rough materials. Three.js computes bind-pose bounds including skinning; a parent transform puts feet at Y=0, horizontally centers the model, and makes its height 1.75 m without altering bone weights. The result contains 7,440 triangles, three materials/textures, one 80-joint skin and no animation clips. It is about 2 MB. Its modest source polygon count requires no decimation. No remeshing or watertightness guarantee is claimed; it is a display avatar, not a fit/collision body.

From the repository root on Windows, after `npm install`:

```powershell
./scripts/download-avatar.ps1
npm run typecheck
npm test
npm run build
npm run dev -- --port 3107
```

The source revision is pinned in the download script; input/output SHA-256 hashes are recorded in the provenance file. `scripts/prepare-avatar.mjs` can also be rerun alone against the ignored `.avatar-source` directory. It uses the existing Three.js dependency and Sharp supplied by Next.js. Source FBX/TGAs, converter executable and temporary files are ignored. The processed GLB is explicitly exempted from the repository's general GLB ignore rule.

## Verification

Type checking, the existing 57 tests and a production build passed. An additional asset test verifies the output hash, size budget, embedded resources, real 1024px textures, material bindings and preserved skeleton. In the browser at port 3107, the model loaded with visible body/head textures; front, side and rear angles, zoom controls, illustration mode, product selection and a swap were checked. A fresh browser session had no console errors or warnings. Temporarily removing the model verified the load-error message and illustration fallback; the asset was then restored. The earlier loading overlay issue was corrected by moving the loading message outside the Three.js tree. Scan service integration still requires the existing separately configured private backend; it was not exercised against live capture hardware here.
