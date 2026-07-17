import * as z from "zod"

const
   continuationSchema = z.object({
      kind: z.enum(["page", "chunk"]).describe("page = server next-link, chunk = local split of an oversized result"),
      url: z.string().describe("Pass this to the paginate tool to fetch the next portion"),
   }),

   prefetchSchema = z.object({
      pages: z.number().describe("Upstream FHIR pages fetched and merged"),
      upstreamEntries: z.number().describe("Total entries seen across upstream pages"),
      returnedEntries: z.number().describe("Entries included after compaction"),
   }),

   bundleSchema = z.object({
      entries: z.number().describe("Number of entries in this Bundle page"),
      total: z.number().optional().describe("Server-reported total match count, when provided"),
      jsonBytes: z.number().describe("Serialized byte size of the FHIR payload"),
   })

/** Metadata-only structured envelope for a native/binary artifact result — payload lives in an embedded resource block. */
export const artifactOutputSchema = z.object({
   status: z.literal("ok").describe("Always ok — an artifact was produced"),
   notes: z.array(z.string()).describe("Human-readable notes (e.g. ignored JSON-only shaping arguments)"),
   artifact: z.object({
      httpStatus: z.number().describe("Upstream HTTP status"),
      resource: z.string().optional().describe("Source FHIR resource type when known"),
      operation: z.string().optional().describe("Source FHIR operation when known"),
      fhirId: z.string().optional().describe("Source FHIR resource id when known"),
      mimeType: z.string().describe("Server-provided MIME type"),
      filename: z.string().describe("Sanitized filename for the artifact"),
      byteCount: z.number().describe("Actual decoded byte count of the content"),
      uri: z.string().describe("Stable private artifact URI (no upstream credentials)"),
      checksum: z.string().describe("Lowercase hex SHA-256 of the decoded bytes"),
   }).describe("Artifact metadata — the content is delivered as an MCP embedded resource, not here"),
})

/** Canonical structured envelope returned by every FHIR-wrapping tool (resource, paginate, operate, bundle, system_history). */
export const fhirJsonOutputSchema = z.object({
   status: z.enum(["ok", "truncated"]).describe("truncated = payload was too large and partially withheld"),
   responseMode: z.enum(["compact", "full"]).describe("Shape of data: compact (AI-oriented) or full (raw FHIR)"),
   compacted: z.boolean().describe("Whether compaction was applied to data"),
   truncated: z.boolean().describe("Whether the payload was truncated by the byte limit"),
   isBundle: z.boolean().describe("Whether data is a FHIR Bundle"),
   hasMore: z.boolean().describe("THE pagination signal — true when more results exist; use continuation.url"),
   notes: z.array(z.string()).describe("Human-readable warnings and response notes"),
   resourceType: z.string().optional().describe("FHIR resourceType of data when data is a single resource or Bundle"),
   fhirpathFiltered: z.boolean().optional().describe("Whether a FHIRPath expression filtered data locally"),
   fhirpathMatchCount: z.number().optional().describe("Number of FHIRPath matches when filtered"),
   bundle: bundleSchema.optional().describe("Bundle counters when data is a Bundle"),
   continuation: continuationSchema.optional().describe("Where to fetch the remainder when hasMore is true"),
   prefetch: prefetchSchema.optional().describe("Multi-page coalescing summary, when coalesced"),
   data: z.unknown().optional().describe("The shaped FHIR resource, Bundle, or FHIRPath node array; omitted when truncated"),
})

/** Output schema advertised by every FHIR-wrapping tool — a JSON envelope or a metadata-only artifact envelope. */
export const fhirOutputSchema = z.union([fhirJsonOutputSchema, artifactOutputSchema])

/** Structured output for the capabilities tool — the enriched CapabilityStatement summary. */
export const capabilitiesOutputSchema = z.object({
   available: z.boolean().optional().describe("false when the server CapabilityStatement is unavailable"),
   note: z.string().optional().describe("Explanation when metadata is unavailable"),
   serverUrl: z.string().optional().describe("FHIR server base URL"),
   fetchedAt: z.string().optional().describe("When metadata was last fetched"),
   mode: z.string().optional().describe("Metadata resolution mode"),
   systemInteractions: z.array(z.string()).optional().describe("System-level interactions the server advertises"),
   grantedScope: z.string().optional().describe("Effective granted SMART scope for this caller"),
   resources: z.array(z.record(z.string(), z.unknown())).optional().describe("Per-resource capability summaries"),
   operations: z.array(z.record(z.string(), z.unknown())).optional().describe("Enabled named operations"),
   skippedTools: z.array(z.record(z.string(), z.unknown())).optional().describe("Tools skipped by metadata or scope gating"),
   skippedOperations: z.array(z.record(z.string(), z.unknown())).optional().describe("Operations skipped by gating"),
})

/** Structured output for terminology_lookup — a single resolved code. */
export const terminologyLookupOutputSchema = z.object({
   system: z.string().describe("Terminology system key (loinc or snomed)"),
   code: z.string().describe("The looked-up code"),
   found: z.boolean().describe("Whether the code resolved to a display"),
   display: z.string().optional().describe("Human-readable display name when found"),
   version: z.string().optional().describe("Code system version when reported"),
   inactive: z.boolean().optional().describe("Whether the code is marked inactive"),
})

/** Structured output for code_search — a page of matching codes. */
export const codeSearchOutputSchema = z.object({
   system: z.string().describe("Terminology system key (loinc or snomed)"),
   filter: z.string().describe("The search text used"),
   count: z.number().describe("Requested page size"),
   offset: z.number().describe("Starting position of this page"),
   total: z.number().optional().describe("Server-reported total match count, when known"),
   hasMore: z.boolean().optional().describe("Whether more results exist beyond this page"),
   nextOffset: z.number().optional().describe("offset value for the next page when hasMore"),
   fallback: z.string().optional().describe("Broadened term used when no exact matches were found"),
   results: z.array(z.object({
      code: z.string(),
      display: z.string(),
   })).describe("Matching code/display pairs"),
})
