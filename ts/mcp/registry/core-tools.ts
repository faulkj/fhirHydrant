import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server"
import { z } from "zod"
import { readFileSync } from "node:fs"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { resolveConfigFile } from "../../fhir/model/config-paths.ts"
import { getSystemInteractions } from "../../fhir/model/metadata.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../../fhir/auth/scopes.ts"
import { addPaginate } from "../tools/paginate.ts"
import { addCapabilities } from "../tools/capabilities.ts"
import { addTerminologyLookup } from "../tools/terminology-lookup.ts"
import { addCodeSearch } from "../tools/code-search.ts"
import { addSystemHistory } from "../tools/history.ts"
import { getDecision } from "../authz/context.ts"

/** Loads all core tool definitions from config/core-tools.json. */
export const loadCoreTools = (): CoreToolDef[] =>
   JSON.parse(readFileSync(resolveConfigFile("core-tools.json"), "utf8")) as CoreToolDef[]

/** Builds a Zod input schema from a core tool param definition map. */
export const buildSchema = (params: Record<string, CoreToolParam>) => {
   const shape: Record<string, z.ZodTypeAny> = {}
   for (const [key, p] of Object.entries(params)) {
      const base = p.enum?.length
         ? z.enum(p.enum as [string, ...string[]])
         : p.type === "boolean"
            ? z.boolean()
            : p.type === "number"
               ? z.number()
               : z.string()
      shape[key] = p.optional ? base.optional().describe(p.description) : base.describe(p.description)
   }
   return z.object(shape)
}

/** Registers the always-on infrastructure tools (pagination, capabilities, terminology) on the server. */
export const registerStaticCoreTools = (server: McpServer): void => {
   const
      tools = loadCoreTools(),
      def = (name: string) => tools.find((t) => t.name === name)!,
      paginateParams = config.responseMode === "compact-locked"
         ? Object.fromEntries(Object.entries(def("paginate").params).filter(([k]) => k !== "responseMode"))
         : def("paginate").params

   addPaginate(server, def("paginate"), buildSchema(paginateParams))
   addCapabilities(server, def("capabilities"), buildSchema(def("capabilities").params))

   if (config.fhirTerminologyBaseUrl) {
      addTerminologyLookup(server, def("terminology_lookup"), buildSchema(def("terminology_lookup").params))
      addCodeSearch(server, def("code_search"), buildSchema(def("code_search").params))
      log.debug(`📋 Terminology tools enabled (→ ${config.fhirTerminologyBaseUrl})`)
   } else
      log.debug("📋 Terminology tools disabled — FHIR_TERMINOLOGY_BASE_URL not set")
}

/** Registers system_history when advertised (or metadata off) and scopes/authz allow it; returns zero or one handle. */
export const registerSystemHistory = (server: McpServer): RegisteredTool[] => {
   const
      tools = loadCoreTools(),
      def = (name: string) => tools.find((t) => t.name === name)!,
      sysInteractions = getSystemInteractions(),
      scopeMap = parseGrantedScopes(getTokenResponse().scope),
      decision = getDecision(),
      historyAllowed = (config.metadataMode === "off" || sysInteractions.has("history-system"))
         && (scopeMap.size === 0 || scopeMap.get("*")?.has("r"))
         && (!decision || decision.admin || decision.systemHistory)

   if (!historyAllowed) {
      log.debug("📋 System history tool disabled — requires metadata, system/*.r, and authz permission")
      return []
   }
   const historyParams = config.responseMode === "compact-locked"
      ? Object.fromEntries(Object.entries(def("system_history").params).filter(([k]) => k !== "responseMode"))
      : def("system_history").params
   log.debug("📋 System history tool enabled")
   return [addSystemHistory(server, def("system_history"), buildSchema(historyParams))]
}
