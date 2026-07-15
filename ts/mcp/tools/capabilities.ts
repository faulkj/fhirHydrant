import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import messages from "../../../config/messages/core.json" with { type: "json" }
import { fetchMetadata, getCapabilitySummary } from "../../fhir/model/metadata.ts"
import { getDefinitions } from "../../fhir/model/definitions.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { getDecision, getEffectiveScope, getMutable } from "../authz/context.ts"
import { scopePermsToString } from "../../fhir/auth/scopes.ts"
import { formatFhirError } from "../../fhir/utils.ts"
import { log } from "../../log.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { getEnabledActions } from "../validation.ts"
import { getEnabledOperations, getSkippedOperations } from "../registry/operations.ts"
import { readOnlyAnnotations } from "../annotations.ts"
import { capabilitiesOutputSchema } from "../output.ts"

/** Registers the capabilities tool for querying the FHIR server's CapabilityStatement. */
export const addCapabilities = (
   server: McpServer, description: string, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "capabilities",
      { description, inputSchema, outputSchema: capabilitiesOutputSchema, annotations: readOnlyAnnotations },
      async (args: Record<string, unknown>) => {
         const t0 = Date.now()
         try {
            if (args["refresh"]) await fetchMetadata()
            const summary = getCapabilitySummary()
            if (!summary) {
               emitAudit({ ts: new Date().toISOString(), tool: "capabilities", operation: "capabilities", status: "ok", durationMs: auditTime(t0) })
               const unavailable = { available: false, note: messages.capabilitiesUnavailable }
               return {
                  content: [{ type: "text" as const, text: messages.capabilitiesUnavailable }],
                  structuredContent: unavailable,
               }
            }
            const
               defsByType = new Map(getDefinitions().map((d) => [d.resource, d])),
               scopeMap = getEffectiveScope(),
               operations = getEnabledOperations().map((o) => ({
                  key: o.key, operation: o.operation, resource: o.resource,
                  level: o.level, method: o.method,
                  params: Object.fromEntries(Object.entries(o.params).map(([k, v]) => [k, { description: v.description, type: v.type, ...(v.optional && { optional: true }), ...(v.repeat && { repeat: true }), ...(v.default != null && { default: v.default }) }])),
                  ...(o.requiresOneOf.length && { requiresOneOf: o.requiresOneOf }),
                  ...(o.acceptsBody && { acceptsBody: true }),
                  bundleResponse: o.bundleResponse,
                  ...(o.notes && { notes: o.notes }),
               })),
               skippedOperations = getSkippedOperations(),
               enriched = {
                  ...summary,
                  skippedTools: getMutable()?.skippedTools ?? summary.skippedTools,
                  grantedScope: scopePermsToString(scopeMap) ?? (getDecision() ? "" : getTokenResponse().scope),
                  resources: summary.resources.map((r) => {
                     const def = defsByType.get(r.type)
                     return { ...r, enabledOperations: def ? getEnabledActions(def, scopeMap) : [] }
                  }),
                  operations,
                  skippedOperations,
               }
            emitAudit({ ts: new Date().toISOString(), tool: "capabilities", operation: "capabilities", status: "ok", durationMs: auditTime(t0), ...(args["refresh"] ? { httpStatus: 200 } : {}) })
            return {
               content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
               structuredContent: enriched,
            }
         } catch (err) {
            const { log: errLog, client } = formatFhirError(err)
            log.error(`🔴 capabilities ERR ${errLog} (${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool: "capabilities", operation: "capabilities", status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err) })
            return {
               content: [{ type: "text" as const, text: client }],
               isError: true,
            }
         }
      },
   )
}
