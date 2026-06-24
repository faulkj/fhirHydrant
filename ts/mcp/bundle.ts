import type { McpServer } from "@modelcontextprotocol/server"
import { config } from "../config.ts"
import { isMetadataAvailable, getSystemInteractions } from "../fhir/model/metadata.ts"
import { getDefinitions } from "../fhir/model/definitions.ts"
import { loadCoreTools, buildSchema } from "./core-tools.ts"
import { addBundle } from "./tools/bundle.ts"

/** Registers the bundle tool if bundle capabilities are configured and metadata gates pass. */
export const registerBundle = (server: McpServer): void => {
   if (config.bundleCapabilities.size === 0) return

   if (isMetadataAvailable() && config.metadataMode === "strict") {
      const sys = getSystemInteractions()
      const hasAny = [...config.bundleCapabilities].some((t) => sys.has(t))
      if (!hasAny) {
         console.info(`📦 Bundle tool skipped — /metadata does not advertise ${[...config.bundleCapabilities].join(" or ")}`)
         return
      }
   }

   const
      tools = loadCoreTools(),
      def = tools.find((t) => t.name === "bundle")!,
      params = config.responseMode === "compact-locked"
         ? Object.fromEntries(Object.entries(def.params).filter(([k]) => k !== "responseMode"))
         : def.params,
      schema = buildSchema(params),
      types = [...config.bundleCapabilities].join(" or "),
      defs = getDefinitions(),
      resourceSample = defs.length <= 6
         ? defs.map((d) => d.resource).join(", ")
         : `${defs.slice(0, 5).map((d) => d.resource).join(", ")} +${defs.length - 5} more`,
      writeState = config.bundleWritesEnabled
         ? [...config.writeCapabilities].join(", ") + " (requires confirmation)"
         : "disabled",
      description = `Submit a FHIR ${types} Bundle. Resources: ${resourceSample}. Writes: ${writeState}.`

   addBundle(server, description, schema)
   console.info(`📦 Registered bundle (${types}, writes ${config.bundleWritesEnabled ? "enabled" : "disabled"})`)
}
