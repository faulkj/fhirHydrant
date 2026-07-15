import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server"
import * as z from "zod"
import messages from "../../../config/messages/write.json" with { type: "json" }
import { config } from "../../config/index.ts"
import { log, buildLog } from "../../log.ts"
import { getDefinitions, getSearchControls, buildShape } from "../../fhir/model/definitions.ts"
import { getResourceMeta, setSkippedTools } from "../../fhir/model/metadata.ts"
import { getEffectiveScope, getMutable } from "../authz/context.ts"
import { filterByMetadata, filterByScopes } from "./filter-definitions.ts"
import { getEnabledActions } from "../validation.ts"
import { makeHandler } from "../handlers/resource.ts"
import { readOnlyAnnotations, writeAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"

let registeredCount = 0
const
   LOCAL_CONTROLS = new Set(["fhirpath", "maxResults", "prefetch", ...(config.responseMode !== "compact-locked" ? ["responseMode"] : [])]),
   WRITE_WITH_BODY = new Set<ToolAction>(["create", "update", "patch"])

const augmentSchema = (
   def: ResourceDefinition, meta: ResourceMeta | undefined,
   controlParams: Record<string, string>, scopeMap: Map<string, Set<ScopePermission>>,
): { schema: z.ZodObject<z.ZodRawShape>, injected: string[], description: string, actions: ToolAction[] } => {
   const
      merged = { ...def.searchParams },
      injected: string[] = []
   for (const [param, desc] of Object.entries(controlParams)) {
      if (merged[param]) continue
      if (LOCAL_CONTROLS.has(param)) {
         merged[param] = desc
         injected.push(param)
         continue
      }
      else if (!meta) continue
      if (param === "_include" || param === "_revinclude") {
         const values = param === "_include" ? meta.includes : meta.revincludes
         if (values.length === 0) continue
         const hint = values.length > 10 ? values.slice(0, 10).join(", ") + ", …" : values.join(", ")
         merged[param] = `${desc} (${hint})`
      } else {
         if (!meta.searchParams.has(param)) continue
         merged[param] = desc
      }
      injected.push(param)
   }

   const
      actions = getEnabledActions(def, scopeMap),
      hasWrites = actions.some((a) => WRITE_WITH_BODY.has(a)),
      hasVread = actions.includes("vread"),
      hasHistory = actions.includes("history"),
      shape: Record<string, z.ZodTypeAny> = { ...buildShape(merged, def.resource, def.supportsDirectRead) }

   if (shape["responseMode"]) shape["responseMode"] = z.enum(["compact", "full"]).optional().describe(merged["responseMode"]!)
   if (shape["prefetch"]) shape["prefetch"] = z.boolean().optional().describe(merged["prefetch"]!)

   if (hasVread) {
      shape["_vid"] = z.string().optional().describe("Version id for vread — use with action=vread and _id")
      injected.push("_vid")
   }
   if (hasHistory) {
      shape["_since"] = z.string().optional().describe("Only include versions created at or after this date/dateTime (history)")
      shape["_at"] = z.string().optional().describe("Only include versions current at this instant (history)")
      injected.push("_since", "_at")
   }

   if (actions.length > 1 || hasWrites) {
      const hints = [
         "Omit for search/read",
         hasVread ? "vread requires _id+_vid" : "",
         hasHistory ? "history optionally takes _id for instance history" : "",
      ].filter(Boolean).join(". ")
      shape["action"] = z.enum(actions as [string, ...string[]]).optional().describe(`Operation: ${actions.join(", ")}. ${hints}.`)
      injected.push("action")
   }
   if (hasWrites) {
      shape["body"] = z.string().optional().describe("Full FHIR resource JSON for create/update, or JSON Patch array (RFC 6902) for patch")
      injected.push("body")
   }

   const
      writeActions = actions.filter((a): a is WriteAction => WRITE_WITH_BODY.has(a) || a === "delete"),
      writeHints = writeActions
         .map((a) => (messages[`writeAction${a[0].toUpperCase()}${a.slice(1)}` as keyof typeof messages] as string)
            .replace("{resourceType}", def.resource))
         .join(" "),
      description = writeHints
         ? `${def.description} ${writeHints}`
         : def.description

   return { schema: z.object(shape), injected, description, actions }
}

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
         hasWrites = actions.some((a) => WRITE_WITH_BODY.has(a) || a === "delete"),
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
