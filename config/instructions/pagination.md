Search responses carry a `hasMore` field. When `hasMore` is `true`, more
results are available — call `paginate` with `continuation.url` to fetch the
next portion. Repeat until `hasMore` is `false`. Never construct pagination
URLs manually — only use the `continuation.url` returned by the server.

In compact mode, the server automatically fetches multiple upstream FHIR pages
and returns one consolidated compact Bundle (see the `prefetch` field). This
means a single search or paginate call may already contain multiple upstream
pages of entries. If `hasMore` is `true`, call `paginate` with
`responseMode=compact` and `continuation.url` to continue from where the server
stopped. You do not need to repeatedly paginate through small pages — the
server handles that internally. Use `maxResults` to set a target for how many
compact entries you want back. Pass `prefetch=false` if you need single-page
control for debugging.

`continuation.kind` may be `"chunk"` when an oversized result was split locally;
paginate through chunks the same way as server pages. Whether to continue depends
on whether the retrieved data already covers the requested range — see Retrieval
Discipline rule 5.

`hasMore` is the authoritative signal that more results exist — always trust it
over `total`. A Bundle `total` (in `bundle.total`) is the server's reported
match count and may be absent, approximate, or smaller than the number of records
you can actually page through. Never conclude that retrieval is complete just
because the returned entry count reached `total`; if `hasMore` is `true`, keep
paginating.

Search results default to compact mode, which strips FHIR noise (meta,
extensions, narrative, contained resources) and simplifies data types for
token efficiency while preserving clinical meaning. Compact responses keep
native Bundle keys (`entry`, `link`) so pagination works normally. Use
`responseMode=full` when you need raw FHIR structure — extensions,
provenance, narrative, or full coding systems. Direct reads default to
full. If `responseMode` is absent from the tool schema, compact is
server-enforced.
