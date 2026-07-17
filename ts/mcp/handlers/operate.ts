import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { extractFhirPath } from "../../fhir/transform/fhirpath.ts"
import { extractResponseMode, resolveResponseMode } from "../../fhir/transform/compact.ts"
import { applyResponsePipeline } from "../../fhir/transform/pipeline.ts"
import { normalizeFhirResponse } from "../../fhir/response/normalize.ts"
import { artifactResult, artifactError } from "../artifact-result.ts"
import { validateOperateArgs } from "../guards/validate-operate.ts"

/** Creates the handler function for the operate MCP tool. */
export const makeOperateHandler = (enabledOps: OperationDefinition[]) =>
   async (args: Record<string, unknown>) => {
      const
         t0 = Date.now(),
         fhirpathExpr = extractFhirPath(args),
         explicit = extractResponseMode(args)
      const guard = validateOperateArgs(args, enabledOps)
      if (!guard.ok) return guard.response

      const { op, id, resource, params, body } = guard

      const resolvedLevel: OperationLevel = id && op.level.includes("instance")
         ? "instance"
         : op.level.includes("type")
            ? "type"
            : "system"

      const url = resolvedLevel === "instance"
         ? `${resource}/${id}/${op.operation}`
         : resolvedLevel === "type"
            ? `${resource}/${op.operation}`
            : op.operation.replace(/^\$/, "/$")

      const qs = Object.entries(params)
         .filter(([k]) => k !== "resourceType")
         .flatMap(([k, v]) =>
            Array.isArray(v)
               ? v.map((item) => `${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`)
               : v != null ? [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`] : [])
         .join("&")

      const fullUrl = qs ? `${url}?${qs}` : url
      const logTag = `${resource}.${op.operation}`
      log.info(`🔥 ${logTag} ${op.method} → ${fullUrl}`)

      // $match: validate Parameters shape and auto-inject onlyCertainMatches
      let finalBody = body
      if (op.key === "match" && finalBody) {
         try {
            const parsed = JSON.parse(finalBody)
            if (parsed.resourceType !== "Parameters" || !Array.isArray(parsed.parameter)) {
               emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "blocked", durationMs: auditTime(t0), validationBlocked: true })
               return { content: [{ type: "text" as const, text: "$match body must be a FHIR Parameters resource with a parameter array" }], isError: true }
            }
            if (!parsed.parameter.some((p: Record<string, unknown>) => p.name === "onlyCertainMatches"))
               parsed.parameter.push({ name: "onlyCertainMatches", valueBoolean: true })
            finalBody = JSON.stringify(parsed)
         } catch { /* JSON syntax errors caught by guards/operate */ }
      }

      const resolved = resolveResponseMode(explicit, undefined)
      if (!resolved) {
         emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "error", durationMs: auditTime(t0), httpStatus: 200 })
         return { content: [{ type: "text" as const, text: "Invalid responseMode — must be \"compact\" or \"full\"" }], isError: true }
      }
      const
         { effectiveMode: rawMode, wasDefaulted } = resolved,
         effectiveMode = op.defaultResponseMode && wasDefaulted && !config.responseMode ? op.defaultResponseMode : rawMode

      try {
         const
            source: ArtifactSource = { resource: resource ?? undefined, operation: op.operation, ...(id && { id }) },
            init = op.method === "POST"
               ? { method: "POST", ...(finalBody ? { body: finalBody, headers: { "Content-Type": "application/fhir+json" } } : {}) }
               : undefined,
            normalized = await withRetry(
               `${resource} ${op.operation}`,
               (signal) => normalizeFhirResponse(fullUrl, source, signal, init),
               3,
               config.fhirRequestTimeoutMs,
            )

         if (normalized.kind === "error") {
            emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "error", durationMs: auditTime(t0), httpStatus: 200 })
            return artifactError(normalized.code, normalized.message)
         }
         if (normalized.kind === "artifact") {
            if (fhirpathExpr || explicit) normalized.artifact.notes.push("Artifact response — JSON-only shaping arguments ignored.")
            log.debug(`🟢 ${logTag} OK (artifact ${normalized.artifact.byteCount}B ${normalized.artifact.mimeType}, ${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "ok", durationMs: auditTime(t0), httpStatus: normalized.artifact.httpStatus })
            return artifactResult(normalized.artifact)
         }
         const result = normalized.kind === "no-content" ? {} : normalized.data
         const pipeline = applyResponsePipeline({
            result, bundleResponse: op.bundleResponse, fhirpathExpr, effectiveMode, wasDefaulted,
         })

         if ("error" in pipeline) {
            emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "error", durationMs: auditTime(t0), httpStatus: 200 })
            return { content: [{ type: "text" as const, text: pipeline.error }], isError: true }
         }

         const env = pipeline.envelope
         log.debug(`🟢 ${logTag} OK (${Buffer.byteLength(pipeline.text, "utf8")}B, ${auditTime(t0)}ms)`)
         emitAudit({
            ts: new Date().toISOString(), tool: "operate", resource,
            operation: op.auditOperation as AuditEvent["operation"],
            status: env.truncated ? "truncated" : "ok",
            durationMs: auditTime(t0), httpStatus: 200,
            jsonBytes: Buffer.byteLength(pipeline.text, "utf8"),
            ...(pipeline.stats && { bundleEntries: pipeline.stats.entries, bundleTotal: pipeline.stats.total, hasNext: !!pipeline.stats.nextUrl }),
            ...(env.fhirpathFiltered && { fhirpathFiltered: true, fhirpathMatchCount: env.fhirpathMatchCount }),
            responseMode: env.responseMode,
            ...(env.compacted && { compacted: true }),
         })
         return { content: [{ type: "text" as const, text: pipeline.text }], structuredContent: env }
      } catch (err) {
         const { log: errLog, client } = formatFhirError(err)
         log.error(`🔴 ${logTag} ERR ${errLog} (${auditTime(t0)}ms)`)
         emitAudit({ ts: new Date().toISOString(), tool: "operate", resource, operation: op.auditOperation as AuditEvent["operation"], status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err) })
         return { content: [{ type: "text" as const, text: client }], isError: true }
      }
   }
