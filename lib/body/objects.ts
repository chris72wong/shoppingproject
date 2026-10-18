import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { required } from "./auth";
export function objects() { return new S3Client({ region: process.env.BODY_S3_REGION || "ca-central-1", endpoint: process.env.BODY_S3_ENDPOINT || undefined, forcePathStyle: process.env.BODY_S3_PATH_STYLE === "true" }); }
export async function signedUpload(key: string, bytes: number) {
  return getSignedUrl(objects(), new PutObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key, ContentLength: bytes, ContentType: "application/octet-stream", IfNoneMatch: "*" }), { expiresIn: 300, signableHeaders: new Set(["if-none-match", "content-length"]) });
}
export async function objectSize(key: string) { return (await objects().send(new HeadObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key }))).ContentLength || 0; }
export async function privateJson(key: string, maxBytes = 1024 * 1024) {
  const result = await objects().send(new GetObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key }));
  const stream = result.Body as (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined;
  if (!result.Body || !result.ContentLength || result.ContentLength > maxBytes) {
    stream?.destroy?.(); throw new Error("Private evidence record is missing or exceeds limits.");
  }
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of stream!) {
    size += chunk.length;
    if (size > maxBytes) { stream?.destroy?.(); throw new Error("Evidence record exceeds limits."); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function assetResponse(key: string, request: Request) {
  const result = await objects().send(new GetObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key }), { abortSignal: request.signal });
  return new Response(result.Body!.transformToWebStream() as ReadableStream, { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
