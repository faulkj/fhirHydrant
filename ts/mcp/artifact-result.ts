import { checksum } from "../fhir/response/body.ts"
import { loadMessages } from "../config/text.ts"

const
   messages = loadMessages("artifact"),
   ERROR_KEY: Record<ArtifactFailureCode, keyof typeof messages> = {
      "over-limit": "artifactOverLimit",
      "malformed-base64": "artifactMalformedBase64",
      "unreadable-body": "artifactUnreadableBody",
      "unsupported-body": "artifactUnsupportedBody",
   },

   artifactUri = (a: FhirArtifact): string => {
      const id = a.source.id ?? checksum(a.bytes).slice(0, 32)
      return `fhirhydrant://artifact/${encodeURIComponent(a.source.resource ?? a.source.operation ?? "fhir")}/${encodeURIComponent(id)}`
   },

   metadataText = (env: ArtifactEnvelope): string => {
      const a = env.artifact
      return [
         messages.artifactHeading.replace("{mimeType}", a.mimeType).replace("{byteCount}", String(a.byteCount)),
         messages.artifactFilenameLine.replace("{filename}", a.filename),
         a.fhirId ? messages.artifactIdLine.replace("{fhirId}", a.fhirId) : undefined,
         messages.artifactUriLine.replace("{uri}", a.uri),
         messages.artifactChecksumLine.replace("{checksum}", a.checksum),
         ...env.notes,
         messages.artifactAttachedNote,
      ].filter(Boolean).join("\n")
   }

/** Builds the metadata-only artifact envelope (never carries the payload). */
export const artifactEnvelope = (a: FhirArtifact): ArtifactEnvelope => ({
   status: "ok",
   notes: a.notes,
   artifact: {
      httpStatus: a.httpStatus,
      ...(a.source.resource && { resource: a.source.resource }),
      ...(a.source.operation && { operation: a.source.operation }),
      ...(a.source.id && { fhirId: a.source.id }),
      mimeType: a.mimeType,
      filename: a.filename,
      byteCount: a.byteCount,
      uri: artifactUri(a),
      checksum: a.checksum,
   },
})

/** Emits an MCP tool result: concise metadata text, structured envelope, and one embedded text/blob block. */
export const artifactResult = (a: FhirArtifact) => {
   const
      env = artifactEnvelope(a),
      uri = env.artifact.uri,
      block: McpTextResourceBlock | McpBlobResourceBlock = a.isText
         ? { type: "resource", resource: { uri, mimeType: a.mimeType, text: new TextDecoder().decode(a.bytes) } }
         : { type: "resource", resource: { uri, mimeType: a.mimeType, blob: Buffer.from(a.bytes).toString("base64") } }
   return {
      content: [{ type: "text" as const, text: metadataText(env) }, block],
      structuredContent: env,
   }
}

/** Maps a categorized artifact failure to a client-facing MCP error result. */
export const artifactError = (code: ArtifactFailureCode, detail: string) => ({
   content: [{ type: "text" as const, text: `${messages[ERROR_KEY[code]]} (${detail})` }],
   isError: true as const,
})
