import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { packagedConfigDir, overrideConfigDir } from "../fhir/model/config-paths.ts"

const
   cache = new Map<string, TextMap>(),

   placeholderSignature = (text: string): string =>
      [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort().join(","),

   readMap = (path: string, label: string): TextMap => {
      let raw: unknown
      try { raw = JSON.parse(readFileSync(path, "utf8")) }
      catch (e) { throw new Error(`${label}: invalid JSON — ${e instanceof Error ? e.message : e}`) }
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
         throw new Error(`${label}: must be a plain object of string values`)
      const out = Object.create(null) as TextMap
      for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
         if (typeof val !== "string" || !val.trim())
            throw new Error(`${label}: "${key}" must be a non-empty string`)
         out[key] = val
      }
      return out
   },

   load = (rel: string): TextMap => {
      const
         packaged = readMap(join(packagedConfigDir(), rel), `config/${rel}`),
         override = overrideConfigDir(),
         localPath = override ? join(override, rel) : undefined
      if (!localPath || localPath === join(packagedConfigDir(), rel) || !existsSync(localPath))
         return packaged
      const local = readMap(localPath, `./config/${rel}`)
      for (const key of Object.keys(local)) {
         if (!(key in packaged))
            throw new Error(`./config/${rel}: unknown key "${key}" — not present in packaged defaults`)
         if (placeholderSignature(local[key]) !== placeholderSignature(packaged[key]))
            throw new Error(`./config/${rel}: "${key}" placeholders must match packaged defaults`)
      }
      return { ...packaged, ...local }
   }

/** Loads a flat string map from config with packaged defaults and a per-key local override, cached for the process. */
export const loadText = (rel: string): TextMap =>
   cache.get(rel) ?? cache.set(rel, load(rel)).get(rel)!

/** Loads a typed message catalog by domain name (config/messages/<name>.json). */
export const loadMessages = <N extends MessageCatalog>(name: N): MessageCatalogs[N] =>
   loadText(`messages/${name}.json`) as MessageCatalogs[N]

/** Returns one typed message-catalog value by domain and key. */
export const message = <N extends MessageCatalog, K extends keyof MessageCatalogs[N]>(
   name: N, key: K,
): MessageCatalogs[N][K] => loadMessages(name)[key]
