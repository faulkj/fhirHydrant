FHIR query results include a short plain-text header followed by unmodified FHIR
JSON. The JSON may be a Bundle for searches and pagination, or a resource for
direct reads. The header identifies the resource type and payload size. For
Bundles, it also includes the entry count, total (when known), and next-page URL
when present. The header may also note when the server allowed a vendor-specific
or unadvertised search behavior.

Search responses are shaped to avoid overly broad clinical data retrieval. If a
tool returns `Response too large`, retry with narrower search parameters such as
patient, encounter, category, code, date, status, or a lower `_count` when that
parameter is available. Do not treat an oversized response error as evidence
that no matching clinical data exists.
