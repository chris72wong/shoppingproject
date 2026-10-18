import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { required } from "./auth";
export function objects() { return new S3Client({ region: process.env.BODY_S3_REGION || "ca-central-1", endpoint: process.env.BODY_S3_ENDPOINT || undefined, forcePathStyle: process.env.BODY_S3_PATH_STYLE === "true" }); }
export async function signedUpload(key: string, bytes: number) {
  return getSignedUrl(objects(), new PutObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key, ContentLength: bytes, ContentType: "application/octet-stream", IfNoneMatch: "*" }), { expiresIn: 300, signableHeaders: new Set(["if-none-match", "content-length"]) });
}
export async function objectSize(key: string) { return (await objects().send(new HeadObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key }))).ContentLength || 0; }
export async function assetResponse(key: string, request: Request) {
  const result = await objects().send(new GetObjectCommand({ Bucket: required("BODY_S3_BUCKET"), Key: key }), { abortSignal: request.signal });
  return new Response(result.Body!.transformToWebStream() as ReadableStream, { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
