FHIR query results are returned as a structured JSON envelope. Every FHIR-data
tool (resource tools, `paginate`, `operate`, `bundle`, `system_history`) returns
the same shape. The tool's `content` text is a serialization of this envelope,
and clients that support structured output receive it as `structuredContent`.

Envelope fields:

- `data` — the FHIR payload: a Bundle for searches and pagination, a resource
  for direct reads, or an array of nodes when a FHIRPath expression was applied.
  Omitted only when the payload was too large and had to be withheld.
- `resourceType` — the FHIR resourceType of `data` when it is a single resource
  or Bundle.
- `status` — `"ok"` or `"truncated"`. `"truncated"` means the payload exceeded
  the byte limit and was partially withheld.
- `responseMode` — `"compact"` or `"full"`.
- `compacted` — whether compaction was applied.
- `isBundle` — whether `data` is a Bundle.
- `hasMore` — the single pagination signal. When `true`, more results exist;
  use `continuation.url`.
- `continuation` — `{ kind, url }` when `hasMore` is true. `kind` is `"page"`
  (a server next-link) or `"chunk"` (a locally split oversized result). Pass
  `url` to `paginate` to fetch the remainder.
- `bundle` — `{ entries, total?, jsonBytes }` when `data` is a Bundle.
- `prefetch` — `{ pages, upstreamEntries, returnedEntries }` when multiple
  upstream pages were coalesced.
- `fhirpathFiltered` / `fhirpathMatchCount` — present when a FHIRPath expression
  filtered `data` locally.
- `notes` — human-readable warnings and response notes.

Search responses are shaped to avoid overly broad clinical data retrieval. If
`status` is `"truncated"`, retry with narrower search parameters such as
patient, encounter, category, code, date, status, or a lower `_count` when that
parameter is available. Do not treat a truncated response as evidence that no
matching clinical data exists.

## Native (non-JSON) artifact responses

When a FHIR endpoint returns native content — a document, image, audio, video,
DICOM, RTF, HTML, XML, CSV, NDJSON, ZIP, or `application/octet-stream` body, or a
JSON FHIR Binary with base64 `data` — the response is normalized into an
**artifact** result instead of the JSON envelope above. The artifact result has:

- `structuredContent` with metadata only: `status`, `artifact.httpStatus`,
  `artifact.resource`/`operation`/`fhirId` when known, `mimeType`, `filename`,
  `byteCount` (actual decoded bytes), `uri` (a stable private
  `fhirhydrant://artifact/...` identifier — never an upstream credentialed URL),
  and `checksum` (SHA-256).
- A concise text block describing the artifact for clients that do not render
  embedded resources.
- One MCP embedded resource content block carrying the actual bytes: `text` for
  textual content, base64 `blob` otherwise. The payload is never duplicated in
  `structuredContent` or the text block.

Artifact bytes are capped by `FHIR_MAX_ARTIFACT_MB` (not the JSON response
limit), are never chunked or truncated, and are never passed through FHIRPath,
compaction, or Bundle coalescing. JSON-only shaping arguments (`fhirpath`,
`responseMode`, `prefetch`, `maxResults`) supplied on a call that yields an
artifact are ignored, and a note lists them. Retrieve `DocumentReference` or
`Media` metadata first, then call the referenced Binary; attachments are not
dereferenced automatically.
