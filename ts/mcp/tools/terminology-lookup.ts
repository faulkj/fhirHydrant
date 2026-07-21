import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import { loadMessages } from "../../config/text.ts"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { resolveSystem, txFetch } from "../../fhir/terminology/systems.ts"
import { readOnlyAnnotations } from "../annotations.ts"
import { terminologyLookupOutputSchema } from "../output.ts"

const messages = loadMessages("terminology")

/** Registers the terminology_lookup tool for CodeSystem/$lookup queries */
export const addTerminologyLookup = (
   server: McpServer, def: CoreToolDef, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "terminology_lookup",
      { title: def.title, description: def.description, inputSchema, outputSchema: terminologyLookupOutputSchema, annotations: readOnlyAnnotations },
      async (args: Record<string, unknown>) => {
         const
            t0 = Date.now(),
            systemKey = String(args["system"] ?? "").toLowerCase(),
            code = String(args["code"] ?? ""),
            resolved = resolveSystem(systemKey)

         if (!resolved) {
            emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "blocked", durationMs: auditTime(t0), system: systemKey })
            return { content: [{ type: "text" as const, text: messages.terminologyInvalidSystem.replace("{system}", systemKey) }], isError: true }
         }

         const base = config.fhirTerminologyBaseUrl!
         try {
            const
               path = `/CodeSystem/$lookup?system=${encodeURIComponent(resolved.url)}&code=${encodeURIComponent(code)}`,
               result = await withRetry("terminology_lookup", (signal) => txFetch(base, path, signal), 2, config.fhirTerminologyTimeoutMs) as Record<string, unknown>,
               params = Array.isArray(result.parameter) ? result.parameter as Array<Record<string, unknown>> : [],
               display = params.find(p => p.name === "display")?.valueString as string | undefined,
               version = params.find(p => p.name === "version")?.valueString as string | undefined,
               inactive = params.find(p => p.name === "inactive")?.valueBoolean as boolean | undefined

            if (!display) {
               emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "ok", durationMs: auditTime(t0), httpStatus: 200, system: systemKey })
               const notFound = { system: systemKey, code, found: false }
               return { content: [{ type: "text" as const, text: JSON.stringify(notFound) }], structuredContent: notFound }
            }

            const resolvedCode = {
               system: systemKey,
               code,
               found: true,
               display,
               ...(version && { version }),
               ...(inactive && { inactive: true }),
            }

            emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "ok", durationMs: auditTime(t0), httpStatus: 200, system: systemKey })
            log.debug(`🟢 terminology_lookup OK (${auditTime(t0)}ms)`)
            return { content: [{ type: "text" as const, text: JSON.stringify(resolvedCode) }], structuredContent: resolvedCode }
         } catch (err) {
            const { log: errLog, client } = formatFhirError(err)
            log.error(`🔴 terminology_lookup ERR ${errLog} (${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err), system: systemKey })
            return { content: [{ type: "text" as const, text: messages.terminologyError.replace("{message}", client) }], isError: true }
         }
      },
   )
}
