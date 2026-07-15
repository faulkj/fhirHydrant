import messages from "../../../config/messages/core.json" with { type: "json" }
import { applyFhirPath } from "./fhirpath.ts"
import { compact } from "./compact.ts"
import { bundleStats } from "./response-notes.ts"
import { outcomeNote } from "./outcomes.ts"
import { finalizeEnvelope } from "./finalize.ts"

const detectResourceType = (data: unknown): string | undefined => {
   if (!data || typeof data !== "object" || Array.isArray(data)) return undefined
   const rt = (data as Record<string, unknown>).resourceType
   return typeof rt === "string" ? rt : undefined
}

/** Builds the canonical response envelope from a FHIR result, applying FHIRPath, compact, notes, and byte limit. */
export const applyResponsePipeline = (opts: PipelineOpts): PipelineResult | { error: string } => {
   const
      { result, bundleResponse, fhirpathExpr, effectiveMode, wasDefaulted, extraNotes } = opts,
      sourceBytes = Buffer.byteLength(JSON.stringify(result), "utf8"),
      stats = bundleResponse ? bundleStats(result, JSON.stringify(result)) : undefined

   let
      data: unknown = result,
      filtered = false,
      matchCount = 0,
      compacted = false

   if (fhirpathExpr) {
      const fp = applyFhirPath(result, fhirpathExpr)
      if ("error" in fp) return { error: messages.fhirpathError.replace("{error}", fp.error) }
      filtered = true
      matchCount = fp.nodes.length
      data = fp.nodes
   }

   if (effectiveMode === "compact") {
      data = compact(data)
      compacted = true
   }

   const
      resourceType = detectResourceType(data),
      notes = [
         ...(extraNotes ?? []),
         stats?.nextUrl ? messages.responsePartial.replace("{entries}", String(stats.entries)) : undefined,
         outcomeNote(result),
         filtered ? messages.fhirpathFiltered.replace("{matchCount}", String(matchCount)).replace("{sourceBytes}", String(sourceBytes)) : undefined,
         wasDefaulted && compacted ? messages.responseModeCompact : undefined,
      ].filter((n): n is string => !!n),

      envelope: FhirEnvelope = {
         status: "ok",
         responseMode: effectiveMode,
         compacted,
         truncated: false,
         isBundle: bundleResponse,
         hasMore: !!stats?.nextUrl,
         notes,
         ...(resourceType && { resourceType }),
         ...(filtered && { fhirpathFiltered: true, fhirpathMatchCount: matchCount }),
         ...(stats && { bundle: { entries: stats.entries, ...(stats.total !== undefined && { total: stats.total }), jsonBytes: stats.jsonBytes } }),
         ...(stats?.nextUrl && { continuation: { kind: "page" as const, url: stats.nextUrl } }),
         data,
      },

      final = finalizeEnvelope(envelope)
   return { envelope: final.envelope, text: final.text, isError: final.isError, stats }
}
