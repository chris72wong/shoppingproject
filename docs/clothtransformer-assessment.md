# ClothTransformer integration assessment

Checked 2026-10-18 against the [official dataset](https://huggingface.co/datasets/YuCrazing/ClothTransformer-dataset), [project](https://yucrazing.github.io/clothtransformer/), [paper](https://arxiv.org/abs/2605.27852) and [code repository](https://github.com/YuCrazing/ClothTransformer).

The dataset contains simulation trajectories, not a callable fitting model. The code repository currently lists only README.md and .gitignore, with no implementation, inference instructions or trained checkpoint. Integration of the paper's learned simulator is therefore blocked on a usable implementation and weights, or a separate reproduction/training effort. No trained model has been added to the application.

The human garment subset has 56 sequences of T-shirts and skirts. Its published fabric coefficients describe one material setup. There is no demonstrated coverage here for our chinos, open overshirt, layered capsule, or calibrated retailer fabrics. These are limitations to test, not evidence that the method cannot generalize.

A suitable future integration is offline: export the fixed product garment's rest mesh and the animated MakeHuman collision mesh, predict cloth trajectories, check dimensions/collisions/loop stability, then convert accepted deformation to inverse-skinned GLB morph targets. Keep the current viewer and shared clock. Compare the same garment/body/motion against Blender before selecting a solver. A neural prediction must never change a product's fixed dimensions to force fit or count as physical calibration.

The immediately useful dataset path is an isolated benchmark importer. Each NPZ contains fixed topology and cloth/collider positions over 240 frames at 60 Hz. It uses Y-up; displacement fields are per-frame differences, not metres per second. Frame samples must not be transferred onto unrelated body or product meshes. A four-second recorded sequence is not a twelve-second seamless idle.

The dataset is labeled CC BY 4.0 and identifies underlying third-party geometry terms. Preserve attribution and review the applicable source-asset terms before redistributing a benchmark sample, especially its body collider. Keep reference dataset geometry outside the production capsule. It does not replace our CC0 sample body, exact product identities, facial authoring or physical fitting trials.
