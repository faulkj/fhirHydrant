import { checksum } from "../fhir/response/body.ts"

const
   ARTIFACT_ERROR: Record<ArtifactFailureCode, string> = {
      "over-limit": "Artifact exceeds the configured FHIR_MAX_ARTIFACT_MB limit and was not returned. Increase the limit or retrieve a smaller resource.",
      "malformed-base64": "The FHIR Binary contained invalid or non-canonical base64 data and could not be decoded.",
      "unreadable-body": "The response body could not be read.",
      "unsupported-body": "The response body type is not supported.",
   },

   artifactUri = (a: FhirArtifact): string => {
      const id = a.source.id ?? checksum(a.bytes).slice(0, 32)
      return `fhirhydrant://artifact/${encodeURIComponent(a.source.resource ?? a.source.operation ?? "fhir")}/${encodeURIComponent(id)}`
   },

   metadataText = (env: ArtifactEnvelope): string => {
      const a = env.artifact
      return [
         `FHIR artifact (${a.mimeType}, ${a.byteCount} bytes)`,
         `filename: ${a.filename}`,
         a.fhirId ? `id: ${a.fhirId}` : undefined,
         `uri: ${a.uri}`,
         `sha256: ${a.checksum}`,
         ...env.notes,
         "The content is attached as an MCP embedded resource; it is not duplicated here.",
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
   content: [{ type: "text" as const, text: `${ARTIFACT_ERROR[code]} (${detail})` }],
   isError: true as const,
})
