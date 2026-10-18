import { Pool, type PoolClient } from "pg";
import { required } from "./auth";
const globalDb = globalThis as typeof globalThis & { bodyPool?: Pool };
export function db() { return globalDb.bodyPool ??= new Pool({ connectionString: required("BODY_DATABASE_URL"), max: 5 }); }
export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
