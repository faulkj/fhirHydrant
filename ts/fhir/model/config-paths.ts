import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Packaged default config directory (compiled bin/ mode, then ts source mode). */
export const packagedConfigDir = (): string => {
   const
      here = dirname(fileURLToPath(import.meta.url)),
      candidates = [join(here, "..", "config"), join(here, "../../..", "config")],
      found = candidates.find((c) => existsSync(join(c, "resources")))
   if (!found)
      throw new Error(`Packaged config/resources/ not found — looked in: ${candidates.join(", ")}`)
   return found
}

/** Optional local override config directory (`./config`), or undefined when absent. */
export const overrideConfigDir = (): string | undefined => {
   const dir = join(process.cwd(), "config")
   return existsSync(dir) ? dir : undefined
}

/** Both config roots for watching: override (if any) then packaged. */
export const configDirs = (): string[] => {
   const override = overrideConfigDir()
   return override ? [override, packagedConfigDir()] : [packagedConfigDir()]
}

/** Resolves a config-relative path to the local override when present, else the packaged default. */
export const resolveConfigFile = (rel: string): string => {
   const override = overrideConfigDir()
   if (override) {
      const candidate = join(override, rel)
      if (existsSync(candidate)) return candidate
   }
   return join(packagedConfigDir(), rel)
}

/**
 * Merges resource filenames from packaged defaults and the local override.
 * Returns a sorted list of `{ file, dir }` where a local file of the same name
 * shadows the packaged one, and local-only files are added.
 */
export const resolveResourceFiles = (): { file: string, dir: string }[] => {
   const
      packaged = join(packagedConfigDir(), "resources"),
      override = overrideConfigDir(),
      overrideRes = override ? join(override, "resources") : undefined,
      merged = new Map<string, string>()
   for (const f of jsonFiles(packaged)) merged.set(f, packaged)
   if (overrideRes && existsSync(overrideRes))
      for (const f of jsonFiles(overrideRes)) merged.set(f, overrideRes)
   return [...merged.keys()].sort().map((file) => ({ file, dir: merged.get(file)! }))
}

const jsonFiles = (dir: string): string[] =>
   existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []
