import { existsSync, readFileSync } from "node:fs"
import { config } from "../config/index.ts"
import { log } from "../log.ts"
import { resolveConfigFile } from "../fhir/model/config-paths.ts"
import { getEnabledOperations } from "./operations.ts"
import { isBundleEnabled } from "./bundle.ts"

/**
 * Composes the server instructions from the fragments listed in
 * config/instructions/manifest.json, including only sections whose `when` gate is
 * satisfied by the current configuration. The `{{OPERATIONS_LIST}}` token in any
 * included fragment is replaced with the live enabled-operations catalog.
 */
export const buildInstructions = (): string => {
   try {
      const
         included = loadManifest().filter((s) => !s.when || GATES[s.when]()),
         list = opsList(getEnabledOperations())

      log.info(`📋 Instructions composed from: ${included.map((s) => s.file).join(", ") || "(none)"}`)

      return included
         .map((s) => read(s.file).replace("{{OPERATIONS_LIST}}", list))
         .join("\n\n")
         .trim()
   } catch (err) {
      log.warn(`📋 Instructions disabled — failed to compose: ${err instanceof Error ? err.message : err}`)
      return ""
   }
}

const
   GATES: Record<InstructionGate, () => boolean> = {
      terminology: () => !!config.fhirTerminologyBaseUrl,
      writes: () => config.writeCapabilities.size > 0,
      operations: () => getEnabledOperations().length > 0,
      bundle: () => isBundleEnabled(),
   },

   loadManifest = (): InstructionSection[] => {
      const path = resolveConfigFile("instructions/manifest.json")
      if (!existsSync(path)) {
         log.warn("📋 No config/instructions/manifest.json — instructions disabled")
         return []
      }
      let raw: unknown
      try { raw = JSON.parse(readFileSync(path, "utf8")) }
      catch (e) {
         log.warn(`📋 Invalid manifest.json — instructions disabled: ${e instanceof Error ? e.message : e}`)
         return []
      }
      if (!Array.isArray(raw)) {
         log.warn("📋 manifest.json must be an array — instructions disabled")
         return []
      }
      return raw.filter((s): s is InstructionSection => isValidEntry(s))
   },

   isValidEntry = (s: unknown): boolean => {
      if (!s || typeof s !== "object" || typeof (s as InstructionSection).file !== "string") {
         log.warn(`📋 Skipping invalid manifest entry: ${JSON.stringify(s)}`)
         return false
      }
      const when = (s as InstructionSection).when
      if (when && !(when in GATES)) {
         log.warn(`📋 Skipping "${(s as InstructionSection).file}" — unknown gate "${when}"`)
         return false
      }
      return true
   },

   read = (file: string): string => {
      const path = resolveConfigFile(`instructions/${file}`)
      return existsSync(path) ? readFileSync(path, "utf8").trim() : ""
   },

   opsList = (ops: OperationDefinition[]): string =>
      ops
         .map((o) => {
            const
               target = o.resource ?? "any resource",
               summary = o.description.split(/(?<=[.!?])\s/)[0]
            return `- **${o.operation}** — ${target} ${o.level.join("/")}-level ${o.method}. ${summary}`
         })
         .join("\n")
