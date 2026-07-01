import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveResourceFiles } from "./config-paths.ts"

/**
 * Reads every resource `*.json`, merging packaged defaults with any local
 * `./config/resources` override (local files shadow same-named defaults,
 * local-only files are added), sorted by filename for deterministic order.
 * Each file must contain a single resource object. Throws with the offending
 * filename on any read or JSON parse error.
 */
export const loadResourceFiles = (): unknown[] =>
   resolveResourceFiles().map(({ file, dir }) => {
      try {
         return JSON.parse(readFileSync(join(dir, file), "utf8"))
      } catch (err) {
         throw new Error(`config/resources/${file}: ${err instanceof Error ? err.message : err}`)
      }
   })
