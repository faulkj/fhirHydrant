import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { getResourceMeta, isMetadataAvailable } from "../../fhir/model/metadata.ts"
import { scopeAllowsResource } from "../../fhir/auth/scopes.ts"
import { getMutable } from "../authz/context.ts"

let skippedOps: Array<{ key: string, reason: string, gate: "metadata" | "scope" }> = []

const
   sink = (): typeof skippedOps => {
      const mutable = getMutable()
      if (!mutable) return skippedOps
      return mutable.skippedOps ??= []
   },

   reset = (): void => {
      sink().length = 0
   }

/** Returns operations skipped during gating — per request when authz is on. */
export const getSkippedOperations = (): typeof skippedOps => sink()

/** Filters operations against cached /metadata. In strict mode, operations are skipped when the resource is missing or the operation is not advertised. In warn mode, unadvertised operations are registered with a debug note. */
export const filterOperationsByMetadata = (
   ops: OperationDefinition[],
): OperationDefinition[] => {
   if (!isMetadataAvailable() || config.metadataMode === "off") return ops

   const enabled: OperationDefinition[] = []
   reset()

   for (const op of ops) {
      if (!op.resource) {
         enabled.push(op)
         continue
      }
      const meta = getResourceMeta(op.resource)
      if (!meta && config.metadataMode === "strict") {
         const reason = `${op.resource} not in /metadata`
         log.debug(`🏥 ${reason} — operation "${op.key}" skipped`)
         sink().push({ key: op.key, reason, gate: "metadata" })
         continue
      }
      if (meta) {
         const opName = op.operation.replace(/^\$/, "")
         if (!meta.operations.includes(opName)) {
            if (config.metadataMode === "strict") {
               const reason = `${op.resource} does not advertise ${op.operation}`
               log.debug(`🏥 ${reason} — operation "${op.key}" skipped`)
               sink().push({ key: op.key, reason, gate: "metadata" })
               continue
            }
            log.debug(`🏥 ${op.resource} does not advertise ${op.operation} — registering anyway (warn mode)`)
         }
      }
      enabled.push(op)
   }
   return enabled
}

/** Filters operations against granted SMART scopes. */
export const filterOperationsByScopes = (
   ops: OperationDefinition[], scopeMap: Map<string, Set<ScopePermission>>,
): OperationDefinition[] => {
   if (scopeMap.size === 0) return ops
   const enabled: OperationDefinition[] = []
   for (const op of ops) {
      if (!op.resource) {
         enabled.push(op)
         continue
      }
      if (scopeAllowsResource(op.resource, scopeMap)) {
         enabled.push(op)
      } else {
         const reason = `${op.resource} not in granted scopes`
         log.debug(`🔑 ${reason} — operation "${op.key}" skipped`)
         sink().push({ key: op.key, reason, gate: "scope" })
      }
   }
   return enabled
}
