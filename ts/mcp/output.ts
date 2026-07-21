import * as z from "zod"
import { loadText } from "../config/text.ts"

const
   descriptions = loadText("messages/output-schema.json"),
   d = (key: string): string => {
      const val = descriptions[key]
      if (!val) throw new Error(`config/messages/output-schema.json: missing description "${key}"`)
      return val
   },

   continuationSchema = z.object({
      kind: z.enum(["page", "chunk"]).describe(d("continuation.kind")),
      url: z.string().describe(d("continuation.url")),
   }),

   prefetchSchema = z.object({
      pages: z.number().describe(d("prefetch.pages")),
      upstreamEntries: z.number().describe(d("prefetch.upstreamEntries")),
      returnedEntries: z.number().describe(d("prefetch.returnedEntries")),
   }),

   bundleSchema = z.object({
      entries: z.number().describe(d("bundle.entries")),
      total: z.number().optional().describe(d("bundle.total")),
      jsonBytes: z.number().describe(d("bundle.jsonBytes")),
   })

/** Metadata-only structured envelope for a native/binary artifact result — payload lives in an embedded resource block. */
export const artifactOutputSchema = z.object({
   status: z.literal("ok").describe(d("artifact.status")),
   notes: z.array(z.string()).describe(d("artifact.notes")),
   artifact: z.object({
      httpStatus: z.number().describe(d("artifact.httpStatus")),
      resource: z.string().optional().describe(d("artifact.resource")),
      operation: z.string().optional().describe(d("artifact.operation")),
      fhirId: z.string().optional().describe(d("artifact.fhirId")),
      mimeType: z.string().describe(d("artifact.mimeType")),
      filename: z.string().describe(d("artifact.filename")),
      byteCount: z.number().describe(d("artifact.byteCount")),
      uri: z.string().describe(d("artifact.uri")),
      checksum: z.string().describe(d("artifact.checksum")),
   }).describe(d("artifact.object")),
})

/** Canonical structured envelope returned by every FHIR-wrapping tool (resource, paginate, operate, bundle, system_history). */
export const fhirJsonOutputSchema = z.object({
   status: z.enum(["ok", "truncated"]).describe(d("fhir.status")),
   responseMode: z.enum(["compact", "full"]).describe(d("fhir.responseMode")),
   compacted: z.boolean().describe(d("fhir.compacted")),
   truncated: z.boolean().describe(d("fhir.truncated")),
   isBundle: z.boolean().describe(d("fhir.isBundle")),
   hasMore: z.boolean().describe(d("fhir.hasMore")),
   notes: z.array(z.string()).describe(d("fhir.notes")),
   resourceType: z.string().optional().describe(d("fhir.resourceType")),
   fhirpathFiltered: z.boolean().optional().describe(d("fhir.fhirpathFiltered")),
   fhirpathMatchCount: z.number().optional().describe(d("fhir.fhirpathMatchCount")),
   bundle: bundleSchema.optional().describe(d("fhir.bundle")),
   continuation: continuationSchema.optional().describe(d("fhir.continuation")),
   prefetch: prefetchSchema.optional().describe(d("fhir.prefetch")),
   data: z.unknown().optional().describe(d("fhir.data")),
})

/** Output schema advertised by every FHIR-wrapping tool — a JSON envelope or a metadata-only artifact envelope. */
export const fhirOutputSchema = z.union([fhirJsonOutputSchema, artifactOutputSchema])

/** Structured output for the capabilities tool — the enriched CapabilityStatement summary. */
export const capabilitiesOutputSchema = z.object({
   available: z.boolean().optional().describe(d("capabilities.available")),
   note: z.string().optional().describe(d("capabilities.note")),
   serverUrl: z.string().optional().describe(d("capabilities.serverUrl")),
   fetchedAt: z.string().optional().describe(d("capabilities.fetchedAt")),
   mode: z.string().optional().describe(d("capabilities.mode")),
   systemInteractions: z.array(z.string()).optional().describe(d("capabilities.systemInteractions")),
   grantedScope: z.string().optional().describe(d("capabilities.grantedScope")),
   resources: z.array(z.record(z.string(), z.unknown())).optional().describe(d("capabilities.resources")),
   operations: z.array(z.record(z.string(), z.unknown())).optional().describe(d("capabilities.operations")),
   skippedTools: z.array(z.record(z.string(), z.unknown())).optional().describe(d("capabilities.skippedTools")),
   skippedOperations: z.array(z.record(z.string(), z.unknown())).optional().describe(d("capabilities.skippedOperations")),
})

/** Structured output for terminology_lookup — a single resolved code. */
export const terminologyLookupOutputSchema = z.object({
   system: z.string().describe(d("terminologyLookup.system")),
   code: z.string().describe(d("terminologyLookup.code")),
   found: z.boolean().describe(d("terminologyLookup.found")),
   display: z.string().optional().describe(d("terminologyLookup.display")),
   version: z.string().optional().describe(d("terminologyLookup.version")),
   inactive: z.boolean().optional().describe(d("terminologyLookup.inactive")),
})

/** Structured output for code_search — a page of matching codes. */
export const codeSearchOutputSchema = z.object({
   system: z.string().describe(d("codeSearch.system")),
   filter: z.string().describe(d("codeSearch.filter")),
   count: z.number().describe(d("codeSearch.count")),
   offset: z.number().describe(d("codeSearch.offset")),
   total: z.number().optional().describe(d("codeSearch.total")),
   hasMore: z.boolean().optional().describe(d("codeSearch.hasMore")),
   nextOffset: z.number().optional().describe(d("codeSearch.nextOffset")),
   fallback: z.string().optional().describe(d("codeSearch.fallback")),
   results: z.array(z.object({
      code: z.string(),
      display: z.string(),
   })).describe(d("codeSearch.results")),
})
