import { readFile } from "node:fs/promises";
import pg from "pg";
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand, PutPublicAccessBlockCommand, PutBucketEncryptionCommand } from "@aws-sdk/client-s3";
const required = name => { if (!process.env[name]) throw new Error(`${name} is required`); return process.env[name]; };
const pool = new pg.Pool({ connectionString: required("BODY_DATABASE_URL") });
try { await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8")); } finally { await pool.end(); }
const client = new S3Client({ region: process.env.BODY_S3_REGION || "ca-central-1", endpoint: process.env.BODY_S3_ENDPOINT || undefined, forcePathStyle: process.env.BODY_S3_PATH_STYLE === "true" });
const Bucket = required("BODY_S3_BUCKET");
try { await client.send(new HeadBucketCommand({ Bucket })); }
catch (error) {
  if (error.$metadata?.httpStatusCode !== 404) throw error;
  const region = process.env.BODY_S3_REGION || "ca-central-1";
  await client.send(new CreateBucketCommand({ Bucket, ...(!process.env.BODY_S3_ENDPOINT && region !== "us-east-1" ? { CreateBucketConfiguration: { LocationConstraint: region } } : {}) }));
}
await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [required("BODY_PUBLIC_ORIGIN")], AllowedMethods: ["PUT"], AllowedHeaders: ["content-type", "content-length", "if-none-match", "x-amz-*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 300 }] } }));
await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [{ ID: "raw-safety-net", Status: "Enabled", Filter: { Prefix: "body/" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] } }));
if (!process.env.BODY_S3_ENDPOINT) {
  await client.send(new PutPublicAccessBlockCommand({ Bucket, PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } }));
  await client.send(new PutBucketEncryptionCommand({ Bucket, ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] } }));
}
console.log("Body pilot schema and private bucket configured. No demo body or garment evidence was seeded.");
