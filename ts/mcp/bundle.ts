import type { McpServer } from "@modelcontextprotocol/server"
import { config } from "../config/index.ts"
import { log } from "../log.ts"
import { isMetadataAvailable, getSystemInteractions } from "../fhir/model/metadata.ts"
import { getDefinitions } from "../fhir/model/definitions.ts"
import { loadCoreTools, buildSchema } from "./core-tools.ts"
import { addBundle } from "./tools/bundle.ts"

/** True when the bundle tool is enabled — capabilities configured and (in strict mode) advertised in /metadata. */
export const isBundleEnabled = (): boolean => {
   if (config.bundleCapabilities.size === 0) return false
   if (isMetadataAvailable() && config.metadataMode === "strict")
      return [...config.bundleCapabilities].some((t) => getSystemInteractions().has(t))
   return true
}

/** Registers the bundle tool if bundle capabilities are configured and metadata gates pass. */
export const registerBundle = (server: McpServer): void => {
   if (!isBundleEnabled()) {
      config.bundleCapabilities.size > 0
         && log.info(`📦 Bundle tool skipped — /metadata does not advertise ${[...config.bundleCapabilities].join(" or ")}`)
      return
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
   log.info(`📦 Registered bundle (${types}, writes ${config.bundleWritesEnabled ? "enabled" : "disabled"})`)
}
