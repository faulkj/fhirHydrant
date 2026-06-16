import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import messages from "../../../config/messages.json" with { type: "json" }
import { config } from "../../config.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { resolveSystem, txFetch } from "../../fhir/terminology/systems.ts"

/** Registers the terminology_lookup tool for CodeSystem/$lookup queries */
export const addTerminologyLookup = (
   server: McpServer, description: string, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "terminology_lookup",
      { description, inputSchema },
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
               result = await withRetry("terminology_lookup", (signal) => txFetch(base, path, signal), 3, config.fhirRequestTimeoutMs) as Record<string, unknown>,
               params = Array.isArray(result.parameter) ? result.parameter as Array<Record<string, unknown>> : [],
               display = params.find(p => p.name === "display")?.valueString as string | undefined,
               version = params.find(p => p.name === "version")?.valueString as string | undefined,
               inactive = params.find(p => p.name === "inactive")?.valueBoolean as boolean | undefined

            if (!display) {
               emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "ok", durationMs: auditTime(t0), httpStatus: 200, system: systemKey })
               return { content: [{ type: "text" as const, text: messages.terminologyLookupNotFound.replace("{system}", systemKey.toUpperCase()).replace("{code}", code) }] }
            }

            const
               label = systemKey.toUpperCase(),
               lines = [
                  `${label} ${code} - ${display}`,
                  version ? `Version: ${version}` : undefined,
                  inactive ? "Status: inactive" : undefined,
               ].filter(Boolean)

            emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "ok", durationMs: auditTime(t0), httpStatus: 200, system: systemKey })
            return { content: [{ type: "text" as const, text: lines.join("\n") }] }
         } catch (err) {
            const { log, client } = formatFhirError(err)
            console.error(`🔴 terminology_lookup ERR ${log}`)
            emitAudit({ ts: new Date().toISOString(), tool: "terminology_lookup", operation: "lookup", status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err), system: systemKey })
            return { content: [{ type: "text" as const, text: messages.terminologyError.replace("{message}", client) }], isError: true }
         }
      },
   )
}
