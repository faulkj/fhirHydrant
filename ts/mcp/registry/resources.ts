import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server"
import { log, buildLog } from "../../log.ts"
import { getDefinitions, getSearchControls } from "../../fhir/model/definitions.ts"
import { getResourceMeta, setSkippedTools } from "../../fhir/model/metadata.ts"
import { getEffectiveScope, getMutable } from "../authz/context.ts"
import { filterByMetadata, filterByScopes } from "./filter-definitions.ts"
import { augmentSchema, hasWriteActions } from "./resource-schema.ts"
import { makeHandler } from "../handlers/resource.ts"
import { readOnlyAnnotations, writeAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"

let registeredCount = 0

/** Returns the number of resource tools registered after metadata + scope gating. */
export const getRegisteredToolCount = (): number => registeredCount

/** Registers an MCP tool for every ResourceDefinition in the current snapshot and returns their handles. */
export const registerAll = (server: McpServer): RegisteredTool[] => {
   const
      controlParams = getSearchControls(),
      scopeMap = getEffectiveScope(),
      metaResult = filterByMetadata(getDefinitions()),
      scopeResult = filterByScopes(metaResult.definitions, scopeMap),
      skippedTools = [...metaResult.skipped, ...scopeResult.skipped],
      mutable = getMutable(),
      handles: RegisteredTool[] = []

   mutable ? (mutable.skippedTools = skippedTools) : setSkippedTools(skippedTools)
   scopeMap.size > 0 && buildLog("scopeGate", `🔑 Scope gate active — ${scopeResult.definitions.length}/${metaResult.definitions.length} resource(s) allowed`)

   for (const def of scopeResult.definitions) {
      const
         meta = getResourceMeta(def.resource),
         { schema, injected, description, actions } = augmentSchema(def, meta, controlParams, scopeMap),
         hasWrites = hasWriteActions(actions),
         annotations = hasWrites
            ? writeAnnotations(actions.includes("delete"), !actions.some((a) => a === "create" || a === "patch"))
            : readOnlyAnnotations
      injected.length && log.debug(`📋 ${def.resource}: injected ${injected.join(", ")}`)
      handles.push(server.registerTool(
         def.toolName,
         { title: def.title, description, inputSchema: schema, outputSchema: fhirOutputSchema, annotations },
         makeHandler(def),
      ))
   }
   if (!mutable) registeredCount = scopeResult.definitions.length
   buildLog("resourceCount", `📋 Registered ${scopeResult.definitions.length} resource tool(s)`)
   return handles
}
