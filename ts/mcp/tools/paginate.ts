import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import messages from "../../../config/messages/core.json" with { type: "json" }
import { log } from "../../log.ts"
import { emitAudit, auditTime } from "../../audit.ts"
import { isChunkUrl, retrieveChunk } from "../../fhir/transform/bundle-chunks.ts"
import { serializeEnvelope } from "../../fhir/transform/serialize.ts"
import { scopeActions } from "../../fhir/auth/scopes.ts"
import { getDecision, getEffectiveScope } from "../authz/context.ts"
import { validatePageUrl, pageUrlResource } from "./validate-page-url.ts"
import { readOnlyAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"
import { executeRead } from "../handlers/read-response.ts"

const paginateScopeDenied = (validatedUrl: string): string | undefined => {
   const decision = getDecision()
   if (!decision) return undefined
   const resource = pageUrlResource(validatedUrl)
   if (!resource)
      return decision.admin ? undefined : "🔑 pagination of system-level endpoints requires the Admin role"
   const allowed = scopeActions(resource, getEffectiveScope())
   return allowed.has("search") || allowed.has("read")
      ? undefined
      : `🔑 paginate not permitted by granted scopes for ${resource}`
}

/** Registers the paginate tool for fetching next-page Bundle results. */
export const addPaginate = (
   server: McpServer, def: CoreToolDef, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "paginate",
      { title: def.title, description: def.description, inputSchema, outputSchema: fhirOutputSchema, annotations: readOnlyAnnotations },
      async (args: Record<string, unknown>) => {
         const t0 = Date.now()
         try {
            const validatedUrl = validatePageUrl(args["url"] as string)

            if (isChunkUrl(validatedUrl)) {
               const envelope = retrieveChunk(validatedUrl)
               if (!envelope) {
                  emitAudit({ ts: new Date().toISOString(), tool: "paginate", operation: "paginate", status: "error", durationMs: auditTime(t0) })
                  return { content: [{ type: "text" as const, text: (messages as Record<string, string>)["paginationChunkExpired"] ?? "Chunk expired. Re-fetch the original server page URL." }], isError: true }
               }
               log.debug("🟢 Paginate (chunk)")
               emitAudit({ ts: new Date().toISOString(), tool: "paginate", operation: "paginate", status: "ok", durationMs: auditTime(t0) })
               return { content: [{ type: "text" as const, text: serializeEnvelope(envelope) }], structuredContent: envelope }
            }

            const deny = paginateScopeDenied(validatedUrl)
            if (deny) {
               log.debug(`🔑 Paginate scope blocked — ${deny}`)
               emitAudit({ ts: new Date().toISOString(), tool: "paginate", operation: "paginate", status: "blocked", durationMs: auditTime(t0), scopeBlocked: true })
               return { content: [{ type: "text" as const, text: deny }], isError: true }
            }

            return executeRead({
               url: validatedUrl, tool: "paginate", op: "paginate", args, t0,
               isBundle: true, allowCoalesce: true,
               source: { operation: "paginate", ...(pageUrlResource(validatedUrl) && { resource: pageUrlResource(validatedUrl)! }) },
            })
         } catch (err) {
            // validatePageUrl throws on invalid URLs
            const msg = err instanceof Error ? err.message : String(err)
            log.error(`🔴 Paginate ERR ${msg} (${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool: "paginate", operation: "paginate", status: "error", durationMs: auditTime(t0) })
            return { content: [{ type: "text" as const, text: msg }], isError: true }
         }
      },
   )
}
