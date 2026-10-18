// Parse the container before passing any untrusted asset to a rendering library.
// Pilot GLBs must be completely self-contained (no URLs, data URIs or extensions).
export function inspectGlb(data: ArrayBuffer): Record<string, any> {
  const view = new DataView(data);
  if (data.byteLength < 20 || data.byteLength > 150 * 1024 * 1024 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== data.byteLength) throw new Error("Invalid GLB container.");
  let offset = 12, document: Record<string, any> | undefined, binary = 0;
  while (offset < data.byteLength) {
    if (offset + 8 > data.byteLength) throw new Error("Truncated GLB chunk.");
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (size % 4 || offset + size > data.byteLength) throw new Error("Invalid GLB chunk length.");
    if (type === 0x4e4f534a && !document && offset === 20) document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, offset, size)));
    else if (type === 0x004e4942 && document && !binary) binary = size;
    else throw new Error("Unsupported GLB chunk.");
    offset += size;
  }
  if (!document || document.asset?.version !== "2.0" || !binary) throw new Error("GLB requires JSON and binary data.");
  const visit = (value: unknown, depth = 0) => {
    if (depth > 64) throw new Error("Asset nesting exceeds pilot limits.");
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "uri" || key === "extensions" || key === "extensionsUsed" || key === "extensionsRequired") throw new Error("External references and GLB extensions are unsupported.");
      visit(item, depth + 1);
    }
  };
  visit(document);
  if (document.buffers?.length !== 1 || document.buffers[0].byteLength > binary || (document.nodes?.length || 0) > 1000 || (document.meshes?.length || 0) > 100) throw new Error("Asset exceeds pilot limits.");
  for (const image of document.images || []) if (!["image/png", "image/jpeg"].includes(image.mimeType) || !Number.isInteger(image.bufferView)) throw new Error("Only embedded PNG/JPEG textures are supported.");
  return document;
}
