import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { config } from "../config/index.ts"
import { log } from "../log.ts"
import { getConfigDir } from "../fhir/model/definitions.ts"
import { getEnabledOperations } from "./operations.ts"

/**
 * Composes the server instructions from the fragments listed in
 * config/instructions/manifest.json, including only sections whose `when` gate is
 * satisfied by the current configuration. The `{{OPERATIONS_LIST}}` token in any
 * included fragment is replaced with the live enabled-operations catalog.
 */
export const buildInstructions = (): string => {
   const
      dir = join(getConfigDir(), "instructions"),
      included = loadManifest(dir).filter((s) => !s.when || GATES[s.when]()),
      list = opsList(getEnabledOperations())

   log.debug(`📋 Instructions composed from: ${included.map((s) => s.file).join(", ")}`)

   return included
      .map((s) => read(dir, s.file).replace("{{OPERATIONS_LIST}}", list))
      .join("\n\n")
      .trim()
}

const
   GATES: Record<InstructionGate, () => boolean> = {
      terminology: () => !!config.fhirTerminologyBaseUrl,
      writes: () => config.writeCapabilities.size > 0,
      operations: () => getEnabledOperations().length > 0,
      bundle: () => config.bundleCapabilities.size > 0,
   },

   loadManifest = (dir: string): InstructionSection[] => {
      const
         path = join(dir, "manifest.json"),
         raw = JSON.parse(readFileSync(path, "utf8")) as InstructionSection[]
      for (const s of raw)
         if (s.when && !(s.when in GATES))
            throw new Error(`config/instructions/manifest.json: unknown gate "${s.when}" for "${s.file}"`)
      return raw
   },

   read = (dir: string, file: string): string => {
      const path = join(dir, file)
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
