import { log } from "./log.ts"

/** Builds a fire-and-forget HTTP audit sink that POSTs each event via the given body shaper. */
export const httpSink = (
   url: string, shape: (e: AuditEvent) => unknown, contentType: string, auth?: string,
): AuditSinkFn =>
   (e) =>
      void fetch(url, {
         method: "POST",
         headers: { "Content-Type": contentType, ...(auth ? { Authorization: auth } : {}) },
         body: JSON.stringify(shape(e)),
         signal: AbortSignal.timeout(5000),
      }).catch((err) => log.error(`🔍 HTTP audit failed: ${err instanceof Error ? err.message : err}`))

/** Maps an internal AuditEvent to a minimal FHIR R4 AuditEvent resource (PHI-light, resource type only). */
export const toFhirAuditEvent = (e: AuditEvent): FhirAuditEvent => ({
   resourceType: "AuditEvent",
   type: { system: "http://terminology.hl7.org/CodeSystem/audit-event-type", code: "rest", display: "RESTful Operation" },
   subtype: [subtypeFor(e.operation)],
   action: actionFor(e.operation),
   recorded: e.ts,
   outcome: outcomeFor(e.status),
   agent: [{ requestor: true, who: { display: e.user ?? "unknown" } }],
   source: { observer: { display: "fhirHydrant" } },
   ...(e.resource
      ? { entity: [{ type: { system: "http://hl7.org/fhir/resource-types", code: e.resource } }] }
      : {}),
})

const
   REST = "http://hl7.org/fhir/restful-interaction",
   LOCAL = "urn:fhirhydrant:audit-operation",

   REST_CODES = new Set([
      "search", "read", "vread", "history-instance", "history-type", "create", "update", "patch", "delete",
   ]),

   CREATE = new Set(["create"]),
   UPDATE = new Set(["update", "patch"]),
   DELETE = new Set(["delete"]),

   subtypeFor = (op: string): { system: string; code: string } =>
      op === "search"
         ? { system: REST, code: "search-type" }
         : REST_CODES.has(op)
            ? { system: REST, code: op }
            : { system: LOCAL, code: op },

   actionFor = (op: string): FhirAuditEvent["action"] =>
      CREATE.has(op)
         ? "C"
         : UPDATE.has(op)
            ? "U"
            : DELETE.has(op)
               ? "D"
               : "R",

   outcomeFor = (status: AuditEvent["status"]): FhirAuditEvent["outcome"] =>
      status === "ok" || status === "truncated"
         ? "0"
         : status === "blocked"
            ? "4"
            : "8"
