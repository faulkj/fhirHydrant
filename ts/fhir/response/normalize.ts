import { config } from "../../config/index.ts"
import { loadMessages } from "../../config/text.ts"
import { rawFhirRequest } from "../auth/client.ts"
import { drainBody, decodeBase64, asUtf8, checksum } from "./body.ts"
import { preserveMime, baseType, isTextualType, resolveFilename } from "./media.ts"
import { outcomeNote } from "../transform/outcomes.ts"

const
   messages = loadMessages("artifact"),
   JSON_TYPE = /[/+]json\b/i,

   outcomeText = (data: unknown): string | undefined => outcomeNote(data),

   throwHttp = (status: number, message: string): never => {
      const err = new Error(message) as Error & { statusCode: number, statusText: string }
      err.statusCode = status
      err.statusText = ""
      throw err
   },

   buildArtifact = (bytes: Uint8Array, mime: string, disposition: string | null, status: number, source: ArtifactSource): FhirArtifact => {
      const
         text = isTextualType(mime) ? asUtf8(bytes) : undefined,
         notes = isTextualType(mime) && text === undefined ? [messages.artifactInvalidUtf8Note] : [],
         sum = checksum(bytes)
      return {
         bytes, mimeType: mime, isText: text !== undefined, filename: resolveFilename(disposition, mime, source),
         byteCount: bytes.byteLength, checksum: sum, httpStatus: status, source, notes,
      }
   },

   normalizeBinary = (data: unknown, status: number, source: ArtifactSource): NormalizedFhirResponse => {
      const r = data as Record<string, unknown>
      if (typeof r.data !== "string") return { kind: "json", data }
      const decoded = decodeBase64(r.data, config.fhirMaxArtifactBytes)
      if (!decoded.ok) return { kind: "error", code: decoded.code, message: decoded.message }
      const mime = preserveMime(null, typeof r.contentType === "string" ? r.contentType : undefined)
      return { kind: "artifact", artifact: buildArtifact(decoded.bytes, mime, null, status, { ...source, id: typeof r.id === "string" ? r.id : source.id }) }
   }

/**
 * Fetches a user-facing FHIR URL at the raw HTTP boundary and classifies it: parsed JSON (including
 * non-Binary resources), a native/JSON-Binary artifact, no-content, or a categorized failure. Native
 * bytes are consumed exactly once under the artifact byte limit; text bytes are never re-encoded.
 */
export const normalizeFhirResponse = async (
   url: string, source: ArtifactSource, signal: AbortSignal | undefined, init?: RawRequestInit,
): Promise<NormalizedFhirResponse> => {
   const
      res = await rawFhirRequest(url, signal, init),
      ctype = res.headers.get("content-type"),
      disposition = res.headers.get("content-disposition")

   if (res.status === 204) return { kind: "no-content" }

   if (ctype && JSON_TYPE.test(ctype)) {
      // JSON is drained under the larger artifact ceiling, NOT the model-facing JSON limit —
      // FHIR_MAX_RESPONSE_BYTES is enforced later by the pipeline so it can chunk/retry.
      const drained = await drainBody(res.body, config.fhirMaxArtifactBytes)
      if (!drained.ok)
         return drained.code === "over-limit"
            ? throwHttp(413, `Upstream JSON response exceeded ${config.fhirMaxArtifactBytes} bytes`)
            : { kind: "error", code: drained.code, message: drained.message }
      if (drained.bytes.byteLength === 0)
         return res.status >= 400 ? throwHttp(res.status, `HTTP ${res.status}`) : { kind: "no-content" }
      const text = asUtf8(drained.bytes)
      if (text === undefined) return { kind: "error", code: "unreadable-body", message: "JSON response was not valid UTF-8" }
      const data = JSON.parse(text)
      if (res.status >= 400) return throwHttp(res.status, outcomeText(data) ?? `HTTP ${res.status}`)
      return data && typeof data === "object" && (data as Record<string, unknown>).resourceType === "Binary"
         ? normalizeBinary(data, res.status, source)
         : { kind: "json", data }
   }

   const drained = await drainBody(res.body, config.fhirMaxArtifactBytes)
   if (!drained.ok) return { kind: "error", code: drained.code, message: drained.message }
   if (res.status >= 400) {
      const detail = (isTextualType(preserveMime(ctype)) && asUtf8(drained.bytes)?.trim()) || `HTTP ${res.status}`
      return throwHttp(res.status, detail.length > 300 ? `${detail.slice(0, 297)}...` : detail)
   }
   const mime = preserveMime(ctype)
   if (drained.bytes.byteLength === 0 && baseType(mime) === "application/octet-stream" && !ctype)
      return { kind: "no-content" }
   return { kind: "artifact", artifact: buildArtifact(drained.bytes, mime, disposition, res.status, source) }
}
