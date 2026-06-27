import type { McpServer } from "@modelcontextprotocol/server"
import { log } from "../log.ts"
import { getOperations } from "../fhir/model/operations.ts"
import { getTokenResponse } from "../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../fhir/auth/scopes.ts"
import { filterOperationsByMetadata, filterOperationsByScopes, getSkippedOperations as _getSkippedOperations } from "./guards/operate.ts"
import { addOperate } from "./tools/operate.ts"

let enabledOps: OperationDefinition[] = []

/** Returns the currently enabled operation definitions (post-gating). */
export const getEnabledOperations = (): OperationDefinition[] => enabledOps

/** Returns skipped operations with reasons — for capabilities output. */
export const getSkippedOperations = (): Array<{ key: string, reason: string, gate: "metadata" | "scope" }> =>
   _getSkippedOperations()

/** Runs operation gating (metadata + scope) and caches the enabled set. Safe to call before server construction. */
export const resolveEnabledOperations = (): OperationDefinition[] => {
   const
      all = getOperations(),
      scopeMap = parseGrantedScopes(getTokenResponse().scope),
      afterMeta = filterOperationsByMetadata(all),
      afterScope = filterOperationsByScopes(afterMeta, scopeMap)

   enabledOps = afterScope
   return enabledOps
}

/** Registers the operate tool if at least one operation is enabled after gating. */
export const registerOperations = (server: McpServer): void => {
   const ops = enabledOps.length > 0 ? enabledOps : resolveEnabledOperations()

   if (ops.length === 0) {
      log.info("📋 No FHIR operations enabled — operate tool not registered")
      return
   }

   log.info(`📋 Registering operate tool with ${ops.length} operation(s): ${ops.map((o) => o.key).join(", ")}`)
   addOperate(server, ops)
}
