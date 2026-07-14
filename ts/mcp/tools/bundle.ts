import type { McpServer } from "@modelcontextprotocol/server"
import type { z } from "zod"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { createFhirClient } from "../../fhir/auth/client.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { extractFhirPath } from "../../fhir/transform/fhirpath.ts"
import { extractResponseMode, resolveResponseMode } from "../../fhir/transform/compact.ts"
import { applyResponsePipeline } from "../../fhir/transform/pipeline.ts"
import { batchStatusNote } from "../../fhir/transform/response-notes.ts"
import { validateBundleRequest } from "../guards/bundle.ts"
import { readOnlyAnnotations, writeAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"

/** Registers the bundle tool on the MCP server. */
export const addBundle = (
   server: McpServer, description: string, inputSchema: z.ZodObject<z.ZodRawShape>,
): void => {
   const annotations = config.bundleWritesEnabled
      ? writeAnnotations(true, false)
      : readOnlyAnnotations

   server.registerTool(
      "bundle",
      { description, inputSchema, outputSchema: fhirOutputSchema, annotations },
      async (args: Record<string, unknown>) => {
         const
            t0 = Date.now(),
            fhirpathExpr = extractFhirPath(args),
            explicit = extractResponseMode(args),
            rawBody = typeof args["body"] === "string" ? args["body"] : undefined

         if (!rawBody) {
            emitAudit({ ts: new Date().toISOString(), tool: "bundle", operation: "bundle", status: "blocked", durationMs: auditTime(t0), validationBlocked: true })
            return { content: [{ type: "text" as const, text: "body parameter is required and must be a JSON string" }], isError: true }
         }

         const guard = validateBundleRequest(rawBody)
         if (!guard.ok) {
            emitAudit({ ts: new Date().toISOString(), tool: "bundle", operation: "bundle", status: "blocked", durationMs: auditTime(t0), validationBlocked: true })
            return guard.response
         }

         const { type, summary, warning } = guard
         const logTag = `Bundle.${type}`
         log.info(`🔥 ${logTag} → ${summary.readCount}R ${summary.writeCount}W`)

         try {
            const
               client = createFhirClient(),
               result = await withRetry(
                  logTag,
                  (signal) => client.request({
                     url: "",
                     method: "POST",
                     body: rawBody,
                     headers: { "Content-Type": "application/fhir+json" },
                     signal,
                  }),
                  3,
                  config.fhirRequestTimeoutMs,
               )

            const resolved = resolveResponseMode(explicit, undefined)
            if (!resolved) {
               emitAudit({ ts: new Date().toISOString(), tool: "bundle", operation: "bundle", status: "error", durationMs: auditTime(t0), bundleType: type, bundleEntryCount: summary.readCount + summary.writeCount, bundleReadCount: summary.readCount, bundleWriteCount: summary.writeCount })
               return { content: [{ type: "text" as const, text: "Invalid responseMode — must be \"compact\" or \"full\"" }], isError: true }
            }
            const
               { effectiveMode: rawMode, wasDefaulted } = resolved,
               effectiveMode = wasDefaulted && !config.responseMode ? "full" as ResponseMode : rawMode,
               entryCount = summary.readCount + summary.writeCount,
               summaryNote = entryCount > 0
                  ? `${type}: ${summary.readCount} read${summary.readCount !== 1 ? "s" : ""}, ${summary.writeCount} write${summary.writeCount !== 1 ? "s" : ""} (${summary.resourceTypes.join(", ")})`
                  : `${type}: empty Bundle`,
               pipeline = applyResponsePipeline({
                  result, bundleResponse: true, fhirpathExpr, effectiveMode, wasDefaulted,
                  extraNotes: [warning, summaryNote, batchStatusNote(result)].filter((n): n is string => !!n),
               })

            if ("error" in pipeline) {
               emitAudit({ ts: new Date().toISOString(), tool: "bundle", operation: "bundle", status: "error", durationMs: auditTime(t0), httpStatus: 200, bundleType: type, bundleEntryCount: summary.readCount + summary.writeCount, bundleReadCount: summary.readCount, bundleWriteCount: summary.writeCount })
               return { content: [{ type: "text" as const, text: pipeline.error }], isError: true }
            }

            const env = pipeline.envelope
            log.debug(`🟢 ${logTag} OK (${entryCount} entries, ${auditTime(t0)}ms)`)
            emitAudit({
               ts: new Date().toISOString(), tool: "bundle", operation: "bundle",
               status: env.truncated ? "truncated" : "ok", durationMs: auditTime(t0), httpStatus: 200,
               jsonBytes: Buffer.byteLength(pipeline.text, "utf8"),
               bundleType: type, bundleEntryCount: summary.readCount + summary.writeCount,
               bundleReadCount: summary.readCount, bundleWriteCount: summary.writeCount,
               responseMode: env.responseMode,
               ...(env.compacted && { compacted: true }),
               ...(env.fhirpathFiltered && { fhirpathFiltered: true, fhirpathMatchCount: env.fhirpathMatchCount }),
            })
            return { content: [{ type: "text" as const, text: pipeline.text }], structuredContent: env }
         } catch (err) {
            const { log: errLog, client } = formatFhirError(err)
            log.error(`🔴 ${logTag} ERR ${errLog} (${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool: "bundle", operation: "bundle", status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err), bundleType: type, bundleEntryCount: summary.readCount + summary.writeCount, bundleReadCount: summary.readCount, bundleWriteCount: summary.writeCount })
            return { content: [{ type: "text" as const, text: client }], isError: true }
         }
      },
   )
}
