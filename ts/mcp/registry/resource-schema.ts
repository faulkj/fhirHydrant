import * as z from "zod"
import { loadMessages } from "../../config/text.ts"
import { config } from "../../config/index.ts"
import { buildShape } from "../../fhir/model/definitions.ts"
import { inputDescription } from "../../fhir/model/input-descriptions.ts"
import { getEnabledActions } from "../validation.ts"

const
   messages = loadMessages("write"),
   LOCAL_CONTROLS = new Set(["fhirpath", "maxResults", "prefetch", ...(config.responseMode !== "compact-locked" ? ["responseMode"] : [])]),
   WRITE_WITH_BODY = new Set<ToolAction>(["create", "update", "patch"]),

   mergeControls = (
      def: ResourceDefinition, meta: ResourceMeta | undefined, controlParams: Record<string, string>,
   ): { merged: Record<string, string>, injected: string[] } => {
      const
         merged = { ...def.searchParams },
         injected: string[] = []
      for (const [param, desc] of Object.entries(controlParams)) {
         if (merged[param]) continue
         if (LOCAL_CONTROLS.has(param)) { merged[param] = desc; injected.push(param); continue }
         else if (!meta) continue
         if (param === "_include" || param === "_revinclude") {
            const values = param === "_include" ? meta.includes : meta.revincludes
            if (values.length === 0) continue
            merged[param] = `${desc} (${values.length > 10 ? values.slice(0, 10).join(", ") + ", …" : values.join(", ")})`
         } else {
            if (!meta.searchParams.has(param)) continue
            merged[param] = desc
         }
         injected.push(param)
      }
      return { merged, injected }
   },

   actionDescription = (actions: ToolAction[], hasVread: boolean, hasHistory: boolean): string => {
      const hints = [
         inputDescription("resource.actionHintDefault"),
         hasVread ? inputDescription("resource.actionHintVread") : "",
         hasHistory ? inputDescription("resource.actionHintHistory") : "",
      ].filter(Boolean).join(". ")
      return inputDescription("resource.action").replace("{actions}", actions.join(", ")).replace("{hints}", hints)
   },

   writeDescription = (def: ResourceDefinition, actions: ToolAction[]): string => {
      const writeHints = actions
         .filter((a): a is WriteAction => WRITE_WITH_BODY.has(a) || a === "delete")
         .map((a) => (messages[`writeAction${a[0].toUpperCase()}${a.slice(1)}` as keyof typeof messages] as string)
            .replace("{resourceType}", def.resource))
         .join(" ")
      return writeHints ? `${def.description} ${writeHints}` : def.description
   }

/** Builds the augmented input schema, injected-param list, description, and enabled actions for a resource tool. */
export const augmentSchema = (
   def: ResourceDefinition, meta: ResourceMeta | undefined,
   controlParams: Record<string, string>, scopeMap: Map<string, Set<ScopePermission>>,
): { schema: z.ZodObject<z.ZodRawShape>, injected: string[], description: string, actions: ToolAction[] } => {
   const
      { merged, injected } = mergeControls(def, meta, controlParams),
      actions = getEnabledActions(def, scopeMap),
      hasWrites = actions.some((a) => WRITE_WITH_BODY.has(a)),
      hasVread = actions.includes("vread"),
      hasHistory = actions.includes("history"),
      shape: Record<string, z.ZodTypeAny> = { ...buildShape(merged, def.resource, def.supportsDirectRead) }

   if (shape["responseMode"]) shape["responseMode"] = z.enum(["compact", "full"]).optional().describe(merged["responseMode"]!)
   if (shape["prefetch"]) shape["prefetch"] = z.boolean().optional().describe(merged["prefetch"]!)

   if (hasVread) {
      shape["_vid"] = z.string().optional().describe(inputDescription("resource.vid"))
      injected.push("_vid")
   }
   if (hasHistory) {
      shape["_since"] = z.string().optional().describe(inputDescription("resource.since"))
      shape["_at"] = z.string().optional().describe(inputDescription("resource.at"))
      injected.push("_since", "_at")
   }
   if (actions.length > 1 || hasWrites) {
      shape["action"] = z.enum(actions as [string, ...string[]]).optional().describe(actionDescription(actions, hasVread, hasHistory))
      injected.push("action")
   }
   if (hasWrites) {
      shape["body"] = z.string().optional().describe(inputDescription("resource.body"))
      injected.push("body")
   }
   return { schema: z.object(shape), injected, description: writeDescription(def, actions), actions }
}

/** Whether a resource action set includes a body-carrying or delete write. */
export const hasWriteActions = (actions: ToolAction[]): boolean =>
   actions.some((a) => WRITE_WITH_BODY.has(a) || a === "delete")
