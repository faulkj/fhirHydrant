/** A single parameter definition in config/core-tools.json. */
interface CoreToolParam {
   type: "string" | "boolean" | "number"
   optional?: boolean
   description: string
   /** Fixed set of allowed string values — renders as an enum (dropdown) instead of freetext. Only valid with type "string". */
   enum?: string[]
}

/** A single entry in config/core-tools.json. */
interface CoreToolDef {
   name: string
   title: string
   description: string
   params: Record<string, CoreToolParam>
}

/** Gate keys that conditionally include an instruction section, mapped to config predicates by the composer. */
type InstructionGate = "terminology" | "writes" | "operations" | "bundle"

/** A single ordered entry in config/instructions/manifest.json. */
interface InstructionSection {
   /** Markdown filename within config/instructions/ (e.g. "core.md"). */
   file: string
   /** Optional feature gate — the section is included only when the named feature is enabled. Omit for always-on sections. */
   when?: InstructionGate
}

/** Parsed stats from a FHIR Bundle response — shared between response notes and audit. */
interface BundleStats {
   entries: number
   total: number | undefined
   jsonBytes: number
   nextUrl: string | undefined
}

/** A built MCP server plus the dynamic tool handles a transport must remove to re-register on change. */
interface ServerBuild {
   server: import("@modelcontextprotocol/server").McpServer
   dynamicHandles: import("@modelcontextprotocol/server").RegisteredTool[]
}

/** Handle returned by transport start functions; provides attach (bind server factory), refresh (rebuild dynamic tools), and close operations. */
interface TransportHandle {
   attach: (factory: ServerFactory) => Promise<void>
   refresh: () => void
   close: () => Promise<void>
}

/** Options for the shared read/search/history/paginate execution wrapper. */
interface ReadOpts {
   url: string
   tool: string
   resource?: string
   op: AuditEvent["operation"]
   args: Record<string, unknown>
   t0: number
   isBundle: boolean
   allowCoalesce?: boolean
   search?: { url: string; countInjected: boolean; countCapped: boolean; countSkipped: boolean }
   notes?: string[]
   source?: ArtifactSource
}

/** Result of pure client-side write-payload validation — blocking errors and non-blocking warnings. */
interface WriteBodyValidation {
   errors: string[]
   warnings: string[]
}

/** Result of resource request validation — either success (directId + op) or an early-exit MCP error response. */
type GuardResult =
   | { ok: true; directId: string | undefined; op: AuditEvent["operation"]; versionId?: string; parsedBody?: unknown }
   | { ok: false; response: { content: { type: "text"; text: string }[]; isError: true } }

/** Result from tryChunkBundle when chunking is possible — the first chunk's envelope. */
interface ChunkBuildResult {
   envelope: FhirEnvelope
}

/** Return shape from the coalescing loop — canonical envelope plus audit stats. */
interface CoalesceResult {
   envelope: FhirEnvelope
   text: string
   isError: boolean
   pagesFetched: number
   entriesSeen: number
   entriesReturned: number
   rawBytes: number
   truncated: boolean
   truncateReason?: string
}

/** Accumulated state from walking upstream FHIR pages, before response shaping. */
interface CoalescePages {
   entries: unknown[]
   outcomeNotes: Set<string>
   pages: number
   entriesSeen: number
   rawBytes: number
   nextUrl?: string
   truncated: boolean
   truncateReason?: string
   bundleType: unknown
   serverTotal?: number
}

/** Summary of a successfully preflighted Bundle — entry counts and resource types touched. */
interface BundlePreflightSummary {
   readCount: number
   writeCount: number
   resourceTypes: string[]
}

/** Result of bundle request validation — success with parsed Bundle or failure with error response. */
type BundleGuardResult =
   | { ok: true; bundle: Record<string, unknown>; type: BundleType; summary: BundlePreflightSummary; warning?: string }
   | { ok: false; response: { content: { type: "text"; text: string }[]; isError: true } }
