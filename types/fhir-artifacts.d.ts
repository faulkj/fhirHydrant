/** How a normalized FHIR response was classified at the HTTP boundary. */
type NormalizedKind = "json" | "artifact" | "no-content"

/** Reason an artifact body could not be produced — each maps to a distinct client-facing message. */
type ArtifactFailureCode =
   | "over-limit"
   | "malformed-base64"
   | "unreadable-body"
   | "unsupported-body"

/** Where an artifact came from — supplied by the handler, never derived from an authenticated URL. */
interface ArtifactSource {
   resource?: string
   operation?: string
   id?: string
}

/** Decoded artifact payload plus the metadata needed to describe it without duplicating bytes. */
interface FhirArtifact {
   bytes: Uint8Array
   mimeType: string
   isText: boolean
   filename: string
   byteCount: number
   checksum: string
   httpStatus: number
   source: ArtifactSource
   notes: string[]
}

/** Discriminated result of normalizing one successful FHIR HTTP response. */
type NormalizedFhirResponse =
   | { kind: "json"; data: unknown }
   | { kind: "artifact"; artifact: FhirArtifact }
   | { kind: "no-content" }
   | { kind: "error"; code: ArtifactFailureCode; message: string }

/** Metadata-only structured envelope for an artifact tool result — never carries the payload. */
interface ArtifactEnvelope {
   status: "ok"
   notes: string[]
   artifact: {
      httpStatus: number
      resource?: string
      operation?: string
      fhirId?: string
      mimeType: string
      filename: string
      byteCount: number
      uri: string
      checksum: string
   }
}

/** Authenticated raw HTTP response captured at the FHIR boundary before any content decoding. */
interface RawFhirResponse {
   status: number
   headers: Headers
   body: ReadableStream<Uint8Array> | null
}

/** Optional method/body/headers for a raw FHIR request (defaults to GET with no body). */
interface RawRequestInit {
   method?: string
   body?: string
   headers?: Record<string, string>
}

/** Outcome of draining a raw body under the artifact byte limit. */
type DrainResult =
   | { ok: true; bytes: Uint8Array }
   | { ok: false; code: ArtifactFailureCode; message: string }

/** MCP embedded text resource content block. */
interface McpTextResourceBlock {
   type: "resource"
   resource: { uri: string; mimeType: string; text: string }
}

/** MCP embedded blob resource content block (base64 payload). */
interface McpBlobResourceBlock {
   type: "resource"
   resource: { uri: string; mimeType: string; blob: string }
}
