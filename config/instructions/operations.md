## FHIR Named Operations

Use the `operate` tool to invoke FHIR named operations. These go beyond simple
search/read — they execute server-side logic and return specialized results.

Call `capabilities` to see the currently enabled operation catalog, including
required parameters and levels. The `operation` parameter accepts catalog keys
(e.g. `everything`, `lastn`) — a leading `$` is optional.

Currently enabled operations:

{{OPERATIONS_LIST}}

Use resource tools for standard search/read. Use `operate` when you need
server-side aggregation, validation, or specialized queries that go beyond CRUD.
