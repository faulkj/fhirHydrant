import { loadMessages } from "../../config/text.ts"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { createFhirClient } from "../../fhir/auth/client.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"
import { emitAudit, auditTime, errorStatus } from "../../audit.ts"
import { extractFhirPath } from "../../fhir/transform/fhirpath.ts"
import { extractResponseMode, resolveResponseMode } from "../../fhir/transform/compact.ts"
import { applyResponsePipeline } from "../../fhir/transform/pipeline.ts"
import { serializeEnvelope } from "../../fhir/transform/serialize.ts"
import { serverValidate } from "./write-validate.ts"

const
   messages = loadMessages("write"),
   coreMessages = loadMessages("core"),
   WRITE_OPS = new Set<WriteAction>(["create", "update", "patch", "delete"]),
   SERVER_VALIDATE_OPS = new Set<WriteAction>(["create", "update"]),

   noDataEnvelope = (note: string): FhirEnvelope => ({
      status: "ok", responseMode: "full", compacted: false, truncated: false,
      isBundle: false, hasMore: false, notes: [note],
   })

/** True when an operation is a write action. */
export const isWriteOp = (op: AuditEvent["operation"]): op is WriteAction =>
   WRITE_OPS.has(op as WriteAction)

/**
 * Executes a FHIR write operation (create/update/patch/delete) using fhirclient
 * native methods. Body validation and normalization is done by guards/request,
 * parsedBody is the already-validated (and id-injected for update) object.
 */
export const executeWrite = async (
   toolName: string, def: ResourceDefinition,
   op: WriteAction, args: Record<string, unknown>, t0: number,
   parsedBody?: unknown,
): Promise<{ content: { type: "text", text: string }[], structuredContent?: FhirEnvelope, isError?: true }> => {
   const
      logTag = `${def.resource}.${op[0].toUpperCase()}${op.slice(1)}`,
      id = typeof args["_id"] === "string" && args["_id"] ? args["_id"] : undefined,
      body = parsedBody ?? (typeof args["body"] === "string" ? JSON.parse(args["body"]) : undefined)

   try {
      const
         client = createFhirClient()

      if (config.validateWrites === "server" && SERVER_VALIDATE_OPS.has(op)) {
         const failure = await serverValidate(client, def, op, body, id)
         if (failure) {
            log.debug(`🔎 ${logTag} server $validate blocked (${auditTime(t0)}ms)`)
            emitAudit({
               ts: new Date().toISOString(), tool: toolName, resource: def.resource,
               operation: "validate", status: "blocked", durationMs: auditTime(t0), validationBlocked: true,
            })
            return { content: [{ type: "text" as const, text: failure }], isError: true }
         }
      }

      if (config.writeDryRun) {
         log.info(`🧪 ${logTag} DRY RUN → ${op} ${def.resource}${id ? '/' + id : ''} (not executed)`)
         emitAudit({
            ts: new Date().toISOString(), tool: toolName, resource: def.resource,
            operation: op, status: "ok", durationMs: auditTime(t0), dryRun: true,
         })
         const envelope = noDataEnvelope(messages.writeDryRun.replace("{action}", op).replace("{resourceType}", def.resource))
         return { content: [{ type: "text" as const, text: serializeEnvelope(envelope) }], structuredContent: envelope }
      }

      const resolved = resolveResponseMode(extractResponseMode(args), undefined)
      if (!resolved)
         return { content: [{ type: "text" as const, text: coreMessages.invalidResponseMode }], isError: true }

      log.info(`🔥 ${logTag} → ${op} ${def.resource}${id ? '/' + id : ''}`)
      const result = await withRetry(`${def.resource} ${op}`, (signal) => {
         if (op === "create") return client.create(body, { signal })
         if (op === "update") return client.update(body, { signal })
         if (op === "delete") return client.delete(`${def.resource}/${id}`, { signal })
         // patch
         return client.patch(`${def.resource}/${id}`, body, { signal })
      }, 3, config.fhirRequestTimeoutMs)

      // A returned resource is echoed through the canonical envelope; an empty response (typical delete) uses a no-data envelope.
      const note = messages.writeSucceeded.replace("{action}", op).replace("{resourceType}", def.resource)
      let envelope: FhirEnvelope, text: string
      if (result && typeof result === "object") {
         const pipeline = applyResponsePipeline({
            result, bundleResponse: false, fhirpathExpr: extractFhirPath(args),
            effectiveMode: resolved.effectiveMode, wasDefaulted: resolved.wasDefaulted, extraNotes: [note],
         })
         if ("error" in pipeline)
            return { content: [{ type: "text" as const, text: pipeline.error }], isError: true }
         envelope = pipeline.envelope
         text = pipeline.text
      } else {
         envelope = noDataEnvelope(note)
         text = serializeEnvelope(envelope)
      }

      log.debug(`🟢 ${logTag} OK (${Buffer.byteLength(text, "utf8")}B, ${auditTime(t0)}ms)`)
      emitAudit({
         ts: new Date().toISOString(), tool: toolName, resource: def.resource,
         operation: op, status: "ok", durationMs: auditTime(t0), httpStatus: 200,
         jsonBytes: Buffer.byteLength(text, "utf8"),
      })
      return { content: [{ type: "text" as const, text }], structuredContent: envelope }
   } catch (err) {
      const { log: errLog, client } = formatFhirError(err)
      log.error(`🔴 ${logTag} ERR ${errLog} (${auditTime(t0)}ms)`)
      emitAudit({
         ts: new Date().toISOString(), tool: toolName, resource: def.resource,
         operation: op, status: "error", durationMs: auditTime(t0), httpStatus: errorStatus(err),
      })
      return { content: [{ type: "text" as const, text: client }], isError: true }
   }
}
