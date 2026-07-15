import { readFileSync } from "node:fs"
import * as z from "zod"
import { validateResources } from "./validate-definitions.ts"
import { loadResourceFiles } from "./resource-files.ts"
import { resolveConfigFile } from "./config-paths.ts"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"

/** Returns the current valid set of generated FHIR resource definitions. */
export const getDefinitions = (): ResourceDefinition[] => snapshot.definitions

/** Returns the SMART scopes derived from the current definitions snapshot. */
export const getRequestedScopes = (): string[] => snapshot.scopes

/** Returns the user-editable search-control descriptions from config/search-controls.json. */
export const getSearchControls = (): Record<string, string> => snapshot.searchControls

/** Builds a Zod shape from search params, auto-injecting _id when needed. */
export const buildShape = (
   params: Record<string, string>,
   resource: string,
   supportsDirectRead: boolean,
): Record<string, z.ZodOptional<z.ZodString>> => {
   const shape: Record<string, z.ZodOptional<z.ZodString>> = Object.fromEntries(
      Object.entries(params).map(([key, desc]) => [key, z.string().optional().describe(desc)]),
   )
   if (supportsDirectRead && !shape["_id"]) {
      shape["_id"] = z.string().optional().describe(`${resource} resource ID — performs direct read when provided alone`)
      log.warn(`📋 "${resource}": auto-injected _id for supportsDirectRead`)
   }
   return shape
}

const parse = (): DefinitionsSnapshot => {
   const
      rawResources = loadResourceFiles(),
      rawControls = JSON.parse(readFileSync(resolveConfigFile("search-controls.json"), "utf8")) as unknown,
      result = validateResources(rawResources)
   if (result.errors.length > 0)
      throw new Error(`config/resources/: ${result.errors.join("; ")}`)

   if (!rawControls || typeof rawControls !== "object" || Array.isArray(rawControls))
      throw new Error("config/search-controls.json must be a plain object")
   const searchControls: Record<string, string> = {}
   for (const [key, val] of Object.entries(rawControls as Record<string, unknown>))
      if (typeof val === "string" && val.trim())
         searchControls[key] = val.trim()
      else
         throw new Error(`config/search-controls.json: "${key}" must be a non-empty string`)

   const
      seen = new Set<string>(),
      definitions: ResourceDefinition[] = result.entries.map((entry) => {
         if (seen.has(entry.toolName))
            throw new Error(`config/resources/: duplicate toolName "${entry.toolName}"`)
         seen.add(entry.toolName)

         const params = entry.searchParams ?? {}
         return {
            resource: entry.resource,
            toolName: entry.toolName,
            title: entry.title,
            description: entry.description,
            supportsDirectRead: entry.supportsDirectRead,
            requireOneOf: entry.requireOneOf,
            searchParams: params,
            searchSchema: z.object(buildShape(params, entry.resource, entry.supportsDirectRead)),
         }
      }),
      scopes = definitions.map((d) => {
         const letters = [
            config.writeCapabilities.has("create") ? "c" : "",
            d.supportsDirectRead ? "r" : "",
            config.writeCapabilities.has("update") || config.writeCapabilities.has("patch") ? "u" : "",
            config.writeCapabilities.has("delete") ? "d" : "",
            "s",
         ].join("")
         return `system/${d.resource}.${letters}`
      })
   return { definitions, scopes, searchControls }
}

let snapshot = parse()

/** Parses config into a candidate snapshot without committing it. Throws on invalid config. */
export const parseDefinitions = (): DefinitionsSnapshot => parse()

/** Normalized semantic signature of a snapshot (definitions + controls + scopes), excluding generated Zod objects. */
export const definitionsSignature = (snap: DefinitionsSnapshot): string =>
   JSON.stringify({
      controls: Object.entries(snap.searchControls).sort(),
      scopes: [...snap.scopes].sort(),
      defs: [...snap.definitions]
         .map((d) => ({ ...d, searchSchema: undefined }))
         .sort((a, b) => a.toolName.localeCompare(b.toolName)),
   })

/** Signature of the currently committed snapshot. */
export const committedDefinitionsSignature = (): string => definitionsSignature(snapshot)

/** Commits a previously parsed candidate snapshot as the live definitions. */
export const commitDefinitions = (candidate: DefinitionsSnapshot): void => {
   snapshot = candidate
}
