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
