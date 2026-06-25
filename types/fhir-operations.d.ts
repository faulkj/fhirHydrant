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

/** Result from the response pipeline — ready to emit as MCP content. */
interface PipelineResult {
   text: string
   isError: boolean
   stats: BundleStats | undefined
   effectiveMode: ResponseMode
   compacted: boolean
   fhirpathFiltered: boolean
   fhirpathMatchCount: number
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
