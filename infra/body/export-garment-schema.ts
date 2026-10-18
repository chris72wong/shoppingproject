import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { garmentSchema } from "../../lib/body/garment";
// Cross-field physical validation rules are enforced by the shared Zod schema.
void writeFile(new URL("./garment.schema.json", import.meta.url), JSON.stringify(z.toJSONSchema(garmentSchema), null, 2) + "\n").catch(e => { console.error(e.message); process.exitCode = 1; });
