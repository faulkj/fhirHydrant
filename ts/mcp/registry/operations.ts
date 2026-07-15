import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server"
import { log, buildLog } from "../../log.ts"
import { getOperations } from "../../fhir/model/operations.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../../fhir/auth/scopes.ts"
import { getDecision, getMutable } from "../authz/context.ts"
import { filterOperationsByMetadata, filterOperationsByScopes, getSkippedOperations as _getSkippedOperations } from "../guards/operate.ts"
import { addOperate } from "../tools/operate.ts"

let enabledOps: OperationDefinition[] = []

/** Returns the currently enabled operation definitions (post-gating) — per request when authz is on. */
export const getEnabledOperations = (): OperationDefinition[] =>
   getMutable()?.enabledOps ?? enabledOps

/** Returns skipped operations with reasons — for capabilities output. */
export const getSkippedOperations = (): Array<{ key: string, reason: string, gate: "metadata" | "scope" }> =>
   _getSkippedOperations()

/** Runs operation gating (metadata + scope + authz operation roles) and caches the enabled set. */
export const resolveEnabledOperations = (): OperationDefinition[] => {
   const
      all = getOperations(),
      scopeMap = parseGrantedScopes(getTokenResponse().scope),
      decision = getDecision(),
      afterMeta = filterOperationsByMetadata(all),
      afterScope = filterOperationsByScopes(afterMeta, scopeMap),
      afterRoles = decision && !decision.admin && decision.operations
         ? afterScope.filter((o) => decision.operations!.has(o.key.toLowerCase()))
         : afterScope,
      mutable = getMutable()

   mutable ? (mutable.enabledOps = afterRoles) : (enabledOps = afterRoles)
   return afterRoles
}

/** Registers the operate tool if at least one operation is enabled after gating; returns zero or one handle. */
export const registerOperations = (server: McpServer): RegisteredTool[] => {
   const ops = getEnabledOperations()

   if (ops.length === 0) {
      log.info("📋 No FHIR operations enabled — operate tool not registered")
      return []
   }

   buildLog("operate", `📋 Registering operate tool with ${ops.length} operation(s): ${ops.map((o) => o.key).join(", ")}`)
   return [addOperate(server, ops)]
}
