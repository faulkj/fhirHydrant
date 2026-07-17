import messages from "../../../config/messages/core.json" with { type: "json" }
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { rebuildWithCount } from "../../fhir/transform/shaping.ts"
import { extractFhirPath } from "../../fhir/transform/fhirpath.ts"
import { extractResponseMode, resolveResponseMode } from "../../fhir/transform/compact.ts"
import { coalesce } from "../../fhir/transform/coalesce.ts"
import { applyResponsePipeline } from "../../fhir/transform/pipeline.ts"
import { normalizeFhirResponse } from "../../fhir/response/normalize.ts"
import { artifactResult, artifactError } from "../artifact-result.ts"
import { extractMaxResults, extractPrefetch, ignoredShapingNote } from "./read-args.ts"

/** Shared FHIR fetch → transform → audit execution. Returns an MCP tool response. */
export const executeRead = async (opts: ReadOpts) => {
   const
      { tool, resource, op, args, t0, isBundle, allowCoalesce, search, notes } = opts,
      fhirpathExpr = extractFhirPath(args),
      explicit = extractResponseMode(args),
      maxResults = extractMaxResults(args),
      prefetchEnabled = extractPrefetch(args),
      logTag = resource ? `${resource}.${op[0].toUpperCase()}${op.slice(1)}` : op

   const resolved = resolveResponseMode(explicit, !isBundle ? "unused" : undefined)
   if (!resolved)
      return { content: [{ type: "text" as const, text: "Invalid responseMode — must be \"compact\" or \"full\"" }], isError: true }
   const { effectiveMode, wasDefaulted } = resolved

   let
      url = opts.url,
      retries = 0,
      currentCount = 0
   log.info(`🔥 ${logTag} → ${url}`)

   const source: ArtifactSource = opts.source ?? { ...(resource && { resource }), operation: op }

   try {
      while (true) { // eslint-disable-line no-constant-condition
         const normalized = await withRetry(
            `${resource ?? "system"} ${op}`,
            (signal) => normalizeFhirResponse(url, source, signal),
            3,
            config.fhirRequestTimeoutMs,
         )

         if (normalized.kind === "error") {
            emitAudit({ ts: new Date().toISOString(), tool, resource, operation: op, status: "error", durationMs: auditTime(t0), httpStatus: 200 })
            return artifactError(normalized.code, normalized.message)
         }
         if (normalized.kind === "artifact") {
            const note = ignoredShapingNote(fhirpathExpr, explicit, prefetchEnabled, maxResults)
            if (note) normalized.artifact.notes.push(note)
            log.debug(`🟢 ${logTag} OK (artifact ${normalized.artifact.byteCount}B ${normalized.artifact.mimeType}, ${auditTime(t0)}ms)`)
            emitAudit({ ts: new Date().toISOString(), tool, resource, operation: op, status: "ok", durationMs: auditTime(t0), httpStatus: normalized.artifact.httpStatus })
            return artifactResult(normalized.artifact)
         }
         const result = normalized.kind === "no-content" ? {} : normalized.data

         // Coalesce: multi-page fetch when conditions are met
         if (allowCoalesce && effectiveMode === "compact" && prefetchEnabled && !fhirpathExpr) {
            const r = result as Record<string, unknown>
            if (r.resourceType === "Bundle" && Array.isArray(r.link) &&
               (r.link as Record<string, unknown>[]).some((l) => l?.relation === "next" && typeof l?.url === "string")) {
               const c = await coalesce(result, source, logTag, maxResults, t0)
               log.debug(`🟢 ${logTag} OK (coalesced ${c.pagesFetched} pages, ${c.entriesReturned} entries)`)
               emitAudit({
                  ts: new Date().toISOString(), tool, resource, operation: op,
                  status: c.envelope.truncated ? "truncated" : "ok", durationMs: auditTime(t0), httpStatus: 200,
                  prefetchPages: c.pagesFetched, prefetchEntries: c.entriesReturned,
                  prefetchRawBytes: c.rawBytes, prefetchTruncated: c.truncated || undefined,
                  ...(c.truncateReason && { prefetchTruncateReason: c.truncateReason }),
                  responseMode: effectiveMode, compacted: true,
               })
               return { content: [{ type: "text" as const, text: c.text }], structuredContent: c.envelope }
            }
         }

         const retryNote = retries > 0
            ? messages.responseAutoRetried
               .replace("{original}", String(search ? new URLSearchParams(search.url.split("?")[1] ?? "").get("_count") ?? "?" : "?"))
               .replace("{reduced}", String(currentCount)).replace("{limit}", String(config.fhirMaxResponseBytes))
            : undefined
         const pipeline = applyResponsePipeline({
            result, bundleResponse: isBundle, fhirpathExpr, effectiveMode, wasDefaulted,
            extraNotes: [...(notes ?? []), ...(retryNote ? [retryNote] : [])].filter(Boolean) as string[],
         })
         if ("error" in pipeline) {
            emitAudit({ ts: new Date().toISOString(), tool, resource, operation: op, status: "error", durationMs: auditTime(t0), httpStatus: 200, ...(fhirpathExpr && { fhirpathFiltered: true }) })
            return { content: [{ type: "text" as const, text: pipeline.error }], isError: true }
         }

         const env = pipeline.envelope

         // Count auto-retry: only for truncated search paths with a rebuildable URL
         if (env.truncated && search && pipeline.stats) {
            const next = Math.floor((currentCount || pipeline.stats.entries || config.fhirDefaultCount) / 2)
            if (next >= 1) {
               currentCount = next
               retries++
               url = rebuildWithCount(search.url, currentCount)
               log.info(`✂️ ${resource}: response too large, retrying with _count=${currentCount}`)
               continue
            }
         }

         log.debug(`🟢 ${logTag} OK (${pipeline.stats?.entries ?? 1}E, ${auditTime(t0)}ms)`)
         emitAudit({
            ts: new Date().toISOString(), tool, resource, operation: op,
            status: env.truncated ? "truncated" : "ok", durationMs: auditTime(t0), httpStatus: 200,
            ...(pipeline.stats && { bundleEntries: pipeline.stats.entries, bundleTotal: pipeline.stats.total, hasNext: !!pipeline.stats.nextUrl }),
            ...(search && { countInjected: search.countInjected, countCapped: search.countCapped, countSkipped: search.countSkipped }),
            ...(retries > 0 && { autoRetryCount: retries }),
            ...(env.fhirpathFiltered && { fhirpathFiltered: true, fhirpathMatchCount: env.fhirpathMatchCount }),
            responseMode: env.responseMode,
            ...(env.compacted && { compacted: true }),
         })
         return { content: [{ type: "text" as const, text: pipeline.text }], structuredContent: env }
      }
   } catch (err) {
      const { log: errLog, client } = formatFhirError(err)
      log.error(`🔴 ${logTag} ERR ${errLog} (${auditTime(t0)}ms)`)
      emitAudit({ ts: new Date().toISOString(), tool, resource, operation: op, status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err) })
      return { content: [{ type: "text" as const, text: client }], isError: true }
   }
}
