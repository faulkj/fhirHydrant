import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import messages from "../../../config/messages.json" with { type: "json" }
import { config } from "../../config.ts"
import { enforceByteLimit, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { resolveSystem } from "../../fhir/terminology/systems.ts"
import { loincSearch, snomedSearch } from "../../fhir/terminology/search.ts"

const
   text = (s: string) => ({ type: "text" as const, text: s }),

   parseIntParam = (value: unknown, defaultVal: number, min: number, max?: number): number | undefined => {
      if (value === undefined || value === "") return defaultVal
      const n = Number(value)
      return Number.isInteger(n) && n >= min ? (max !== undefined ? Math.min(n, max) : n) : undefined
   }

export const addCodeSearch = (
   server: McpServer, description: string, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "code_search",
      { description, inputSchema },
      async (args: Record<string, unknown>) => {
         const
            t0 = Date.now(),
            systemKey = String(args["system"] ?? "").toLowerCase(),
            filter = String(args["filter"] ?? ""),
            resolved = resolveSystem(systemKey),
            audit = (status: AuditEvent["status"], httpStatus?: number) =>
               emitAudit({ ts: new Date().toISOString(), tool: "code_search", operation: "expand", status, durationMs: auditTime(t0), ...(httpStatus && { httpStatus }), system: systemKey })

         if (!resolved)
            return audit("blocked"), { content: [text(messages.terminologyInvalidSystem.replace("{system}", systemKey))], isError: true }

         const count = parseIntParam(args["count"], 10, 1, 50)
         if (count === undefined)
            return audit("blocked"), { content: [text(messages.terminologyInvalidCount.replace("{count}", String(args["count"])))], isError: true }

         const offset = parseIntParam(args["offset"], 0, 0)
         if (offset === undefined)
            return audit("blocked"), { content: [text(messages.terminologyInvalidOffset.replace("{offset}", String(args["offset"])))], isError: true }

         try {
            const isLoinc = systemKey === "loinc"

            if (isLoinc) {
               const { page, total, exhausted, fallback } = await loincSearch(resolved.vsUrl, filter, offset, count)

               if (!page.length) {
                  audit("ok", 200)
                  const msg = offset > 0
                     ? messages.terminologyNoMoreResults.replace("{system}", "LOINC").replace("{filter}", filter).replace("{offset}", String(offset))
                     : messages.terminologySearchNoResults.replace("{system}", "LOINC").replace("{filter}", filter)
                  return { content: [text(msg)] }
               }

               const
                  from = offset + 1,
                  to = offset + page.length,
                  suffix = exhausted ? "" : "+",
                  fallbackNote = fallback ? `No exact matches for "${filter}" — showing results for "${fallback}" ranked by relevance.\n` : "",
                  header = `${fallbackNote}LOINC search: ${from}–${to} of ${total}${suffix} results for "${filter}"`,
                  hasMore = offset + count < total || !exhausted,
                  hint = hasMore ? `\nNext page: offset=${offset + count}` : "",
                  body = `${header}\n\n${page.join("\n")}${hint}`,
                  shaped = enforceByteLimit(body, config.fhirMaxResponseBytes)

               console.log(`🟢 code_search OK — ${page.length} results`)
               audit(shaped.isError ? "truncated" : "ok", 200)
               return { content: [text(shaped.text)], ...(shaped.isError && { isError: true }) }
            }

            const { page, total } = await snomedSearch(resolved.vsUrl, filter, offset, count)

            if (!page.length) {
               audit("ok", 200)
               return { content: [text(messages.terminologySearchNoResults.replace("{system}", "SNOMED").replace("{filter}", filter))] }
            }

            const
               header = total !== undefined
                  ? `SNOMED search: ${page.length} of ${total} results for "${filter}"`
                  : `SNOMED search: ${page.length} results for "${filter}"`,
               body = `${header}\n\n${page.join("\n")}`,
               shaped = enforceByteLimit(body, config.fhirMaxResponseBytes)

            console.log(`🟢 code_search OK — ${page.length} results (SNOMED)`)
            audit(shaped.isError ? "truncated" : "ok", 200)
            return { content: [text(shaped.text)], ...(shaped.isError && { isError: true }) }
         } catch (err) {
            const { log, client } = formatFhirError(err)
            console.error(`🔴 code_search ERR ${log}`)
            audit("error", errorStatus(err))
            return { content: [text(messages.terminologyError.replace("{message}", client))], isError: true }
         }
      },
   )
}
