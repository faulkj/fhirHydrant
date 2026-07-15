import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import messages from "../../../config/messages/terminology.json" with { type: "json" }
import { log } from "../../log.ts"
import { formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { resolveSystem } from "../../fhir/terminology/systems.ts"
import { loincSearch, snomedSearch } from "../../fhir/terminology/search.ts"
import { readOnlyAnnotations } from "../annotations.ts"
import { codeSearchOutputSchema } from "../output.ts"

const
   text = (s: string) => ({ type: "text" as const, text: s }),

   toResults = (page: string[]): Array<{ code: string, display: string }> =>
      page.map((line) => {
         const i = line.indexOf(" - ")
         return i < 0 ? { code: line, display: "" } : { code: line.slice(0, i), display: line.slice(i + 3) }
      }),

   emit = (structured: Record<string, unknown>) => ({ content: [text(JSON.stringify(structured))], structuredContent: structured }),

   parseIntParam = (value: unknown, defaultVal: number, min: number, max?: number): number | undefined => {
      if (value === undefined || value === "") return defaultVal
      const n = Number(value)
      return Number.isInteger(n) && n >= min ? (max !== undefined ? Math.min(n, max) : n) : undefined
   }

/** Registers the code_search tool for LOINC/SNOMED ValueSet expansion */
export const addCodeSearch = (
   server: McpServer, def: CoreToolDef, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   server.registerTool(
      "code_search",
      { title: def.title, description: def.description, inputSchema, outputSchema: codeSearchOutputSchema, annotations: readOnlyAnnotations },
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
            if (systemKey === "loinc") {
               const
                  { page, total, exhausted, fallback } = await loincSearch(resolved.vsUrl, filter, offset, count),
                  hasMore = page.length > 0 && (offset + count < total || !exhausted)
               log.debug(`🟢 code_search OK — ${page.length} results (${auditTime(t0)}ms)`)
               audit("ok", 200)
               return emit({
                  system: systemKey, filter, count, offset, total,
                  hasMore, ...(hasMore && { nextOffset: offset + count }),
                  ...(fallback && { fallback }), results: toResults(page),
               })
            }

            const { page, total } = await snomedSearch(resolved.vsUrl, filter, offset, count)
            log.debug(`🟢 code_search OK — ${page.length} results, SNOMED (${auditTime(t0)}ms)`)
            audit("ok", 200)
            return emit({
               system: systemKey, filter, count, offset,
               ...(total !== undefined && { total }), results: toResults(page),
            })
         } catch (err) {
            const { log: errLog, client } = formatFhirError(err)
            log.error(`🔴 code_search ERR ${errLog} (${auditTime(t0)}ms)`)
            audit("error", errorStatus(err))
            return { content: [text(messages.terminologyError.replace("{message}", client))], isError: true }
         }
      },
   )
}
