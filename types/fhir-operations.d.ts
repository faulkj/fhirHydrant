/** A single parameter definition in config/operations.json. */
interface OperationParamDef {
   type: "string" | "boolean" | "number"
   optional?: boolean
   description: string
   repeat?: boolean
   default?: string | number | boolean
}

/** Raw shape of a single entry in config/operations.json. */
interface OperationDefinitionRaw {
   key: string
   operation: string
   resource: string | null
   level: OperationLevel[]
   method: "GET" | "POST"
   description: string
   params: Record<string, OperationParamDef>
   requiresOneOf?: string[][]
   acceptsBody?: boolean
   bundleResponse: boolean
   auditOperation: string
   affectsState: boolean
   defaultResponseMode?: ResponseMode
   notes?: string
}

/** Describes a FHIR operation and its runtime schema — built from config/operations.json. */
interface OperationDefinition {
   key: string
   operation: string
   resource: string | null
   level: OperationLevel[]
   method: "GET" | "POST"
   description: string
   params: Record<string, OperationParamDef>
   requiresOneOf: string[][]
   acceptsBody: boolean
   bundleResponse: boolean
   auditOperation: string
   affectsState: boolean
   defaultResponseMode: ResponseMode | undefined
   notes: string | undefined
}

/** Options for the shared response pipeline. */
interface PipelineOpts {
   result: unknown
   bundleResponse: boolean
   fhirpathExpr?: string
   effectiveMode: ResponseMode
   wasDefaulted: boolean
   extraNotes?: string[]
}

/** Result from the response pipeline — carries the canonical envelope plus emit hints. */
interface PipelineResult {
   envelope: FhirEnvelope
   text: string
   isError: boolean
   stats: BundleStats | undefined
}

/** Where to fetch the remainder of a paged/chunked result — one place for the model to look. */
interface EnvelopeContinuation {
   kind: "page" | "chunk"
   url: string
}

/** Multi-page coalescing summary surfaced to the model. */
interface EnvelopePrefetch {
   pages: number
   upstreamEntries: number
   returnedEntries: number
}

/** Bundle-specific counters lifted from BundleStats. */
interface EnvelopeBundle {
   entries: number
   total?: number
   jsonBytes: number
}

/** Canonical structured response envelope shared by all FHIR-wrapping MCP tools. */
interface FhirEnvelope {
   status: "ok" | "truncated"
   responseMode: ResponseMode
   compacted: boolean
   truncated: boolean
   isBundle: boolean
   hasMore: boolean
   notes: string[]
   resourceType?: string
   fhirpathFiltered?: boolean
   fhirpathMatchCount?: number
   bundle?: EnvelopeBundle
   continuation?: EnvelopeContinuation
   prefetch?: EnvelopePrefetch
   data?: unknown
}

/** Trimmed, JSON-serializable summary of the FHIR server's CapabilityStatement. */
interface CapabilitySummary {
   serverUrl: string
   fetchedAt: string
   mode: Config["metadataMode"]
   systemInteractions: string[]
   resources: Array<{
      type: string
      interactions: string[]
      searchParams: string[]
      operations: string[]
      includes: string[]
      revincludes: string[]
      enabledOperations?: ToolAction[]
   }>
   grantedScope?: string
   skippedTools: Array<{
      toolName: string
      reason: string
      gate?: "metadata" | "scope"
   }>
}
