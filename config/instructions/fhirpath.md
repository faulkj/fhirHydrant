When the FHIR server does not support `_elements` or `_summary`, or when you
need projection beyond what those controls offer, use the `fhirpath` parameter
for client-side filtering. The expression is a standard FHIRPath expression
evaluated locally against the full FHIR response — the FHIR server never sees
it. For search Bundles, write expressions against the Bundle structure (e.g.
`Bundle.entry.resource.name`). For direct reads, write expressions against the
single resource (e.g. `Patient.name.given`). Prefer `_elements` or `_summary`
when available — they reduce data at the source and save bandwidth.
