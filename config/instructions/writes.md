## Write Operations

Some tools include an `action` parameter because write operations are enabled.
The `action` enum only lists operations the server actually supports for that
resource — check the tool's schema. Omitting `action` preserves normal
search/read behavior. Each tool's description explains its available write
actions and required parameters.

Always confirm destructive operations (update, patch, delete) with the user
before executing. For create, verify the user has provided all required fields
for the resource type.

Write payloads are checked before they are sent: `body.resourceType` must match
the tool, `body.id` must be a valid FHIR id, references should be `Type/id`,
`#contained`, or an absolute URL, and a `create` body should omit `id` (the
server assigns it). Patch bodies must be a JSON Patch array (RFC 6902). Build
payloads accordingly to avoid rejected writes; if a write is blocked, read the
returned message and correct the payload before retrying.
