Search results are FHIR Bundles that may contain a `link` array. If a `link`
entry has `relation: "next"`, more results are available. Call `paginate`
with that entry's `url` to fetch the next page. Repeat until no `next` link is
present. Never construct pagination URLs manually — only use URLs returned by
the FHIR server.

In compact mode, the server automatically fetches multiple upstream FHIR pages
and returns one consolidated compact Bundle. This means a single search or
paginate call may already contain multiple upstream pages of entries. If the response includes
a `next` link, call `paginate` with `responseMode=compact` to continue from
where the server stopped. You do not need to repeatedly paginate through small
pages — the server handles that internally. Use `maxResults` to set a target
for how many compact entries you want back. Pass `prefetch=false` if you need
single-page control for debugging.

If a response header includes `⚠️ MORE PAGES`, additional data exists beyond
this page. Call `paginate` with the URL from the `Next:` line in that same
header to continue. Whether to continue depends on whether the retrieved data
already covers the requested range — see Retrieval Discipline rule 5.

Search results default to compact mode, which strips FHIR noise (meta,
extensions, narrative, contained resources) and simplifies data types for
token efficiency while preserving clinical meaning. Compact responses keep
native Bundle keys (`entry`, `link`) so pagination works normally. Use
`responseMode=full` when you need raw FHIR structure — extensions,
provenance, narrative, or full coding systems. Direct reads default to
full. If `responseMode` is absent from the tool schema, compact is
server-enforced.
