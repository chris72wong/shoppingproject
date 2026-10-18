import raw from "../public/models/mirra-manifest.json";
import type { AvatarModelId } from "./types";
import { previewAssetUrl, previewManifest } from "./preview-capsule";

type ModelAsset = { url: string; sha256: string; productIds: string[] };
type Model = { label: string; height: number; duration: number; assets: ModelAsset[] };
const models = raw.models as Partial<Record<AvatarModelId, Model>>;
export function avatarAsset(modelId: AvatarModelId, productIds: string[]) {
  const model = models[modelId];
  const key = [...productIds].sort().join("|");
  const asset = model?.assets.find(a => [...a.productIds].sort().join("|") === key);
  if (model && !asset) throw new Error("This model has no preview for the selected clothing.");
  if (!asset) {
    if (modelId === "model-2") throw new Error("Model 2 is being prepared. Please use Model 1 for now.");
    return { url: previewAssetUrl(productIds), duration: previewManifest.clipDurationSeconds, height: 1.75 };
  }
  if (!/^\/models\/[\w/-]+\.glb$/.test(asset.url)) throw new Error("Invalid model asset path.");
  return { url: `${asset.url}?v=${asset.sha256}`, duration: model!.duration, height: model!.height };
}
